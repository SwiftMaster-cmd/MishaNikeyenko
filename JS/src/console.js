// 🔹 console.js – Grouped Logging, Debounced Rendering, Overlay Support

const LOG_STORAGE_KEY = "assistantDebugLog";
let logs = loadPersistedLogs();
let groupedLogs = {};
let autoScrollConsole = true;
let _renderTimeout = null;

function loadPersistedLogs() {
  try {
    const stored = JSON.parse(localStorage.getItem(LOG_STORAGE_KEY) || "[]");
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

function saveLogs() {
  localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(logs));
}

function groupLogs() {
  groupedLogs = {};
  logs.forEach(entry => {
    const { type, text } = entry;
    if (!groupedLogs[type]) groupedLogs[type] = [];
    groupedLogs[type].push(text);
  });
}

function renderGroupedLogs() {
  const container = document.getElementById("onscreen-console-messages");
  if (!container) return;
  container.innerHTML = "";

  for (const [type, group] of Object.entries(groupedLogs)) {
    const logWrapper = document.createElement("div");
    logWrapper.className = "debug-line";

    const badge = document.createElement("span");
    badge.className = "log-badge";
    badge.textContent = `${type.toUpperCase()} ×${group.length}`;

    const content = document.createElement("span");
    content.className = "log-content";
    content.textContent = group[group.length - 1]; // latest only

    const toggle = document.createElement("button");
    toggle.className = "log-toggle";
    toggle.textContent = "Expand";
    let expanded = false;

    toggle.onclick = () => {
      expanded = !expanded;
      toggle.textContent = expanded ? "Collapse" : "Expand";
      content.textContent = expanded
        ? group.join("\n------\n")
        : group[group.length - 1];
    };

    logWrapper.append(badge, content, toggle);
    container.appendChild(logWrapper);
  }

  if (autoScrollConsole) container.scrollTop = container.scrollHeight;
}

function persistAndRender() {
  saveLogs();
  groupLogs();

  if (_renderTimeout) clearTimeout(_renderTimeout);
  _renderTimeout = setTimeout(() => {
    renderGroupedLogs();
    _renderTimeout = null;
  }, 100);
}

function addDebugMessage(type, text) {
  if (!text) return;
  const payload = {
    type,
    text: typeof text === "object" ? JSON.stringify(text, null, 2) : String(text),
    timestamp: Date.now()
  };
  logs.push(payload);
  if (logs.length > 200) logs.shift(); // limit total logs
  persistAndRender();
}

window.debug = (...args) => addDebugMessage("debug", args.join(" "));
window.info = (...args) => addDebugMessage("info", args.join(" "));
window.feedback = (...args) => addDebugMessage("feedback", args.join(" "));
window.reply = (...args) => addDebugMessage("reply", args.join(" "));

window.clearDebugLog = () => {
  logs = [];
  saveLogs();
  persistAndRender();
};

window.exportDebugLog = () => {
  const blob = new Blob([JSON.stringify(logs, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `assistant-log-${Date.now()}.json`;
  a.click();
};

window.showDebugOverlay = () => {
  const overlay = document.getElementById("debug-overlay");
  const content = document.getElementById("debug-content");
  if (!overlay || !content) return;

  content.textContent = logs.map(log =>
    `[${new Date(log.timestamp).toLocaleTimeString()}] (${log.type.toUpperCase()}) ${log.text}`
  ).join("\n\n");

  overlay.style.display = "flex";
};

// Initial render on load
groupLogs();
renderGroupedLogs();