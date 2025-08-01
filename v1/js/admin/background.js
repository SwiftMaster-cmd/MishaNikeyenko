// JS to create subtle "magnetize" effect on starry background
// It moves star gradients and particles slightly toward mouse position

(function () {
  const body = document.body;

  // Limit how far stars shift (in % for gradients, px for particles)
  const maxShiftPercent = 5;
  const maxParticleShiftPx = 15;

  // On mouse move, update CSS variables controlling star positions
  window.addEventListener("mousemove", (e) => {
    const w = window.innerWidth;
    const h = window.innerHeight;

    // Normalize cursor position (0 to 1)
    const xNorm = e.clientX / w;
    const yNorm = e.clientY / h;

    // Calculate new positions for each star gradient layer (as percentages)
    const starPos1 = `${25 + (xNorm - 0.5) * maxShiftPercent}% ${30 + (yNorm - 0.5) * maxShiftPercent}%`;
    const starPos2 = `${70 - (xNorm - 0.5) * maxShiftPercent}% ${70 - (yNorm - 0.5) * maxShiftPercent}%`;
    const starPos3 = `${85 + (xNorm - 0.5) * (maxShiftPercent * 0.6)}% ${20 + (yNorm - 0.5) * (maxShiftPercent * 0.6)}%`;

    // Apply CSS variables for star radial gradients
    body.style.setProperty("--star-bg-pos1", starPos1);
    body.style.setProperty("--star-bg-pos2", starPos2);
    body.style.setProperty("--star-bg-pos3", starPos3);

    // Calculate particle background shifts (in pixels)
    const pShiftX1 = (xNorm - 0.5) * maxParticleShiftPx;
    const pShiftY1 = (yNorm - 0.5) * maxParticleShiftPx;

    const pShiftX2 = -(xNorm - 0.5) * maxParticleShiftPx * 0.7;
    const pShiftY2 = -(yNorm - 0.5) * maxParticleShiftPx * 0.7;

    const pShiftX3 = (xNorm - 0.5) * maxParticleShiftPx * 1.1;
    const pShiftY3 = -(yNorm - 0.5) * maxParticleShiftPx * 1.1;

    // Apply CSS variables for particle background positions
    body.style.setProperty("--star-particles-pos1", `${pShiftX1}px ${pShiftY1}px`);
    body.style.setProperty("--star-particles-pos2", `${pShiftX2}px ${pShiftY2}px`);
    body.style.setProperty("--star-particles-pos3", `${pShiftX3}px ${pShiftY3}px`);
  });

  // Optional: Reset positions on mouse leave for smooth fallback
  window.addEventListener("mouseleave", () => {
    body.style.setProperty("--star-bg-pos1", "25% 30%");
    body.style.setProperty("--star-bg-pos2", "70% 70%");
    body.style.setProperty("--star-bg-pos3", "85% 20%");
    body.style.setProperty("--star-particles-pos1", "0 0");
    body.style.setProperty("--star-particles-pos2", "0 0");
    body.style.setProperty("--star-particles-pos3", "0 0");
  });
})();