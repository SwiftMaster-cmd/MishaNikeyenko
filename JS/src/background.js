(() => {
  const canvas = document.getElementById('bg-canvas');
  const ctx = canvas.getContext('2d');
  let W, H, particles;

  const colors = [
    'rgba(191,82,255,0.4)',  // violet
    'rgba(255,105,180,0.4)', // pink
    'rgba(64,128,255,0.4)'   // soft blue
  ];

  class Particle {
    constructor() {
      this.reset();
    }
    reset() {
      this.x = Math.random() * W;
      this.y = Math.random() * H;
      this.vx = (Math.random() - 0.5) * 0.25;
      this.vy = (Math.random() - 0.5) * 0.25;
      this.baseSize = 20 + Math.random() * 30;
      this.life = Math.random();
      this.color = colors[Math.floor(Math.random() * colors.length)];
    }
    update() {
      this.x += this.vx;
      this.y += this.vy;
      this.life += 0.002;
      if (this.x < -50 || this.x > W + 50 || this.y < -50 || this.y > H + 50 || this.life > 1) {
        this.reset();
        this.life = 0;
      }
    }
    draw() {
      const pulse = Math.sin(this.life * Math.PI) * 0.5 + 0.5;
      const radius = this.baseSize * pulse;
      const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, radius);
      grad.addColorStop(0, this.color.replace('0.4', '0.25'));
      grad.addColorStop(1, this.color.replace('0.4', '0'));

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

    const count = Math.round((W * H) / 14000); // denser than before
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