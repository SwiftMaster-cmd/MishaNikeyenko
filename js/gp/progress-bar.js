// progress-bar.js -- CSS-driven, no inline styles, pure class/ID markup
(function(global){
  function createProgressHeader(parentEl, DASHBOARD_URL) {
    // Remove any existing to avoid duplicates
    const old = document.getElementById('gpProgressHeader');
    if (old) old.remove();

    // Sticky, centered, glassy header (all CSS)
    const header = document.createElement("header");
    header.id = "gpProgressHeader";
    header.className = "gp-progress-header";

    // Inner content: centered bar, link, etc
    header.innerHTML = `
      <a id="backToDash" class="back-to-dash" href="${DASHBOARD_URL}">
        ← Dashboard
      </a>
      <div class="gp-progress-content">
        <label for="progressBar" class="gp-progress-label">
          Progress: <span id="progressLabel" class="gp-progress-label-val">0%</span>
        </label>
        <progress id="progressBar"
          class="gp-progress-bar"
          value="0" max="100">
        </progress>
      </div>
    `;

    // Insert at very top of parentEl (before everything)
    parentEl.prepend(header);

    // Navigation (normal click only)
    header.querySelector("#backToDash").addEventListener("click", e => {
      if (e.metaKey||e.ctrlKey||e.shiftKey||e.altKey) return;
      e.preventDefault();
      window.location.href = DASHBOARD_URL;
    });
  }

  function updateTotalPoints() {
    const answers = global.answers || {};
    const staticQuestions = global.staticQuestions || [];
    const maxPts = staticQuestions.reduce((s,q)=>s+q.weight,0) + 8 + 7 + 25;
    const totPts = Object.values(answers).reduce((s,a)=>s+a.points,0);
    const pct = Math.min(100, Math.round(totPts / maxPts * 100));
    const label = document.getElementById("progressLabel");
    const bar = document.getElementById("progressBar");
    if (label) label.textContent = `${pct}%`;
    if (bar) bar.value = pct;
  }

  function updatePitchText() {
    const answers = global.answers||{};
    let p = "Customer Info Summary:\n";
    Object.entries(answers).forEach(([k,{value}]) => {
      if (value) p += `${global.getLabel(k)}: ${value}\n`;
    });
    const sol = document.getElementById("solutionText");
    if (sol && !sol.value.trim()) sol.value = p.trim();
  }

  global.createProgressHeader = createProgressHeader;
  global.updateTotalPoints    = updateTotalPoints;
  global.updatePitchText      = updatePitchText;
})(window);