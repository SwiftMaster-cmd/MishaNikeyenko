// debugConsole.js – Updated for structured tags, metadata, and export formats

const LOG_STORAGE_KEY = "assistantDebugLog";
window.DEBUG_MODE = true;
window.currentUID = null; // Set this externally after auth

let miniAutoscroll = true;
let miniScrollTimer = null;
let overlayAutoscroll = true;
let overlayScrollTimer = null;

// Centralized tag color map
const TAG_STYLES = {
  INFO: "#999",
  SUCCESS: "#1db954",
  ERROR: "#d7263d",
  DEBUG: "#368bff",
  REPLY: "#ffa500",
  MEMORY: "#f084f0",
  SYSTEM: "#4ad2c8",
  PING: "#ffd700"
};

// Load from storage
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

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString();
}

window.debugLog = function (...args) {
  const logs = loadPersistedLogs();
  const timestamp = new Date().toISOString();
  const explicitTag = args.find(a => typeof a === "string" && a.startsWith("@"));
  const tag = explicitTag ? explicitTag.slice(1).toUpperCase() : "INFO";
  const msgRaw = args
    .filter(a => typeof a !== "string" || !a.startsWith("@"))
    .map(a => (typeof a === "object" ? JSON.stringify(a, null, 2) : a))
    .join(" ");

  logs.push({
    tag,
    timestamp,
    content: msgRaw,
    source: arguments.callee.caller?.name || "anonymous",
    uid: window.currentUID || null
  });

  saveLogs(logs);
  renderAllLogGroups?.(); // optional
};

window.debug = (...args) => {
  if (window.DEBUG_MODE) window.debugLog(...args);
};

window.clearDebugLog = function () {
  localStorage.removeItem(LOG_STORAGE_KEY);
  renderAllLogGroups?.();
};

window.exportDebugLog = function (type = "text") {
  const logs = loadPersistedLogs();
  let blob, fileExt;

  if (type === "json") {
    blob = new Blob([JSON.stringify(logs, null, 2)], { type: "application/json" });
    fileExt = "json";
  } else if (type === "md") {
    const md = logs
      .map(log =>
        `### [${log.tag}] ${formatTime(log.timestamp)}\n\n- **From:** ${log.source} (${log.uid || "anon"})\n- ${log.content}`
      )
      .join("\n\n");
    blob = new Blob([md], { type: "text/markdown" });
    fileExt = "md";
  } else {
    const txt = logs
      .map(log =>
        `[${formatTime(log.timestamp)}] [${log.tag}] ${log.content}`
      )
      .join("\n");
    blob = new Blob([txt], { type: "text/plain" });
    fileExt = "txt";
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `assistant-logs-${new Date().toISOString().slice(0, 10)}.${fileExt}`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
};

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

  window.debug("@FEEDBACK", `[${type.toUpperCase()}] ${msg}`);
  if (type !== "loading") {
    setTimeout(() => {
      bar.style.opacity = 0;
    }, 1800);
  }
};

window.logAssistantReply = function (replyText) {
  const preview = replyText.length > 80 ? replyText.slice(0, 77) + "..." : replyText;
  window.debug("@REPLY", preview);
  window.setStatusFeedback("success", "Assistant responded");
};