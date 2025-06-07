// 🔹 debugConsole.js – Grouped logging with type bundling + live updates
const LOG_STORAGE_KEY = "assistantDebugLog";
window.autoScrollConsole = true;
window.DEBUG_MODE = true;

const groupedLogs = {}; // { tag: { messages: [], isExpanded: false } }

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

// 🔹 Render grouped logs
function renderGroupedLogs() {
  const el = document.getElementById("onscreen-console-messages");
  if (!el) return;
  el.innerHTML = "";

  Object.entries(groupedLogs).forEach(([tag, group]) => {
    const latestMsg = group.messages[group.messages.length - 1];
    const count = group.messages.length;

    const line = document.createElement("div");
    line.className = "debug-line";
    line.setAttribute("data-tag", tag);

    const badge = document.createElement("span");
    badge.className = "log-badge";
    badge.textContent = tag;

    const counter = document.createElement("span");
    counter.textContent = ` (${count})`;
    counter.style.opacity = 0.6;
    counter.style.marginRight = "8px";
    counter.style.fontSize = "0.8rem";

    const content = document.createElement("span");
    content.className = "log-content";
    content.textContent = latestMsg.length > 120 ? latestMsg.slice(0, 120) + "..." : latestMsg;

    line.appendChild(badge);
    line.appendChild(counter);
    line.appendChild(content);

    line.onclick = () => {
      group.isExpanded = !group.isExpanded;
      if (group.isExpanded) {
        content.innerHTML = group.messages.map(m => `<div>• ${m}</div>`).join("");
      } else {
        content.textContent = latestMsg.length > 120 ? latestMsg.slice(0, 120) + "..." : latestMsg;
      }
    };

    el.appendChild(line);
  });

  if (window.autoScrollConsole) {
    el.parentElement.scrollTop = el.parentElement.scrollHeight;
  }
}

// 🔹 Main debugLog method
window.debugLog = function (...args) {
  const timestamp = new Date().toLocaleTimeString();
  const raw = args.map(a => (typeof a === "object" ? JSON.stringify(a, null, 2) : a)).join(" ");
  const tagMatch = raw.match(/^\[(\w+)\]/);
  const tag = tagMatch ? tagMatch[1].toUpperCase() : "INFO";
  const msg = `[${timestamp}] ${raw}`;

  const logs = loadPersistedLogs();
  logs.push(msg);
  saveLogs(logs);

  if (!groupedLogs[tag]) {
    groupedLogs[tag] = { messages: [], isExpanded: false };
  }
  groupedLogs[tag].messages.push(msg);

  renderGroupedLogs();
};

// 🔹 Conditional logger
window.debug = function (...args) {
  if (window.DEBUG_MODE) window.debugLog(...args);
};

// 🔹 Clear logs
window.clearDebugLog = function () {
  localStorage.removeItem(LOG_STORAGE_KEY);
  Object.keys(groupedLogs).forEach(k => delete groupedLogs[k]);
  renderGroupedLogs();
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
    case "error": color = "#d7263d"; bg = "rgba(215,38,61,0.08)"; break;
    case "loading": color = "#ffd600"; bg = "rgba(255,214,0,0.08)"; break;
    default: bar.style.opacity = 0; return;
  }

  bar.textContent = msg;
  bar.style.color = color;
  bar.style.background = bg;
  bar.style.opacity = 1;

  window.debug(`[FEEDBACK] ${type.toUpperCase()}: ${msg}`);
  if (type !== "loading") {
    setTimeout(() => (bar.style.opacity = 0), 1800);
  }
};

// 🔹 Assistant reply logger
window.logAssistantReply = function (replyText) {
  const preview = replyText.length > 80 ? replyText.slice(0, 77) + "..." : replyText;
  window.debug("[REPLY]", preview);
  window.setStatusFeedback("success", "Assistant responded");
};

// 🔹 Onscreen Console UI init
(function () {
  const toggleBtn = document.createElement("button");
  toggleBtn.id = "console-toggle-btn";
  toggleBtn.textContent = "Console";
  document.body.appendChild(toggleBtn);

  const panel = document.createElement("div");
  panel.id = "onscreen-console";

  const messages = document.createElement("div");
  messages.id = "onscreen-console-messages";
  panel.appendChild(messages);

  const controls = document.createElement("div");
  controls.style.marginTop = "10px";

  ["clear", "export", "overlay"].forEach(action => {
    const btn = document.createElement("button");
    btn.textContent = action[0].toUpperCase() + action.slice(1);
    if (action === "clear") btn.onclick = window.clearDebugLog;
    if (action === "export") btn.onclick = window.exportDebugLog;
    if (action === "overlay") btn.onclick = window.showDebugOverlay;
    controls.appendChild(btn);
  });

  const scrollBtn = document.createElement("button");
  scrollBtn.textContent = "AutoScroll";
  scrollBtn.onclick = () => {
    window.autoScrollConsole = !window.autoScrollConsole;
    scrollBtn.style.opacity = window.autoScrollConsole ? "1" : "0.5";
  };
  controls.appendChild(scrollBtn);

  panel.appendChild(controls);
  document.body.appendChild(panel);

  toggleBtn.onclick = () => {
    const isOpen = panel.style.display === "block";
    panel.style.display = isOpen ? "none" : "block";
    if (!isOpen) renderGroupedLogs();
  };
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
    closeBtn.onclick = () => (overlay.style.display = "none");

    const content = document.createElement("div");
    content.id = "debug-content";

    modal.appendChild(closeBtn);
    modal.appendChild(content);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }

  const logs = loadPersistedLogs();
  document.getElementById("debug-content").textContent = logs.join("\n");
  overlay.style.display = "flex";
};