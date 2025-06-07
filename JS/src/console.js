// 🔹 debugConsole.js – Central log system + UI feedback + overlay
const LOG_STORAGE_KEY = "assistantDebugLog";
window.autoScrollConsole = true;
window.DEBUG_MODE = true;

// 🔹 Load logs from localStorage
function loadPersistedLogs() {
  try {
    const logs = JSON.parse(localStorage.getItem(LOG_STORAGE_KEY) || "[]");
    return Array.isArray(logs) ? logs : [];
  } catch {
    return [];
  }
}

// 🔹 Save logs
function saveLogs(logArray) {
  localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(logArray));
}

// 🔹 Primary logger
window.debugLog = function (...args) {
  const logs = loadPersistedLogs();
  const msg = args.map(a => (typeof a === "object" ? JSON.stringify(a, null, 2) : a)).join(" ");
  const timestamp = new Date().toLocaleTimeString();
  const logEntry = `[${timestamp}] ${msg}`;
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

// 🔹 Conditional logger (based on DEBUG_MODE)
window.debug = function (...args) {
  if (window.DEBUG_MODE) window.debugLog(...args);
};

// 🔹 Clear logs
window.clearDebugLog = function () {
  localStorage.removeItem(LOG_STORAGE_KEY);
  const el = document.getElementById("onscreen-console-messages");
  if (el) el.innerHTML = "";
};

// 🔹 Export logs
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

// 🔹 Status feedback bar logic
window.setStatusFeedback = function (type, msg = "") {
  const bar = document.getElementById("chat-status-bar");
  if (!bar) {
    console.warn("⚠️ chat-status-bar not found.");
    return;
  }

  let color = "", bg = "";
  switch (type) {
    case "success": color = "#1db954"; bg = "rgba(29,185,84,0.08)"; break;
    case "error":   color = "#d7263d"; bg = "rgba(215,38,61,0.08)"; break;
    case "loading": color = "#ffd600"; bg = "rgba(255,214,0,0.08)"; break;
    default:        bar.style.opacity = 0; return;
  }

  bar.textContent = msg;
  bar.style.color = color;
  bar.style.background = bg;
  bar.style.opacity = 1;

  window.debug(`[FEEDBACK] ${type.toUpperCase()}: ${msg}`);

  if (type !== "loading") {
    setTimeout(() => {
      bar.style.opacity = 0;
    }, 1800);
  }
};

// 🔹 Assistant reply logger
window.logAssistantReply = function (replyText) {
  const preview = replyText.length > 80 ? replyText.slice(0, 77) + "..." : replyText;
  window.debug("[REPLY]", preview);
  window.setStatusFeedback("success", "Assistant responded");
};

// 🔹 Console UI Setup
(function () {
  const style = document.createElement("style");
  style.textContent = `
    .debug-line:hover { background: rgba(255,255,255,0.15); cursor: pointer; }
    .debug-line.clicked { background: #32cd3277 !important; }
  `;
  document.head.appendChild(style);

  // Toggle Button
  if (!document.getElementById("console-toggle-btn")) {
    const btn = document.createElement("button");
    btn.id = "console-toggle-btn";
    btn.textContent = "Console";
    document.body.appendChild(btn);
  }

  // Main Console Panel
  if (!document.getElementById("onscreen-console")) {
    const panel = document.createElement("div");
    panel.id = "onscreen-console";

    const messages = document.createElement("div");
    messages.id = "onscreen-console-messages";
    panel.appendChild(messages);

    const controls = document.createElement("div");
    controls.style.marginTop = "10px";

    const clearBtn = document.createElement("button");
    clearBtn.textContent = "Clear Logs";
    clearBtn.onclick = window.clearDebugLog;
    controls.appendChild(clearBtn);

    const exportBtn = document.createElement("button");
    exportBtn.textContent = "Export Logs";
    exportBtn.onclick = window.exportDebugLog;
    controls.appendChild(exportBtn);

    const overlayBtn = document.createElement("button");
    overlayBtn.textContent = "Full View";
    overlayBtn.onclick = window.showDebugOverlay;
    controls.appendChild(overlayBtn);

    const scrollBtn = document.createElement("button");
    scrollBtn.textContent = "AutoScroll";
    scrollBtn.onclick = () => {
      window.autoScrollConsole = !window.autoScrollConsole;
      scrollBtn.style.opacity = window.autoScrollConsole ? "1" : "0.5";
    };
    controls.appendChild(scrollBtn);

    panel.appendChild(controls);
    document.body.appendChild(panel);
  }

  const toggleBtn = document.getElementById("console-toggle-btn");
  const panel = document.getElementById("onscreen-console");

  toggleBtn.addEventListener("click", () => {
    const isOpen = panel.style.display === "block";
    panel.style.display = isOpen ? "none" : "block";

    if (!isOpen) {
      const logEl = document.getElementById("onscreen-console-messages");
      logEl.innerHTML = "";
      loadPersistedLogs().forEach(log => {
        const line = document.createElement("div");
        line.className = "debug-line";
        line.textContent = log;
        logEl.appendChild(line);
      });
      logEl.scrollTop = logEl.scrollHeight;
    }
  });

  document.addEventListener("click", (e) => {
    if (e.target.classList.contains("debug-line")) {
      navigator.clipboard.writeText(e.target.textContent);
      e.target.classList.add("clicked");
      setTimeout(() => e.target.classList.remove("clicked"), 400);
    }
  });
})();

// 🔹 Fullscreen Debug Overlay
window.showDebugOverlay = function () {
  let overlay = document.getElementById("debug-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "debug-overlay";

    const modal = document.createElement("div");
    modal.id = "debug-modal";

    const closeBtn = document.createElement("button");
    closeBtn.className = "close-btn";
    closeBtn.textContent = "Close";
    closeBtn.onclick = () => overlay.style.display = "none";

    const content = document.createElement("div");
    content.id = "debug-content";

    modal.appendChild(closeBtn);
    modal.appendChild(content);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }

  const logs = loadPersistedLogs();
  document.getElementById("debug-content").textContent = logs.join("\n");
  document.getElementById("debug-overlay").style.display = "flex";
};