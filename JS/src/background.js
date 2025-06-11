(() => {
  const canvas = document.getElementById('bg-canvas');
  const ctx = canvas.getContext('2d');
  let W, H, particles;
  let lastTimestamp = 0;

  const colors = [
    'rgba(191,82,255,1)',  // violet
    'rgba(255,105,180,1)', // pink
    'rgba(64,128,255,1)'   // soft blue
  ];

  class Particle {
    constructor() {
      this.init();
    }

    init() {
      this.x = Math.random() * W;
      this.y = Math.random() * H;
      this.vx = (Math.random() - 0.5) * 0.1;
      this.vy = (Math.random() - 0.5) * 0.1;
      this.baseSize = 160 + Math.random() * 100;
      this.color = colors[Math.floor(Math.random() * colors.length)];
      this.offset = Math.random();
      this.life = 0;
      this.wiggleFreq = 0.4 + Math.random();
      this.wiggleAmp = 0.08 + Math.random() * 0.15;
    }

    update(delta) {
      const t = this.life * Math.PI * 2;
      const wiggleX = Math.cos(t * this.wiggleFreq) * this.wiggleAmp;
      const wiggleY = Math.sin(t * this.wiggleFreq) * this.wiggleAmp;

      const speedMod = 0.5 + 0.5 * Math.sin(this.life * Math.PI * 2);
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
      const easedCycle = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2); // smooth pulse

      const radius = this.baseSize * (1 + 0.3 * easedCycle);
      const alpha = 0.18 * easedCycle;

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
    W = canvas.width = window.innerWidth * ratio;
    H = canvas.height = window.innerHeight * ratio;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    const count = Math.round((W * H) / 50000);
    particles = Array.from({ length: count }, () => new Particle());
  }

  function animate(timestamp) {
    const delta = timestamp - lastTimestamp;
    lastTimestamp = timestamp;

    ctx.clearRect(0, 0, W, H);
    particles.forEach(p => {
      p.update(delta);
      p.draw();
    });

    requestAnimationFrame(animate);
  }

  window.addEventListener('resize', onResize);
  onResize();
  requestAnimationFrame(animate);
})();