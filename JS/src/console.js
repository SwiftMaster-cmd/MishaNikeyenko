// onscreenConsole.js with persistent logging and utility functions
const LOG_STORAGE_KEY = "assistantDebugLog";

// Load logs from localStorage
function loadPersistedLogs() {
  try {
    const logs = JSON.parse(localStorage.getItem(LOG_STORAGE_KEY) || "[]");
    return Array.isArray(logs) ? logs : [];
  } catch {
    return [];
  }
}

// Save logs to localStorage
function saveLogs(logArray) {
  localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(logArray));
}

// Add and persist a new log
window.debugLog = function (...args) {
  const el = document.getElementById("onscreen-console-messages");
  const logs = loadPersistedLogs();
  const msg = args.map(a =>
    (typeof a === "object" ? JSON.stringify(a, null, 2) : a)
  ).join(" ");
  const logEntry = `[${new Date().toLocaleString()}] ${msg}`;
  logs.push(logEntry);
  saveLogs(logs);

  if (el) {
    const line = document.createElement("div");
    line.style.marginBottom = "2px";
    line.textContent = logEntry;
    el.appendChild(line);
    el.parentElement.scrollTop = el.parentElement.scrollHeight;
  }
};

// Clear logs both visually and in localStorage
window.clearDebugLog = function() {
  localStorage.removeItem(LOG_STORAGE_KEY);
  const el = document.getElementById("onscreen-console-messages");
  if (el) el.innerHTML = "";
};

// Export logs as text file
window.exportDebugLog = function() {
  const logs = loadPersistedLogs();
  const blob = new Blob([logs.join("\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `assistant-logs-${new Date().toISOString().slice(0,10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
};

// Insert toggle button and onscreen console as before
(function() {
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

    // Add export and clear buttons
    const controls = document.createElement("div");
    controls.style.cssText = "margin-top:8px;display:flex;gap:10px;";
    const clearBtn = document.createElement("button");
    clearBtn.textContent = "Clear Logs";
    clearBtn.onclick = window.clearDebugLog;
    clearBtn.style.cssText = "padding:2px 12px;border-radius:6px;background:#d7263d;color:#fff;border:none;cursor:pointer;";
    const exportBtn = document.createElement("button");
    exportBtn.textContent = "Export Logs";
    exportBtn.onclick = window.exportDebugLog;
    exportBtn.style.cssText = "padding:2px 12px;border-radius:6px;background:#ffd600;color:#222;border:none;cursor:pointer;";
    controls.appendChild(clearBtn);
    controls.appendChild(exportBtn);
    panel.appendChild(controls);

    document.body.appendChild(panel);
  }

  // Show/hide logic, and load persisted logs on open
  const consoleBtn = document.getElementById("console-toggle-btn");
  const consolePanel = document.getElementById("onscreen-console");
  if (consoleBtn && consolePanel) {
    consoleBtn.addEventListener("click", () => {
      const isVisible = consolePanel.style.display === "block";
      consolePanel.style.display = isVisible ? "none" : "block";
      if (!isVisible) {
        const el = document.getElementById("onscreen-console-messages");
        if (el) {
          el.innerHTML = "";
          loadPersistedLogs().forEach(msg => {
            const line = document.createElement("div");
            line.style.marginBottom = "2px";
            line.textContent = msg;
            el.appendChild(line);
          });
          el.parentElement.scrollTop = el.parentElement.scrollHeight;
        }
      }
    });
  }
})();