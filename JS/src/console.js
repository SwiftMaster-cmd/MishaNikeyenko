// 🔹 console.js – Optimized debug log manager with grouping + toggle

const LOG_CONTAINER_ID = "onscreen-console-messages";
const LOG_STORAGE_KEY = "assistantDebugLog";
window.autoScrollConsole = true;

let debugGroups = {}; // { type: [{timestamp, content}] }
let renderQueued = false;

// Load logs from localStorage
function loadLogs() {
  try {
    const raw = JSON.parse(localStorage.getItem(LOG_STORAGE_KEY)) || {};
    return typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

// Save logs to localStorage
function saveLogs() {
  localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(debugGroups));
}

// Add and group a new debug message
window.debug = function (...args) {
  const content = args.map(a =>
    typeof a === "object" ? JSON.stringify(a, null, 2) : String(a)
  ).join(" ");

  const typeMatch = content.match(/^\[(INFO|FEEDBACK|REPLY|ERROR|SUBMIT|STEP \d)\]/);
  const type = typeMatch ? typeMatch[1] : "INFO";

  if (!debugGroups[type]) debugGroups[type] = [];

  debugGroups[type].push({
    timestamp: Date.now(),
    content
  });

  // Keep max 50 per group
  if (debugGroups[type].length > 50) {
    debugGroups[type].splice(0, debugGroups[type].length - 50);
  }

  saveLogs();
  queueRender();
};

function queueRender() {
  if (renderQueued) return;
  renderQueued = true;
  setTimeout(() => {
    renderGroupedLogs();
    renderQueued = false;
  }, 80);
}

function renderGroupedLogs() {
  const container = document.getElementById(LOG_CONTAINER_ID);
  if (!container) return;

  container.innerHTML = "";

  Object.entries(debugGroups).forEach(([type, group]) => {
    const wrapper = document.createElement("div");
    wrapper.className = "debug-line";

    const latest = group[group.length - 1];

    const badge = document.createElement("span");
    badge.className = "log-badge";
    badge.textContent = `[${type}]`;

    const content = document.createElement("div");
    content.className = "log-content";
    content.textContent = latest.content;

    const toggle = document.createElement("button");
    toggle.className = "log-toggle";
    toggle.textContent = `+${group.length - 1}`;
    toggle.onclick = () => {
      const expanded = group.map(g => g.content).join("\n------\n");
      content.textContent = expanded;
      toggle.remove(); // Remove toggle on expand
    };

    wrapper.appendChild(badge);
    wrapper.appendChild(content);
    if (group.length > 1) wrapper.appendChild(toggle);
    container.appendChild(wrapper);
  });

  if (window.autoScrollConsole) container.scrollTop = container.scrollHeight;
}

// Utilities
window.clearDebugLog = () => {
  debugGroups = {};
  saveLogs();
  renderGroupedLogs();
};

window.exportDebugLog = () => {
  const blob = new Blob([JSON.stringify(debugGroups, null, 2)], {
    type: "application/json"
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `debugLog-${Date.now()}.json`;
  a.click();
};

window.showDebugOverlay = () => {
  const overlay = document.getElementById("debug-overlay");
  const content = document.getElementById("debug-content");
  if (!overlay || !content) return;
  overlay.style.display = "flex";
  content.textContent = Object.entries(debugGroups).map(
    ([type, entries]) =>
      `🔸 ${type} (${entries.length} entries)\n\n${entries
        .map(e => e.content)
        .join("\n\n")}`
  ).join("\n\n==============\n\n");
};

// Load on page init
window.addEventListener("DOMContentLoaded", () => {
  debugGroups = loadLogs();
  renderGroupedLogs();
});