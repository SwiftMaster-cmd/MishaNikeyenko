// background.js – Particle system with upward "magic" bursts from a DOM element

(() => {
  const canvas = document.getElementById('bg-canvas');
  const ctx    = canvas.getContext('2d');
  let W, H, particles = [], lastTimestamp = 0;
  const ambientCount = () => Math.round((W * H) / 50000);

  // Queue for burst events: { x, y, count }
  const bursts = [];

  const colors = [
    'rgba(191,82,255,1)',   // violet
    'rgba(255,105,180,1)',  // pink
    'rgba(64,128,255,1)'    // soft blue
  ];

  class Particle {
    constructor(x, y, vx, vy, sizeBase, color) {
      this.x = x; this.y = y;
      this.vx = vx; this.vy = vy;
      this.baseSize = sizeBase;
      this.color = color;
      this.life = 0;
      this.maxLife = 60 + Math.random() * 30;  // frames
    }

    update() {
      this.x += this.vx;
      this.y += this.vy;
      this.vy += 0.05;            // gravity-like slow down
      this.life++;
    }

    draw() {
      const t = this.life / this.maxLife;
      const size = this.baseSize * (1 - t);
      const alpha = (1 - t) * 0.8;
      const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, size);
      grad.addColorStop(0, this.color.replace(',1)', `,${alpha})`));
      grad.addColorStop(1, this.color.replace(',1)', ',0)'));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(this.x, this.y, size, 0, Math.PI * 2);
      ctx.fill();
    }

    isDead() {
      return this.life >= this.maxLife;
    }
  }

  function onResize() {
    const ratio = window.devicePixelRatio || 1;
    W = canvas.width  = window.innerWidth * ratio;
    H = canvas.height = window.innerHeight * ratio;
    canvas.style.width  = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    // regenerate ambient particles
    particles = particles.filter(p => false); // clear
    for (let i = 0; i < ambientCount(); i++) {
      const x = Math.random() * W;
      const y = Math.random() * H;
      particles.push(new Particle(
        x, y,
        (Math.random() - 0.5) * 0.2,   // slow drift
        (Math.random() - 0.5) * 0.2,
        100 + Math.random() * 50,
        colors[Math.floor(Math.random() * colors.length)]
      ));
    }
  }

  function animate() {
    ctx.clearRect(0, 0, W, H);

    // spawn bursts
    bursts.forEach((b, i) => {
      const spawn = Math.min(b.count, 5);
      for (let j = 0; j < spawn; j++) {
        const angle = -Math.PI/2 + (Math.random() - 0.5) * 0.6; // upward cone
        const speed = 2 + Math.random() * 1.5;
        particles.push(new Particle(
          b.x, b.y,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          8 + Math.random() * 4,
          colors[Math.floor(Math.random() * colors.length)]
        ));
        b.count--;
      }
      if (b.count <= 0) bursts.splice(i, 1);
    });

    // update & draw
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.update();
      p.draw();
      if (p.isDead()) particles.splice(i, 1);
    }

    requestAnimationFrame(animate);
  }

  // --- API for triggering bursts from a button ---
  window.triggerMagicFromElement = (elementId, amount = 30) => {
    const el = document.getElementById(elementId);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // position at center-top of element
    const x = rect.left + rect.width / 2;
    const y = rect.top;
    bursts.push({ x, y, count: amount });
  };

  // Convenience aliases for send/receive
  window.triggerMagicOnSend    = () => window.triggerMagicFromElement('send-button', 25);
  window.triggerMagicOnReceive = () => window.triggerMagicFromElement('send-button', 40);

  window.addEventListener('resize', onResize);
  onResize();
  animate();
})();