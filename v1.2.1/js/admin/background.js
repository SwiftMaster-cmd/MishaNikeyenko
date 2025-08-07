window.addEventListener('DOMContentLoaded', () => {
  const body = document.body;

  const maxShiftPercent = 7;    // Slightly bigger range for bg
  const maxParticleShiftPx = 20; // Bigger particle shift

  // Current target positions
  const target = {
    bg1: { x: 25, y: 30 },
    bg2: { x: 70, y: 70 },
    bg3: { x: 85, y: 20 },

    p1x: 0, p1y: 0,
    p2x: 0, p2y: 0,
    p3x: 0, p3y: 0,
  };

  // Current interpolated positions (start at default)
  const current = {
    bg1: { x: 25, y: 30 },
    bg2: { x: 70, y: 70 },
    bg3: { x: 85, y: 20 },

    p1x: 0, p1y: 0,
    p2x: 0, p2y: 0,
    p3x: 0, p3y: 0,
  };

  // Ease factor for smooth lerp [0..1], smaller = slower
  const ease = 0.1;

  function lerp(start, end, t) {
    return start + (end - start) * t;
  }

  // Update CSS vars from current positions
  function applyPositions() {
    body.style.setProperty('--star-bg-pos1', `${current.bg1.x}% ${current.bg1.y}%`);
    body.style.setProperty('--star-bg-pos2', `${current.bg2.x}% ${current.bg2.y}%`);
    body.style.setProperty('--star-bg-pos3', `${current.bg3.x}% ${current.bg3.y}%`);
    body.style.setProperty('--star-particles-pos1', `${current.p1x}px ${current.p1y}px`);
    body.style.setProperty('--star-particles-pos2', `${current.p2x}px ${current.p2y}px`);
    body.style.setProperty('--star-particles-pos3', `${current.p3x}px ${current.p3y}px`);
  }

  // Animate loop for smooth interpolation
  function animate() {
    // Lerp all positions toward targets
    current.bg1.x = lerp(current.bg1.x, target.bg1.x, ease);
    current.bg1.y = lerp(current.bg1.y, target.bg1.y, ease);
    current.bg2.x = lerp(current.bg2.x, target.bg2.x, ease);
    current.bg2.y = lerp(current.bg2.y, target.bg2.y, ease);
    current.bg3.x = lerp(current.bg3.x, target.bg3.x, ease);
    current.bg3.y = lerp(current.bg3.y, target.bg3.y, ease);

    current.p1x = lerp(current.p1x, target.p1x, ease);
    current.p1y = lerp(current.p1y, target.p1y, ease);
    current.p2x = lerp(current.p2x, target.p2x, ease);
    current.p2y = lerp(current.p2y, target.p2y, ease);
    current.p3x = lerp(current.p3x, target.p3x, ease);
    current.p3y = lerp(current.p3y, target.p3y, ease);

    applyPositions();

    requestAnimationFrame(animate);
  }

  // Initial call to start animation loop
  animate();

  // Update target positions on mouse move
  window.addEventListener('mousemove', (e) => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const xNorm = e.clientX / w;
    const yNorm = e.clientY / h;

    target.bg1.x = 25 + (xNorm - 0.5) * maxShiftPercent;
    target.bg1.y = 30 + (yNorm - 0.5) * maxShiftPercent;

    target.bg2.x = 70 - (xNorm - 0.5) * maxShiftPercent;
    target.bg2.y = 70 - (yNorm - 0.5) * maxShiftPercent;

    target.bg3.x = 85 + (xNorm - 0.5) * (maxShiftPercent * 0.7);
    target.bg3.y = 20 + (yNorm - 0.5) * (maxShiftPercent * 0.7);

    target.p1x = (xNorm - 0.5) * maxParticleShiftPx;
    target.p1y = (yNorm - 0.5) * maxParticleShiftPx;

    target.p2x = -(xNorm - 0.5) * maxParticleShiftPx * 0.8;
    target.p2y = -(yNorm - 0.5) * maxParticleShiftPx * 0.8;

    target.p3x = (xNorm - 0.5) * maxParticleShiftPx * 1.2;
    target.p3y = -(yNorm - 0.5) * maxParticleShiftPx * 1.2;
  });

  // Smoothly return to default on mouse leave
  window.addEventListener('mouseleave', () => {
    target.bg1.x = 25;
    target.bg1.y = 30;
    target.bg2.x = 70;
    target.bg2.y = 70;
    target.bg3.x = 85;
    target.bg3.y = 20;
    target.p1x = 0;
    target.p1y = 0;
    target.p2x = 0;
    target.p2y = 0;
    target.p3x = 0;
    target.p3y = 0;
  });
});