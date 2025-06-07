const LOG_STORAGE_KEY = "assistantDebugLog";
window.autoScrollConsole = true;
window.DEBUG_MODE = true;

// 🔹 Load logs from storage
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

// 🔹 Main logger with tags and truncation
window.debugLog = function (...args) {
  const logs = loadPersistedLogs();
  const timestamp = new Date().toLocaleTimeString();
  const msgRaw = args.map(a =>
    typeof a === "object" ? JSON.stringify(a, null, 2) : a
  ).join(" ");

  const tagMatch = msgRaw.match(/^\[(\w+)\]/);
  const tag = tagMatch ? tagMatch[1].toUpperCase() : "INFO";
  const colorMap = {
    INFO: "#999",
    SUCCESS: "#1db954",
    ERROR: "#d7263d",
    DEBUG: "#368bff",
    REPLY: "#ffa500"
  };

  const logEntry = `[${timestamp}] ${msgRaw}`;
  logs.push(logEntry);
  saveLogs(logs);

  const el = document.getElementById("onscreen-console-messages");
  if (el) {
    const line = document.createElement("div");
    line.className = "debug-line";

    const badge = document.createElement("span");
    badge.className = "log-badge";
    badge.textContent = tag;
    badge.style.color = colorMap[tag] || "#ccc";

    const content = document.createElement("span");
    content.className = "log-content";

    const isLong = msgRaw.length > 120;
    content.textContent = isLong ? msgRaw.slice(0, 120) + "..." : msgRaw;

    line.appendChild(badge);
    line.appendChild(content);

    if (isLong) {
      const toggle = document.createElement("button");
      toggle.textContent = "Show More";
      toggle.className = "log-toggle";
      toggle.onclick = () => {
        const expanded = toggle.textContent === "Show Less";
        content.textContent = expanded ? msgRaw.slice(0, 120) + "..." : msgRaw;
        toggle.textContent = expanded ? "Show More" : "Show Less";
      };
      line.appendChild(toggle);
    }

    el.appendChild(line);
    if (window.autoScrollConsole) {
      el.parentElement.scrollTop = el.parentElement.scrollHeight;
    }
  }
};

// 🔹 Conditional logger
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

// 🔹 Status bar feedback
window.setStatusFeedback = function (type, msg = "") {
  const bar = document.getElementById("chat-status-bar");
  if (!bar) return;

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
    setTimeout(() => { bar.style.opacity = 0; }, 1800);
  }
};

// 🔹 Assistant reply summary
window.logAssistantReply = function (replyText) {
  const preview = replyText.length > 80 ? replyText.slice(0, 77) + "..." : replyText;
  window.debug("[REPLY]", preview);
  window.setStatusFeedback("success", "Assistant responded");
};

// 🔹 Fullscreen overlay with fallback message
window.showDebugOverlay = function () {
  let overlay = document.getElementById("debug-overlay");
  let content = document.getElementById("debug-content");

  if (!overlay || !content) return;

  const logs = loadPersistedLogs();

  if (!logs.length) {
    content.textContent = "No logs available.";
  } else {
    content.textContent = logs.join("\n");
  }

  overlay.style.display = "flex";
};

// 🔹 Chunked loading to prevent lag
function replayLogsInChunks(logs, chunkSize = 4, delay = 50) {
  const logEl = document.getElementById("onscreen-console-messages");
  if (!logEl || logs.length === 0) return;

  logEl.innerHTML = "";
  let index = 0;

  function processChunk() {
    const slice = logs.slice(index, index + chunkSize);
    slice.forEach(log => {
      const content = log.slice(log.indexOf("]") + 2);
      window.debugLog(content);
    });

    index += chunkSize;
    if (index < logs.length) {
      setTimeout(processChunk, delay);
    }
  }

  processChunk();
}

// 🔹 Init on DOM ready
document.addEventListener("DOMContentLoaded", () => {
  const toggleBtn = document.getElementById("console-toggle-btn");
  const panel = document.getElementById("onscreen-console");

  if (toggleBtn && panel) {
    toggleBtn.addEventListener("click", () => {
      const isVisible = panel.style.display === "block";
      panel.style.display = isVisible ? "none" : "block";

      if (!isVisible) {
        const logs = loadPersistedLogs();
        replayLogsInChunks(logs);
      }
    });
  }

  document.addEventListener("click", (e) => {
    if (e.target.classList.contains("debug-line")) {
      navigator.clipboard.writeText(e.target.textContent);
      e.target.classList.add("clicked");
      setTimeout(() => e.target.classList.remove("clicked"), 400);
    }
  });

  // Inject styling (in case not already in your CSS)
  const style = document.createElement("style");
  style.textContent = `
    .debug-line {
      display: flex;
      align-items: flex-start;
      gap: 6px;
      padding: 4px;
      font-family: monospace;
      margin: 4px 0;
      word-break: break-word;
    }
    .debug-line:hover {
      background: rgba(255,255,255,0.08);
      cursor: pointer;
    }
    .debug-line.clicked {
      background: #32cd3277 !important;
    }
    .log-badge {
      font-weight: bold;
      margin-right: 6px;
      font-size: 0.8rem;
      min-width: 60px;
      text-align: left;
    }
    .log-content {
      flex: 1;
      white-space: pre-wrap;
    }
    .log-toggle {
      background: none;
      border: none;
      color: #aaa;
      font-size: 0.75rem;
      margin-left: 8px;
      cursor: pointer;
    }
    .log-toggle:hover {
      color: #fff;
    }
  `;
  document.head.appendChild(style);
});