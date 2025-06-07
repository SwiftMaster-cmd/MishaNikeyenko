// 🔹 debugConsole.js – Enhanced UI + features for in-page console and debug overlay

const LOG_STORAGE_KEY = "assistantDebugLog";

// Persistent log helpers
function loadPersistedLogs() {
  try {
    const logs = JSON.parse(localStorage.getItem(LOG_STORAGE_KEY) || "[]");
    return Array.isArray(logs) ? logs : [];
  } catch {
    return [];
  }
}
function saveLogs(logArray) {
  localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(logArray));
}

// Add and persist a new log
window.debugLog = function (...args) {
  const logs = loadPersistedLogs();
  const msg = args.map(a =>
    typeof a === "object" ? JSON.stringify(a, null, 2) : a
  ).join(" ");
  const logEntry = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logs.push(logEntry);
  saveLogs(logs);

  const el = document.getElementById("onscreen-console-messages");
  if (el) {
    const line = document.createElement("div");
    line.className = "debug-line";
    line.textContent = logEntry;
    el.appendChild(line);
    if (window.autoScrollConsole) {
      el.parentElement.scrollTop = el.parentElement.scrollHeight;
    }
  }
};

window.clearDebugLog = function () {
  localStorage.removeItem(LOG_STORAGE_KEY);
  const el = document.getElementById("onscreen-console-messages");
  if (el) el.innerHTML = "";
};

window.exportDebugLog = function () {
  const logs = loadPersistedLogs();
  const blob = new Blob([logs.join("\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `assistant-logs-${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
};

// === On-screen Console ===
(function () {
  window.autoScrollConsole = true;

  const css = `
    .debug-line {
      margin-bottom: 4px;
      padding: 4px 8px;
      background: rgba(255,255,255,0.05);
      border-radius: 6px;
      cursor: pointer;
    }
    .debug-line:hover {
      background: rgba(255,255,255,0.15);
    }
    .glass-console {
      backdrop-filter: blur(16px);
      background: rgba(30, 30, 40, 0.85);
      border: 1px solid rgba(255,255,255,0.1);
    }
    .glass-btn {
      background: #444;
      color: #fff;
      padding: 6px 12px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
    }
    .glass-btn:hover {
      background: #666;
    }
    #console-toggle-btn {
      font-family: 'Inter', sans-serif;
      font-size: 13px;
    }
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  // Button
  if (!document.getElementById('console-toggle-btn')) {
    const btn = document.createElement("button");
    btn.id = "console-toggle-btn";
    btn.textContent = "Console";
    btn.className = "glass-btn";
    btn.style.cssText = `
      position:fixed; bottom:18px; left:18px; z-index:99999;
      box-shadow:0 2px 6px #0006;
    `;
    document.body.appendChild(btn);
  }

  // Panel
  if (!document.getElementById('onscreen-console')) {
    const panel = document.createElement("div");
    panel.id = "onscreen-console";
    panel.className = "glass-console";
    panel.style.cssText = `
      position:fixed; bottom:60px; left:12px; width:95vw; max-width:560px;
      max-height:35vh; overflow-y:auto; padding:12px 14px; border-radius:14px;
      z-index:99998; display:none; font-family:Menlo, monospace; font-size:13px;
    `;
    const inner = document.createElement("div");
    inner.id = "onscreen-console-messages";
    panel.appendChild(inner);

    const controls = document.createElement("div");
    controls.style.cssText = "margin-top:10px; display:flex; gap:8px; flex-wrap:wrap;";
    ["Clear", "Export", "Overlay", "Scroll?"].forEach((label, i) => {
      const b = document.createElement("button");
      b.className = "glass-btn";
      b.textContent = label;
      b.onclick = () => {
        if (label === "Clear") window.clearDebugLog();
        if (label === "Export") window.exportDebugLog();
        if (label === "Overlay") window.showDebugOverlay();
        if (label === "Scroll?") window.autoScrollConsole = !window.autoScrollConsole;
      };
      controls.appendChild(b);
    });
    panel.appendChild(controls);
    document.body.appendChild(panel);
  }

  // Toggle logic
  const btn = document.getElementById("console-toggle-btn");
  const panel = document.getElementById("onscreen-console");
  if (btn && panel) {
    btn.onclick = () => {
      const show = panel.style.display !== "block";
      panel.style.display = show ? "block" : "none";
      if (show) {
        const el = document.getElementById("onscreen-console-messages");
        el.innerHTML = "";
        loadPersistedLogs().forEach(msg => {
          const div = document.createElement("div");
          div.className = "debug-line";
          div.textContent = msg;
          el.appendChild(div);
        });
        el.parentElement.scrollTop = el.parentElement.scrollHeight;
      }
    };
  }

  // Copy to clipboard on click
  document.addEventListener("click", (e) => {
    if (e.target.classList.contains("debug-line")) {
      navigator.clipboard.writeText(e.target.textContent);
      e.target.style.background = "#32cd3277";
      setTimeout(() => e.target.style.background = "", 500);
    }
  });
})();

// === Full-Screen Debug Overlay ===
window.showDebugOverlay = function () {
  let overlay = document.getElementById("debug-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "debug-overlay";
    overlay.style.cssText = `
      position:fixed;top:0;left:0;width:100vw;height:100vh;
      background:rgba(0,0,0,0.9);color:#fff;z-index:100000;display:flex;
      justify-content:center;align-items:center;flex-direction:column;
      font-family:Menlo,monospace;padding:24px;
    `;
    const box = document.createElement("div");
    box.style.cssText = `
      max-height:80vh;width:90vw;max-width:700px;overflow:auto;
      white-space:pre-wrap;padding:20px;border-radius:12px;
      background:#1e1e2e;color:#f8fafd;border:1px solid #2e2e3e;
    `;
    box.id = "debug-content";
    overlay.appendChild(box);

    const btn = document.createElement("button");
    btn.textContent = "Close";
    btn.className = "glass-btn";
    btn.style.marginTop = "16px";
    btn.onclick = () => overlay.remove();
    overlay.appendChild(btn);
    document.body.appendChild(overlay);
  }

  const logs = loadPersistedLogs();
  document.getElementById("debug-content").textContent = logs.join("\n");
  overlay.style.display = "flex";
};