// console.js – Persistent Debug Console + Suggestions Panel

import { fetchSelfImprovementSuggestions } from "./memoryManager.js";

const LOG_STORAGE_KEY = "assistantDebugLog";
window.autoScrollConsole = true;
window.DEBUG_MODE = true;

// Load logs
function loadPersistedLogs() {
  try {
    const logs = JSON.parse(localStorage.getItem(LOG_STORAGE_KEY) || "[]");
    return Array.isArray(logs) ? logs : [];
  } catch {
    return [];
  }
}

// Save logs
function saveLogs(logArray) {
  localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(logArray));
}

// Format ISO timestamp for display
function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString();
}

// Main logger
window.debugLog = function (...args) {
  const logs = loadPersistedLogs();
  const timestamp = new Date().toISOString();
  const msgRaw = args.map(a =>
    typeof a === "object" ? JSON.stringify(a, null, 2) : a
  ).join(" ");
  const tagMatch = msgRaw.match(/^\[(\w+)\]/);
  const tag = tagMatch ? tagMatch[1].toUpperCase() : "INFO";

  logs.push({ tag, timestamp, content: msgRaw });
  saveLogs(logs);
  renderLogGroups(loadPersistedLogs());
};

// Conditional debug
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
    [logs.map(l => `[${formatTime(l.timestamp)}] ${l.content}`).join("\n")],
    { type: "text/plain" }
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `assistant-logs-${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
};

// Status feedback bar
window.setStatusFeedback = function (type, msg = "") {
  const bar = document.getElementById("chat-status-bar");
  if (!bar) return;

  const styleMap = {
    success: { color: "#1db954", bg: "rgba(29,185,84,0.08)" },
    error: { color: "#d7263d", bg: "rgba(215,38,61,0.08)" },
    loading: { color: "#ffd600", bg: "rgba(255,214,0,0.08)" },
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

// Assistant reply shortcut
window.logAssistantReply = function (replyText) {
  const preview = replyText.length > 80 ? replyText.slice(0, 77) + "..." : replyText;
  window.debug("[REPLY]", preview);
  window.setStatusFeedback("success", "Assistant responded");
};

// Fullscreen overlay
window.showDebugOverlay = function () {
  const overlay = document.getElementById("debug-overlay");
  const content = document.getElementById("debug-content");
  const suggestionsBtn = document.getElementById("show-suggestions-btn");
  const suggestionsDiv = document.getElementById("suggestions-list");
  if (!overlay || !content) return;

  const logs = loadPersistedLogs();
  content.textContent = logs.length
    ? logs.map(log => `[${formatTime(log.timestamp)}] ${log.content}`).join("\n")
    : "No logs available.";
  overlay.style.display = "flex";
  // Hide suggestions on open
  if (suggestionsDiv) suggestionsDiv.style.display = "none";
};

// Render grouped logs
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
      const aTime = a[1][a[1].length - 1].timestamp;
      const bTime = b[1][b[1].length - 1].timestamp;
      return new Date(aTime) - new Date(bTime); // Newest at bottom
    })
    .forEach(([tag, entries]) => {
      const group = document.createElement("div");
      group.className = `log-group ${tag.toLowerCase()}`;

      const header = document.createElement("div");
      header.className = "group-header";
      header.textContent = `[${tag}] (${entries.length}) -- ${formatTime(entries.at(-1).timestamp)}`;
      group.appendChild(header);

      const logList = document.createElement("div");
      logList.className = "log-list";
      logList.style.display = "none";

      let isLoaded = false;

      header.onclick = () => {
        const visible = logList.style.display === "block";
        logList.style.display = visible ? "none" : "block";

        if (!isLoaded) {
          entries.slice().reverse().forEach(entry => {
            const line = document.createElement("div");
            line.className = "debug-line";
            line.textContent = `[${formatTime(entry.timestamp)}] ${entry.content}`;
            logList.insertBefore(line, logList.firstChild); // expands upward
          });
          isLoaded = true;
        }
      };

      group.appendChild(logList);
      container.appendChild(group);
    });

  if (window.autoScrollConsole) {
    container.parentElement.scrollTop = container.parentElement.scrollHeight;
  }
}

// ==== SUGGESTIONS PANEL LOGIC ====

async function loadSuggestionsPanel() {
  const suggestionsDiv = document.getElementById("suggestions-list");
  if (!suggestionsDiv) return;
  suggestionsDiv.style.display = "block";
  suggestionsDiv.innerHTML = "Loading...";
  // Get UID from auth, fallback to global
  const uid = (window.auth && window.auth.currentUser && window.auth.currentUser.uid) || "";
  if (!uid) {
    suggestionsDiv.innerHTML = "Not signed in.";
    return;
  }
  const result = await fetchSelfImprovementSuggestions(uid);
  if (!result || !result.items) {
    suggestionsDiv.innerHTML = "No suggestions found.";
  } else {
    suggestionsDiv.innerHTML = `<b>${result.title}</b><ul>` +
      result.items.map(x => `<li>${x}</li>`).join("") +
      "</ul>";
  }
}

// ==== DOM READY ====

document.addEventListener("DOMContentLoaded", () => {
  const toggleBtn = document.getElementById("console-toggle-btn");
  const panel = document.getElementById("onscreen-console");
  const suggestionsBtn = document.getElementById("show-suggestions-btn");
  const suggestionsDiv = document.getElementById("suggestions-list");

  if (toggleBtn && panel) {
    toggleBtn.addEventListener("click", () => {
      const isVisible = panel.style.display === "block";
      panel.style.display = isVisible ? "none" : "block";
      if (!isVisible) renderLogGroups(loadPersistedLogs());
      // Hide suggestions panel on open
      if (suggestionsDiv) suggestionsDiv.style.display = "none";
    });
  }

  document.addEventListener("click", (e) => {
    if (e.target.classList.contains("debug-line")) {
      navigator.clipboard.writeText(e.target.textContent);
      e.target.classList.add("clicked");
      setTimeout(() => e.target.classList.remove("clicked"), 400);
    }
  });

  // Self-Improvement Suggestions Button Handler
  if (suggestionsBtn && suggestionsDiv) {
    suggestionsBtn.onclick = () => {
      if (suggestionsDiv.style.display === "block") {
        suggestionsDiv.style.display = "none";
        return;
      }
      loadSuggestionsPanel();
    };
  }

  const style = document.createElement("style");
  style.textContent = `
    .log-group {
      border-left: 4px solid #444;
      margin: 8px 0;
      padding-left: 8px;
    }
    .log-group.info    { border-color: #999; }
    .log-group.success { border-color: #1db954; }
    .log-group.error   { border-color: #d7263d; }
    .log-group.debug   { border-color: #368bff; }
    .log-group.reply   { border-color: #ffa500; }

    .group-header {
      font-weight: bold;
      font-size: 0.85rem;
      padding: 2px 0;
      cursor: pointer;
      color: #aaa;
    }

    .log-list {
      padding-left: 4px;
      display: flex;
      flex-direction: column-reverse;
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
    #show-suggestions-btn {
      margin: 10px 0 0 0;
      background: #242a47;
      color: #d8e3fd;
      border: none;
      border-radius: 9px;
      padding: 7px 16px;
      font-weight: 600;
      font-size: 1rem;
      cursor: pointer;
      transition: background 0.18s;
      display: block;
    }
    #show-suggestions-btn:hover {
      background: #354061;
    }
    #suggestions-list {
      margin: 10px 0 0 0;
      background: #23243c;
      border-radius: 12px;
      padding: 12px;
      color: #e9f3fe;
      display: none;
      font-size: 0.96rem;
      word-break: break-word;
      box-shadow: 0 2px 18px #12122033;
    }
    #suggestions-list ul {
      margin: 8px 0 0 0;
      padding-left: 19px;
    }
    #suggestions-list li {
      margin: 0 0 4px 0;
      padding: 0;
    }
  `;
  document.head.appendChild(style);

  renderLogGroups(loadPersistedLogs());
});