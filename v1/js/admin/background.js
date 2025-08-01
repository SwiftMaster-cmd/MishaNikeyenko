window.addEventListener('DOMContentLoaded', () => {
  const body = document.body;

  const maxShiftPercent = 5;
  const maxParticleShiftPx = 15;

  window.addEventListener('mousemove', (e) => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const xNorm = e.clientX / w;
    const yNorm = e.clientY / h;

    const starPos1 = `${25 + (xNorm - 0.5) * maxShiftPercent}% ${30 + (yNorm - 0.5) * maxShiftPercent}%`;
    const starPos2 = `${70 - (xNorm - 0.5) * maxShiftPercent}% ${70 - (yNorm - 0.5) * maxShiftPercent}%`;
    const starPos3 = `${85 + (xNorm - 0.5) * (maxShiftPercent * 0.6)}% ${20 + (yNorm - 0.5) * (maxShiftPercent * 0.6)}%`;

    body.style.setProperty('--star-bg-pos1', starPos1);
    body.style.setProperty('--star-bg-pos2', starPos2);
    body.style.setProperty('--star-bg-pos3', starPos3);

    const pShiftX1 = (xNorm - 0.5) * maxParticleShiftPx;
    const pShiftY1 = (yNorm - 0.5) * maxParticleShiftPx;

    const pShiftX2 = -(xNorm - 0.5) * maxParticleShiftPx * 0.7;
    const pShiftY2 = -(yNorm - 0.5) * maxParticleShiftPx * 0.7;

    const pShiftX3 = (xNorm - 0.5) * maxParticleShiftPx * 1.1;
    const pShiftY3 = -(yNorm - 0.5) * maxParticleShiftPx * 1.1;

    body.style.setProperty('--star-particles-pos1', `${pShiftX1}px ${pShiftY1}px`);
    body.style.setProperty('--star-particles-pos2', `${pShiftX2}px ${pShiftY2}px`);
    body.style.setProperty('--star-particles-pos3', `${pShiftX3}px ${pShiftY3}px`);
  });

  window.addEventListener('mouseleave', () => {
    body.style.setProperty('--star-bg-pos1', '25% 30%');
    body.style.setProperty('--star-bg-pos2', '70% 70%');
    body.style.setProperty('--star-bg-pos3', '85% 20%');
    body.style.setProperty('--star-particles-pos1', '0 0');
    body.style.setProperty('--star-particles-pos2', '0 0');
    body.style.setProperty('--star-particles-pos3', '0 0');
  });
});