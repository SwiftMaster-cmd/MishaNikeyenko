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
this.baseSize = 270 + Math.random() * 120;
      this.color = colors[Math.floor(Math.random() * colors.length)];
      this.offset = Math.random(); // phase shift so they don't all pulse together
      this.life = 0;
    }
    update() {
      this.x += this.vx;
      this.y += this.vy;
      this.life += 0.002;

      // bounce back softly at edges
      if (this.x < 0 || this.x > W) this.vx *= -1;
      if (this.y < 0 || this.y > H) this.vy *= -1;
    }
    draw() {
      const cycle = (Math.sin((this.life + this.offset) * Math.PI * 2) + 1) / 2;
      const radius = this.baseSize * (1.2 + 0.6 * cycle);
      const alpha = 0.25 * cycle;

      const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, radius);
      grad.addColorStop(0, this.color.replace(',1)', `,${alpha})`));
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

    const count = Math.round((W * H) / 12000); // slightly denser
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