// debugConsole.js – Single source for all debug, console, and overlay

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
    (typeof a === "object" ? JSON.stringify(a, null, 2) : a)
  ).join(" ");
  const logEntry = `[${new Date().toLocaleString()}] ${msg}`;
  logs.push(logEntry);
  saveLogs(logs);

  // Console panel live update
  const el = document.getElementById("onscreen-console-messages");
  if (el) {
    const line = document.createElement("div");
    line.style.marginBottom = "2px";
    line.textContent = logEntry;
    el.appendChild(line);
    el.parentElement.scrollTop = el.parentElement.scrollHeight;
  }
};

// Clear logs visually and in storage
window.clearDebugLog = function() {
  localStorage.removeItem(LOG_STORAGE_KEY);
  const el = document.getElementById("onscreen-console-messages");
  if (el) el.innerHTML = "";
};

// Export logs as .txt file
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

// === On-screen console (bottom left, with toggle) ===
(function() {
  // Toggle button
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
  // Console panel
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
  // Show/hide logic and loading
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

// === Debug Overlay (full screen modal, also shows logs) ===
window.showDebugOverlay = function() {
  let overlay = document.getElementById("debug-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "debug-overlay";
    Object.assign(overlay.style, {
      display: "none",
      position: "fixed",
      top: "0",
      left: "0",
      width: "100vw",
      height: "100vh",
      backgroundColor: "rgba(0, 0, 0, 0.85)",
      zIndex: 99999
    });

    const modal = document.createElement("div");
    modal.id = "debug-modal";
    Object.assign(modal.style, {
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      backgroundColor: "#1e1e2e",
      color: "#f8fafd",
      padding: "1rem 1.5rem",
      borderRadius: "12px",
      boxShadow: "0 2px 10px rgba(0, 0, 0, 0.5)",
      maxWidth: "80vw",
      maxHeight: "80vh",
      overflowY: "auto",
      border: "1px solid #2e2e3e"
    });

    const closeBtn = document.createElement("button");
    closeBtn.className = "close-btn";
    closeBtn.textContent = "Close";
    Object.assign(closeBtn.style, {
      position: "absolute",
      top: "8px",
      right: "8px",
      background: "#2e2e3e",
      color: "#f8fafd",
      border: "none",
      padding: "4px 8px",
      cursor: "pointer",
      borderRadius: "4px",
      fontSize: "0.9rem"
    });
    closeBtn.addEventListener("click", () => {
      overlay.style.display = "none";
    });

    const contentDiv = document.createElement("div");
    contentDiv.id = "debug-content";
    Object.assign(contentDiv.style, {
      marginTop: "32px",
      whiteSpace: "pre-wrap",
      fontFamily: "monospace",
      fontSize: "0.9rem",
      lineHeight: "1.4"
    });

    modal.appendChild(closeBtn);
    modal.appendChild(contentDiv);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }
  // Always update content to latest logs
  const logs = loadPersistedLogs();
  document.getElementById("debug-content").textContent = logs.join("\n");
  overlay.style.display = "block";
};