// background.js
(() => {
  const canvas = document.getElementById('bg-canvas');
  const ctx = canvas.getContext('2d');
  let W, H, particles;

  // Particle constructor
  class Particle {
    constructor() {
      this.reset();
    }
    reset() {
      this.x = Math.random() * W;
      this.y = Math.random() * H;
      this.vx = (Math.random() - 0.5) * 0.2;
      this.vy = (Math.random() - 0.5) * 0.2;
      this.size = 1 + Math.random() * 2;
      this.alpha = 0.1 + Math.random() * 0.15;
    }
    update() {
      this.x += this.vx;
      this.y += this.vy;
      if (this.x < -10 || this.x > W + 10 || this.y < -10 || this.y > H + 10) {
        this.reset();
      }
    }
    draw() {
      const grad = ctx.createRadialGradient(
        this.x, this.y, 0,
        this.x, this.y, this.size * 6
      );
      grad.addColorStop(0, `rgba(255,255,255,${this.alpha * 0.4})`);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size * 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Resize handler
  function onResize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
    // create ~1 particle per 20,000px²
    const count = Math.round((W * H) / 20000);
    particles = Array.from({ length: count }, () => new Particle());
  }

  // Animation loop
  function animate() {
    ctx.clearRect(0, 0, W, H);
    particles.forEach(p => {
      p.update();
      p.draw();
    });
    requestAnimationFrame(animate);
  }

  // Initialize
  window.addEventListener('resize', onResize);
  onResize();
  animate();
})();