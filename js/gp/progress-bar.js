// gp-ui-progress.js
(function(global){
  function createProgressHeader(parentEl, DASHBOARD_URL) {
    const header = document.createElement("header");
    header.setAttribute("style", "display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid #ccc;");
    header.innerHTML = `
      <a id="backToDash" href="${DASHBOARD_URL}" style="font-weight:bold;font-size:18px;color:#333;text-decoration:none;">
        ← Dashboard
      </a>
      <div style="flex-grow:1;max-width:360px;margin-left:20px;">
        <label for="progressBar" style="font-weight:bold;font-size:14px;color:#555;">
          Progress: <span id="progressLabel">0%</span>
        </label>
        <progress id="progressBar" value="0" max="100" style="width:100%;height:18px;border-radius:8px;"></progress>
      </div>
    `;
    parentEl.appendChild(header);
    header.querySelector("#backToDash").addEventListener("click", e => {
      if (e.metaKey||e.ctrlKey||e.shiftKey||e.altKey) return;
      e.preventDefault();
      window.location.href = DASHBOARD_URL;
    });
  }

  function updateTotalPoints() {
    const answers = global.answers||{};
    const staticQuestions = global.staticQuestions||[];
    const maxPts = staticQuestions.reduce((s,q)=>s+q.weight,0) + 8 + 7 + 25;
    const totPts = Object.values(answers).reduce((s,a)=>s+a.points,0);
    const pct    = Math.min(100, Math.round(totPts/maxPts*100));
    document.getElementById("progressLabel").textContent = `${pct}%`;
    document.getElementById("progressBar").value = pct;
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