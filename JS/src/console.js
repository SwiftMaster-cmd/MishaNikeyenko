// 🔹 console.js – onscreen debug console with grouping and memory

const LOG_STORAGE_KEY = "assistantDebugLog";
window.autoScrollConsole = true;
const consoleContainer = document.getElementById("onscreen-console");
const consoleMessages = document.getElementById("onscreen-console-messages");

let groupedLogs = {}; // { type: [msg1, msg2, ...] }
let logOrder = []; // Maintain display order of types

// Load from localStorage
function loadPersistedLogs() {
  try {
    return JSON.parse(localStorage.getItem(LOG_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}
function saveLogs(logData) {
  localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(logData));
}
function clearDebugLog() {
  groupedLogs = {};
  logOrder = [];
  saveLogs({});
  renderGroupedLogs();
}
function exportDebugLog() {
  const fullExport = Object.entries(groupedLogs).flatMap(([type, msgs]) =>
    msgs.map((msg, i) => `[${type}] #${i + 1} ${msg}`)
  ).join("\n\n");
  const blob = new Blob([fullExport], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "debug-log.txt";
  link.click();
  URL.revokeObjectURL(url);
}
function scrollToLatestLog() {
  if (window.autoScrollConsole && consoleMessages)
    consoleMessages.scrollTop = consoleMessages.scrollHeight;
}

// Render grouped logs
function renderGroupedLogs() {
  consoleMessages.innerHTML = "";
  logOrder.forEach(type => {
    const group = groupedLogs[type];
    if (!group.length) return;

    const container = document.createElement("div");
    container.className = "debug-line";

    const badge = document.createElement("span");
    badge.className = "log-badge";
    badge.textContent = type;

    const content = document.createElement("span");
    content.className = "log-content";
    content.textContent = group[group.length - 1];

    const toggle = document.createElement("button");
    toggle.className = "log-toggle";
    toggle.textContent = `+${group.length - 1}`;
    toggle.onclick = () => {
      const expanded = document.createElement("div");
      expanded.style.marginTop = "6px";
      expanded.style.fontSize = "0.82rem";
      expanded.style.whiteSpace = "pre-wrap";
      expanded.style.opacity = "0.8";
      expanded.textContent = group.join("\n------\n");
      container.replaceChild(expanded, content);
      toggle.remove();
    };

    container.appendChild(badge);
    container.appendChild(content);
    if (group.length > 1) container.appendChild(toggle);

    consoleMessages.appendChild(container);
  });

  scrollToLatestLog();
  saveLogs(groupedLogs);
}

// Add log
function addDebugMessage(type, ...args) {
  const message = args.map(a =>
    typeof a === "object" ? JSON.stringify(a, null, 2) : a
  ).join(" ");

  if (!groupedLogs[type]) {
    groupedLogs[type] = [message];
    logOrder.push(type);
  } else {
    groupedLogs[type].push(message);
  }

  renderGroupedLogs();
}

// Overlay modal view
function showDebugOverlay() {
  const overlay = document.getElementById("debug-overlay");
  const content = document.getElementById("debug-content");
  const full = Object.entries(groupedLogs).flatMap(([type, msgs]) =>
    msgs.map((m, i) => `[${type}] #${i + 1}\n${m}`)
  ).join("\n\n----------------------------\n\n");

  content.textContent = full || "No logs yet.";
  overlay.style.display = "flex";
}

// Initial
window.clearDebugLog = clearDebugLog;
window.exportDebugLog = exportDebugLog;
window.showDebugOverlay = showDebugOverlay;
window.debug = (...args) => addDebugMessage("INFO", ...args);
window.reply = (...args) => addDebugMessage("REPLY", ...args);
window.feedback = (...args) => addDebugMessage("FEEDBACK", ...args);

// Restore saved logs
window.addEventListener("DOMContentLoaded", () => {
  groupedLogs = loadPersistedLogs();
  logOrder = Object.keys(groupedLogs);
  renderGroupedLogs();
});