// background.js – Blob background that reacts to clicks on messages

(() => {
  const canvas = document.getElementById('bg-canvas');
  const ctx = canvas.getContext('2d');
  let W, H, particles = [];
  let lastTs = 0;

  const config = {
    particleDensity: 1 / 50000,
    maxSpeed: 0.15,
    sizeRange: [120, 200],
    wiggle: { freq: [0.4, 1.4], amp: [0.08, 0.23] },
    alphaBase: 0.18,
    hueShiftSpeed: 0.0001,
    clickReactionDuration: 500,   // ms of attraction after click
    clickStrength: 0.1            // how strongly particles are pulled
  };

  let pointer = { x: null, y: null, active: false };

  // Only activate pointer attraction on clicks within a message
  document.getElementById('chat-log')?.addEventListener('click', e => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.active = true;
    setTimeout(() => { pointer.active = false; }, config.clickReactionDuration);
  });

  class Particle {
    constructor() { this.init(); }
    init() {
      this.x = Math.random() * W;
      this.y = Math.random() * H;
      this.vx = (Math.random() - 0.5) * config.maxSpeed;
      this.vy = (Math.random() - 0.5) * config.maxSpeed;
      this.baseSize = config.sizeRange[0] + Math.random() * (config.sizeRange[1] - config.sizeRange[0]);
      this.life = Math.random();
      this.offset = Math.random();
      this.wf = config.wiggle.freq[0] + Math.random() * (config.wiggle.freq[1] - config.wiggle.freq[0]);
      this.wa = config.wiggle.amp[0]  + Math.random() * (config.wiggle.amp[1] - config.wiggle.amp[0]);
      this.hue = Math.random() * 360;
    }
    update(dt) {
      const wigX = Math.cos(this.life * Math.PI * 2 * this.wf) * this.wa;
      const wigY = Math.sin(this.life * Math.PI * 2 * this.wf) * this.wa;

      if (pointer.active) {
        const dx = pointer.x - this.x, dy = pointer.y - this.y;
        const dist = Math.hypot(dx, dy) || 1;
        const force = config.clickStrength * dt * 0.001;
        this.vx += (dx / dist) * force;
        this.vy += (dy / dist) * force;
      }

      this.vx *= 0.99; this.vy *= 0.99;
      this.x += (this.vx + wigX) * dt * 0.01;
      this.y += (this.vy + wigY) * dt * 0.01;

      if (this.x < 0 || this.x > W) this.vx *= -1;
      if (this.y < 0 || this.y > H) this.vy *= -1;

      this.life = (this.life + dt * 0.0002) % 1;
      this.hue = (this.hue + config.hueShiftSpeed * dt) % 360;
    }
    draw() {
      const phase = (this.life + this.offset) % 1;
      const pulse = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
      const radius = this.baseSize * (1 + 0.3 * pulse);
      const alpha = config.alphaBase * pulse;
      const color = `hsla(${this.hue},70%,60%,${alpha})`;

      const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, radius);
      grad.addColorStop(0, color);
      grad.addColorStop(0.5, color.replace(/[\d\.]+\)$/, '0.5)'));
      grad.addColorStop(1, color.replace(/[\d\.]+\)$/, '0)'));

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(this.x, this.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function onResize() {
    const ratio = window.devicePixelRatio || 1;
    W = canvas.width = window.innerWidth * ratio;
    H = canvas.height = window.innerHeight * ratio;
    canvas.style.width  = window.innerWidth  + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    const count = Math.ceil(W * H * config.particleDensity);
    particles.length = count;
    for (let i = 0; i < count; i++) {
      if (!particles[i]) particles[i] = new Particle();
    }
  }

  function animate(ts) {
    const dt = Math.min(ts - lastTs, 50);
    lastTs = ts;
    ctx.clearRect(0, 0, W, H);
    particles.forEach(p => { p.update(dt); p.draw(); });
    requestAnimationFrame(animate);
  }

  window.addEventListener('resize', onResize);
  onResize();
  requestAnimationFrame(animate);
})();