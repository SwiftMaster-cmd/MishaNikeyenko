// progress-bar.js
(function(global) {
  function render(parentEl, dashboardUrl) {
    const header = document.createElement('header');
    header.className = 'guest-header';
    header.style = 'display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid #ccc;';
    header.innerHTML = `
      <a id="backToDash" href="${dashboardUrl}" style="font-weight:bold;font-size:18px;color:#333;text-decoration:none;">
        ← Dashboard
      </a>
      <div style="flex-grow:1;max-width:360px;margin-left:20px;">
        <label for="progressBar" style="font-weight:bold;font-size:14px;color:#555;">
          Progress: <span id="progressLabel">0%</span>
        </label>
        <progress id="progressBar" value="0" max="100" style="width:100%;height:18px;border-radius:8px;"></progress>
      </div>
    `;
    header.querySelector('#backToDash').addEventListener('click', e => {
      if (!(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)) {
        e.preventDefault();
        window.location.href = dashboardUrl;
      }
    });
    parentEl.prepend(header);
  }

  function update(pct) {
    const lbl = document.getElementById('progressLabel');
    const bar = document.getElementById('progressBar');
    if (lbl) lbl.textContent = `${pct}%`;
    if (bar) bar.value = pct;
  }

  function updatePitch(answers) {
    let pitch = 'Customer Info Summary:\n';
    for (const [id, { value }] of Object.entries(answers)) {
      if (value) {
        const label = getLabel(id);
        pitch += `${label}: ${value}\n`;
      }
    }
    const sol = document.getElementById('solutionText');
    if (sol && !sol.value.trim()) sol.value = pitch.trim();
  }

  function getLabel(id) {
    if (id === 'custName') return 'Customer Name';
    if (id === 'custPhone') return 'Customer Phone';
    if (id === 'solutionText') return 'Proposed Solution';
    const q = (global.gpQuestions||[]).find(x=>x.id===id);
    return q ? q.label : id;
  }

  global.ProgressBar = { render, update, updatePitch };
})(window);