
(() => {
  const canvas = document.getElementById('bg-canvas');
  const ctx = canvas.getContext('2d');
  let W, H, particles;

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
      this.vx = (Math.random() - 0.5) * 0.15;
      this.vy = (Math.random() - 0.5) * 0.15;
      this.baseSize = 180 + Math.random() * 120;
      this.color = colors[Math.floor(Math.random() * colors.length)];
      this.offset = Math.random();
      this.life = 0;
      this.wiggleFreq = 0.5 + Math.random();
      this.wiggleAmp = 0.1 + Math.random() * 0.2;
    }
    update() {
      const t = this.life * Math.PI * 2;

      // Organic drift and velocity oscillation
      const wiggleX = Math.cos(t * this.wiggleFreq) * this.wiggleAmp;
      const wiggleY = Math.sin(t * this.wiggleFreq) * this.wiggleAmp;

      const speedMod = 0.6 + 0.4 * Math.sin(this.life * Math.PI * 2);
      this.x += (this.vx + wiggleX) * speedMod;
      this.y += (this.vy + wiggleY) * speedMod;

      // Reflect off edges with slight chaos
      if (this.x < 0 || this.x > W) this.vx *= -1 + (Math.random() - 0.5) * 0.2;
      if (this.y < 0 || this.y > H) this.vy *= -1 + (Math.random() - 0.5) * 0.2;

      this.life += 0.002;
      if (this.life > 1) this.life = 0;
    }
    draw() {
      const cycle = (Math.sin((this.life + this.offset) * Math.PI * 2) + 1) / 2;
      const radius = this.baseSize * (1.2 + 0.6 * cycle);
      const alpha = 0.25 * cycle;

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

    const count = Math.round((W * H) / 40000);
    particles = Array.from({ length: count }, () => new Particle());
  }

  function animate() {
    ctx.clearRect(0, 0, W, H);
    particles.forEach(p => {
      p.update();
      p.draw();
    });
    requestAnimationFrame(animate);
  }

  window.addEventListener('resize', onResize);
  onResize();
  animate();
})();
