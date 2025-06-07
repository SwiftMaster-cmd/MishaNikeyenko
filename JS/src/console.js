const LOG_STORAGE_KEY = "assistantDebugLog";
window.autoScrollConsole = true;
window.DEBUG_MODE = true;

// Load logs from localStorage with strict validation
function loadPersistedLogs() {
  try {
    const raw = localStorage.getItem(LOG_STORAGE_KEY) || "[]";
    const logs = JSON.parse(raw);
    if (!Array.isArray(logs)) throw new Error("Corrupted log format");
    return logs.filter(log =>
      log &&
      typeof log.content === "string" &&
      typeof log.tag === "string" &&
      typeof log.timestamp === "string"
    );
  } catch {
    localStorage.removeItem(LOG_STORAGE_KEY);
    return [];
  }
}

// Save logs
function saveLogs(logArray) {
  localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(logArray));
}

// Add and group logs
window.debugLog = function (...args) {
  const logs = loadPersistedLogs();
  const timestamp = new Date().toLocaleString();
  const msgRaw = args.map(a =>
    typeof a === "object" ? JSON.stringify(a, null, 2) : a
  ).join(" ");
  const tagMatch = msgRaw.match(/^\[(\w+)\]/);
  const tag = tagMatch ? tagMatch[1].toUpperCase() : "INFO";

  logs.push({ tag, timestamp, content: msgRaw });
  saveLogs(logs);
  renderLogGroups(loadPersistedLogs());
};

// Shorthand
window.debug = (...args) => {
  if (window.DEBUG_MODE) window.debugLog(...args);
};

// Clear logs
window.clearDebugLog = function () {
  localStorage.removeItem(LOG_STORAGE_KEY);
  renderLogGroups([]);
};

// Export logs
window.exportDebugLog = function () {
  const logs = loadPersistedLogs();
  const blob = new Blob(
    [logs.map(l => `[${l.timestamp}] ${l.content}`).join("\n")],
    { type: "text/plain" }
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `assistant-logs-${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
};

// Status bar feedback
window.setStatusFeedback = function (type, msg = "") {
  const bar = document.getElementById("chat-status-bar");
  if (!bar) return;

  const styleMap = {
    success: { color: "#1db954", bg: "rgba(29,185,84,0.08)" },
    error: { color: "#d7263d", bg: "rgba(215,38,61,0.08)" },
    loading: { color: "#ffd600", bg: "rgba(255,214,0,0.08)" }
  };

  if (!styleMap[type]) {
    bar.style.opacity = 0;
    return;
  }

  bar.textContent = msg;
  bar.style.color = styleMap[type].color;
  bar.style.background = styleMap[type].bg;
  bar.style.opacity = 1;

  window.debug(`[FEEDBACK] ${type.toUpperCase()}: ${msg}`);
  if (type !== "loading") {
    setTimeout(() => { bar.style.opacity = 0; }, 1800);
  }
};

// Assistant shortcut
window.logAssistantReply = function (replyText) {
  const preview = replyText.length > 80 ? replyText.slice(0, 77) + "..." : replyText;
  window.debug("[REPLY]", preview);
  window.setStatusFeedback("success", "Assistant responded");
};

// Show overlay
window.showDebugOverlay = function () {
  const overlay = document.getElementById("debug-overlay");
  const content = document.getElementById("debug-content");
  if (!overlay || !content) return;

  const logs = loadPersistedLogs();
  content.textContent = logs.length
    ? logs.map(log => `[${log.timestamp}] ${log.content}`).join("\n")
    : "No logs available.";
  overlay.style.display = "flex";
};

// Render grouped log display
function renderLogGroups(logs) {
  const container = document.getElementById("onscreen-console-messages");
  if (!container) return;
  container.innerHTML = "";

  const groups = {};
  logs.forEach(log => {
    if (!log || !log.tag || !log.content || !log.timestamp) return;
    if (!groups[log.tag]) groups[log.tag] = [];
    groups[log.tag].push(log);
  });

  Object.entries(groups)
    .sort((a, b) => {
      const aTime = new Date(a[1].at(-1).timestamp);
      const bTime = new Date(b[1].at(-1).timestamp);
      return aTime - bTime;
    })
    .forEach(([tag, entries]) => {
      const group = document.createElement("div");
      group.className = `log-group ${tag.toLowerCase()}`;

      const header = document.createElement("div");
      header.className = "group-header";
      header.textContent = `[${tag}] (${entries.length}) -- ${entries.at(-1).timestamp}`;
      group.appendChild(header);

      const logList = document.createElement("div");
      logList.className = "log-list";
      logList.style.display = "none";

      entries.forEach(entry => {
        const line = document.createElement("div");
        line.className = "debug-line";
        line.textContent = `[${entry.timestamp}] ${entry.content}`;
        logList.appendChild(line);
      });

      header.onclick = () => {
        logList.style.display = logList.style.display === "none" ? "block" : "none";
      };

      group.appendChild(logList);
      container.appendChild(group);
    });

  if (window.autoScrollConsole) {
    setTimeout(() => {
      container.parentElement.scrollTop = container.parentElement.scrollHeight;
    }, 50);
  }
}

// Replay logs for pinning/toggle
function replayLogsInChunks(logs, chunkSize = 4, delay = 40) {
  const logEl = document.getElementById("onscreen-console-messages");
  if (!logEl || logs.length === 0) return;

  logEl.innerHTML = "";
  let index = 0;

  function processChunk() {
    const chunk = logs.slice(0, index + chunkSize);
    renderLogGroups(chunk);
    index += chunkSize;
    if (index < logs.length) {
      setTimeout(processChunk, delay);
    }
  }

  processChunk();
}

// Initialize on page load
document.addEventListener("DOMContentLoaded", () => {
  const toggleBtn = document.getElementById("console-toggle-btn");
  const panel = document.getElementById("onscreen-console");

  if (toggleBtn && panel) {
    toggleBtn.addEventListener("click", () => {
      const isVisible = panel.style.display === "block";
      panel.style.display = isVisible ? "none" : "block";
      if (!isVisible) replayLogsInChunks(loadPersistedLogs());
    });
  }

  document.addEventListener("click", (e) => {
    if (e.target.classList.contains("debug-line")) {
      navigator.clipboard.writeText(e.target.textContent);
      e.target.classList.add("clicked");
      setTimeout(() => e.target.classList.remove("clicked"), 400);
    }
  });

  const style = document.createElement("style");
  style.textContent = `
    .log-group {
      border-left: 4px solid #444;
      margin: 8px 0;
      padding-left: 8px;
    }

    .log-group.info     { border-color: #888; }
    .log-group.submit   { border-color: #32cd32; }
    .log-group.reply    { border-color: #ffa500; }
    .log-group.feedback { border-color: #ffd700; }
    .log-group.memory   { border-color: #00ced1; }
    .log-group.error    { border-color: #d7263d; }

    .group-header {
      font-weight: bold;
      font-size: 0.85rem;
      padding: 2px 0;
      cursor: pointer;
      color: #aaa;
    }

    .log-list {
      padding-left: 4px;
    }

    .debug-line {
      font-family: monospace;
      font-size: 0.75rem;
      padding: 2px 0;
      color: #f8fafd;
      white-space: pre-wrap;
    }

    .debug-line.clicked {
      background: #32cd3277 !important;
    }
  `;
  document.head.appendChild(style);

  renderLogGroups(loadPersistedLogs());
});