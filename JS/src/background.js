// background.js – Particle system with magic bursts & click‐triggered effects

(() => {
  const canvas = document.getElementById('bg-canvas');
  const ctx    = canvas.getContext('2d');
  let W, H, particles = [], lastTimestamp = 0;

  // For automatic bursts and click/receive/send effects
  let magicQueue = 0;
  const magicEvents = []; // { x, y, count }

  const colors = [
    'rgba(191,82,255,1)',   // violet
    'rgba(255,105,180,1)',  // pink
    'rgba(64,128,255,1)'    // soft blue
  ];

  class Particle {
    constructor(x = Math.random() * W, y = Math.random() * H, speedBoost = 1, sizeBase = 160) {
      this.x = x;
      this.y = y;
      this.vx = (Math.random() - 0.5) * 0.1 * speedBoost;
      this.vy = (Math.random() - 0.5) * 0.1 * speedBoost;
      this.baseSize = sizeBase + Math.random() * (sizeBase * 0.6);
      this.color = colors[Math.floor(Math.random() * colors.length)];
      this.offset = Math.random();
      this.life = 0;
      this.wiggleFreq = 0.4 + Math.random();
      this.wiggleAmp  = 0.08 + Math.random() * 0.15;
    }

    update(delta) {
      const t = this.life * Math.PI * 2;
      const wiggleX = Math.cos(t * this.wiggleFreq) * this.wiggleAmp;
      const wiggleY = Math.sin(t * this.wiggleFreq) * this.wiggleAmp;
      const speedMod = 0.5 + 0.5 * Math.sin(t);

      this.vx *= 0.98;
      this.vy *= 0.98;
      this.x += (this.vx + wiggleX) * speedMod;
      this.y += (this.vy + wiggleY) * speedMod;

      if (this.x < 0 || this.x > W) this.vx *= -1 + (Math.random() - 0.5) * 0.1;
      if (this.y < 0 || this.y > H) this.vy *= -1 + (Math.random() - 0.5) * 0.1;

      this.life += delta * 0.0002;
      if (this.life > 1) this.life = 0;
    }

    draw() {
      const phase = (this.life + this.offset) % 1;
      const eased = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
      const radius = this.baseSize * (1 + 0.3 * eased);
      const alpha  = 0.18 * eased;

      const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, radius);
      grad.addColorStop(0, this.color.replace(',1)', `,${alpha})`));
      grad.addColorStop(0.5, this.color.replace(',1)', `,${alpha * 0.5})`));
      grad.addColorStop(1, this.color.replace(',1)', ',0)'));

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(this.x, this.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function onResize() {
    const ratio = window.devicePixelRatio || 1;
    W = canvas.width  = window.innerWidth * ratio;
    H = canvas.height = window.innerHeight * ratio;
    canvas.style.width  = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    // base background density
    const count = Math.round((W * H) / 50000);
    particles = Array.from({ length: count }, () => new Particle());
  }

  function animate(timestamp) {
    const delta = timestamp - lastTimestamp;
    lastTimestamp = timestamp;

    // 1) Handle global magicQueue: random‐origin sparks
    if (magicQueue > 0) {
      const spawn = Math.min(magicQueue, 5);
      for (let i = 0; i < spawn; i++) {
        particles.push(new Particle(
          undefined, undefined, 10, 20  // speedBoost=10, sizeBase=20 for spark look
        ));
        magicQueue--;
      }
    }

    // 2) Handle click/receive/send events
    for (let i = magicEvents.length - 1; i >= 0; i--) {
      const ev = magicEvents[i];
      const burst = Math.min(ev.count, 5);
      for (let j = 0; j < burst; j++) {
        // slight random dispersion around click
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * 30;
        particles.push(new Particle(
          ev.x + Math.cos(angle) * dist,
          ev.y + Math.sin(angle) * dist,
          8, 15
        ));
        ev.count--;
      }
      if (ev.count <= 0) magicEvents.splice(i, 1);
    }

    ctx.clearRect(0, 0, W, H);
    particles.forEach(p => {
      p.update(delta);
      p.draw();
    });

    // prune off‐screen or excess particles
    if (particles.length > 1000) {
      particles.splice(0, particles.length - 800);
    }

    requestAnimationFrame(animate);
  }

  // Expose magic triggers globally:
  window.triggerMagic      = (amount = 30)                => { magicQueue += amount; };
  window.triggerMagicAt    = (x, y, amount = 30)          => { magicEvents.push({ x, y, count: amount }); };
  window.triggerMagicOnSend    = () => window.triggerMagic(25);
  window.triggerMagicOnReceive = () => window.triggerMagic(40);

  window.addEventListener('resize', onResize);
  onResize();
  requestAnimationFrame(animate);
})();