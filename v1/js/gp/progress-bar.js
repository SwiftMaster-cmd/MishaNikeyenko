// progress-bar.js
(function(global){
  function createProgressHeader(parentEl, DASHBOARD_URL) {
    // Remove any existing to avoid duplicates
    const old = document.getElementById('gpProgressHeader');
    if (old) old.remove();

    // Sticky, centered, glassy header
    const header = document.createElement("header");
    header.id = "gpProgressHeader";
    header.setAttribute("style", `
      position: sticky;
      top: 0;
      z-index: 99;
      display: flex;
      justify-content: center;
      align-items: center;
      width: 100vw;
      min-width: 320px;
      background: rgba(247,249,251, 0.88);
      box-shadow: 0 2px 12px rgba(0,0,0,0.06);
      backdrop-filter: blur(7px);
      border-bottom: 1px solid #e0e3ea;
      padding: 18px 0 14px 0;
      margin-bottom: 0;
      transition: background 0.2s;
    `);

    // Inner content: centered bar
    header.innerHTML = `
      <a id="backToDash" href="${DASHBOARD_URL}"
        style="font-weight:bold;font-size:18px;color:#248;opacity:0.8;text-decoration:none;position:absolute;left:36px;top:50%;transform:translateY(-50%);">
        ← Dashboard
      </a>
      <div style="display:flex;flex-direction:column;align-items:center;min-width:320px;max-width:420px;width:100%;">
        <label for="progressBar" style="font-weight:bold;font-size:15px;color:#222;letter-spacing:.01em;margin-bottom:4px;">
          Progress: <span id="progressLabel" style="font-variant-numeric:tabular-nums;">0%</span>
        </label>
        <progress id="progressBar"
          value="0" max="100"
          style="width:100%;height:20px;border-radius:10px;box-shadow:0 1px 8px #b3c3ee28;margin-bottom:0;background:#f6f8fb;">
        </progress>
      </div>
    `;

    // Insert at very top of parentEl (before everything)
    parentEl.prepend(header);

    // Navigation
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