// onscreenConsole.js
(function() {
  // Insert toggle button
  if (!document.getElementById('console-toggle-btn')) {
    const btn = document.createElement("button");
    btn.id = "console-toggle-btn";
    btn.textContent = "Console";
    btn.style.cssText = `
      position:fixed; bottom:18px; left:18px; z-index:99999;
      padding:7px 16px; background:#222a; color:#ffd600; border-radius:16px;
      border:none; font:600 13px/1 'Inter',monospace; cursor:pointer; box-shadow:0 1px 6px #0004;
    `;
    document.body.appendChild(btn);
  }

  // Insert hidden console panel
  if (!document.getElementById('onscreen-console')) {
    const panel = document.createElement("div");
    panel.id = "onscreen-console";
    panel.style.cssText = `
      position:fixed; bottom:60px; left:12px; width:95vw; max-width:560px; max-height:34vh;
      background:rgba(20,20,30,0.98); color:#fff; 
      font:13px/1.4 'Menlo', 'Monaco', 'Consolas', monospace;
      z-index:99999; box-shadow:0 0 30px #0008;
      overflow-y:auto; padding:12px 14px; border-radius:10px;
      border:1.5px solid #444; display:none; pointer-events:auto; user-select:text;
    `;
    const inner = document.createElement("div");
    inner.id = "onscreen-console-messages";
    panel.appendChild(inner);
    document.body.appendChild(panel);
  }

  // Console logic
  window.debugLog = function (...args) {
    const el = document.getElementById("onscreen-console-messages");
    if (!el) return;
    const line = document.createElement("div");
    line.style.marginBottom = "2px";
    line.textContent = args.map(a =>
      (typeof a === "object" ? JSON.stringify(a, null, 2) : a)
    ).join(" ");
    el.appendChild(line);
    el.parentElement.scrollTop = el.parentElement.scrollHeight;
  };

  window.clearDebugLog = function() {
    const el = document.getElementById("onscreen-console-messages");
    if (el) el.innerHTML = "";
  };

  // Show/hide logic
  const consoleBtn = document.getElementById("console-toggle-btn");
  const consolePanel = document.getElementById("onscreen-console");
  if (consoleBtn && consolePanel) {
    consoleBtn.addEventListener("click", () => {
      const isVisible = consolePanel.style.display === "block";
      consolePanel.style.display = isVisible ? "none" : "block";
      if (!isVisible) {
        const el = document.getElementById("onscreen-console-messages");
        el.parentElement.scrollTop = el.parentElement.scrollHeight;
      }
    });
  }
})();