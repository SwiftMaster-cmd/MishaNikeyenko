// onscreenConsole.js – Persistent, docked console panel with localStorage history

const LOG_STORAGE_KEY = "assistantDebugLog";

// ========== Utility: Load/Save Persistent Log ==========
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

// ========== Main Logging API ==========
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
    line.className = "osc-log-line";
    line.textContent = logEntry;
    el.appendChild(line);
    el.parentElement.scrollTop = el.parentElement.scrollHeight;
  }
};

// ========== Clear/Export ==========
window.clearDebugLog = function() {
  localStorage.removeItem(LOG_STORAGE_KEY);
  const el = document.getElementById("onscreen-console-messages");
  if (el) el.innerHTML = "";
};
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

// ========== Panel and Button Injection ==========
(function() {
  // ---- Panel ----
  if (!document.getElementById('onscreen-console')) {
    const panel = document.createElement("aside");
    panel.id = "onscreen-console";
    panel.className = "osc-panel osc-hidden";
    panel.innerHTML = `
      <div class="osc-header">
        <span>Console</span>
        <div class="osc-controls">
          <button class="osc-btn" onclick="window.clearDebugLog()">Clear</button>
          <button class="osc-btn" onclick="window.exportDebugLog()">Export</button>
          <button class="osc-btn osc-hide-btn" title="Hide Console">&times;</button>
        </div>
      </div>
      <div id="onscreen-console-messages" class="osc-messages"></div>
    `;
    document.body.appendChild(panel);

    // Hide panel
    panel.querySelector('.osc-hide-btn').onclick = () => {
      panel.classList.add('osc-hidden');
      const btn = document.getElementById("osc-toggle-btn");
      if (btn) btn.classList.remove('osc-active');
    };
  }

  // ---- Toggle Button ----
  if (!document.getElementById('osc-toggle-btn')) {
    // Prefer: insert next to chat input, else bottom left fallback
    let chatForm = document.getElementById('chat-form');
    let btn = document.createElement("button");
    btn.id = "osc-toggle-btn";
    btn.type = "button";
    btn.className = "osc-btn";
    btn.textContent = "Console";
    btn.title = "Toggle Console";
    btn.style.marginLeft = "0.25rem";
    btn.style.fontWeight = "600";

    btn.onclick = () => {
      const panel = document.getElementById('onscreen-console');
      if (!panel) return;
      const open = panel.classList.toggle('osc-hidden') === false;
      btn.classList.toggle('osc-active', open);
      // Scroll to bottom on open
      if (!panel.classList.contains('osc-hidden')) {
        setTimeout(() => {
          const el = document.getElementById("onscreen-console-messages");
          if (el) el.parentElement.scrollTop = el.parentElement.scrollHeight;
        }, 40);
      }
    };

    if (chatForm && chatForm.lastElementChild) {
      chatForm.insertBefore(btn, chatForm.lastElementChild);
    } else {
      // Fallback: bottom left if no chat-form
      btn.style.position = "fixed";
      btn.style.bottom = "18px";
      btn.style.left = "18px";
      btn.style.zIndex = "99999";
      document.body.appendChild(btn);
    }
  }

  // ---- Log Initial Render ----
  function showLogs() {
    const el = document.getElementById("onscreen-console-messages");
    if (el) {
      el.innerHTML = "";
      loadPersistedLogs().forEach(msg => {
        const line = document.createElement("div");
        line.className = "osc-log-line";
        line.textContent = msg;
        el.appendChild(line);
      });
      el.parentElement.scrollTop = el.parentElement.scrollHeight;
    }
  }
  showLogs();

  // ---- Sync logs across tabs ----
  window.addEventListener("storage", e => {
    if (e.key === LOG_STORAGE_KEY) showLogs();
  });
})();