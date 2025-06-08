const LOG_STORAGE_KEY = "assistantDebugLog";
window.autoScrollConsole = true;
window.DEBUG_MODE = true;
let overlayAutoScroll = true;
let overlayScrollTimer = null;

// --------- Log Storage ---------
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

// --------- Logger ---------
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
  renderAllLogGroups();
};
window.debug = (...args) => {
  if (window.DEBUG_MODE) window.debugLog(...args);
};
window.clearDebugLog = function () {
  localStorage.removeItem(LOG_STORAGE_KEY);
  renderAllLogGroups();
};
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
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
};

// --------- Status/Reply/Overlay ---------
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
window.logAssistantReply = function (replyText) {
  const preview = replyText.length > 80 ? replyText.slice(0, 77) + "..." : replyText;
  window.debug("[REPLY]", preview);
  window.setStatusFeedback("success", "Assistant responded");
};

// --------- Overlay: full grouped log UI ---------
window.showDebugOverlay = function () {
  const overlay = document.getElementById("debug-overlay");
  if (!overlay) return;

  overlay.style.display = "flex";
  renderOverlayLogGroups();

  // Setup all controls in overlay
  const closeBtn = overlay.querySelector(".close-btn");
  if (closeBtn) {
    closeBtn.onclick = () => {
      overlay.style.display = "none";
      overlayAutoScroll = true; // reset for next open
    };
  }
  overlay.querySelector("#overlay-clear")?.addEventListener("click", window.clearDebugLog);
  overlay.querySelector("#overlay-export")?.addEventListener("click", window.exportDebugLog);
  overlay.querySelector("#overlay-autoscroll")?.addEventListener("click", function () {
    overlayAutoScroll = !overlayAutoScroll;
    this.style.opacity = overlayAutoScroll ? '1' : '0.5';
  });

  // Overlay scroll autoScroll logic
  const logPane = overlay.querySelector("#overlay-console-messages");
  if (logPane) {
    logPane.onscroll = function () {
      overlayAutoScroll = false;
      overlay.querySelector("#overlay-autoscroll").style.opacity = '0.5';
      if (overlayScrollTimer) clearTimeout(overlayScrollTimer);
      overlayScrollTimer = setTimeout(() => {
        overlayAutoScroll = true;
        overlay.querySelector("#overlay-autoscroll").style.opacity = '1';
        scrollOverlayToBottom();
      }, 3500); // resume after 3.5s of no scroll
    };
    scrollOverlayToBottom();
  }
};

// --------- Render Grouped Logs ---------
function groupedLogHTML(logs) {
  const groups = {};
  logs.forEach(log => {
    if (!log || !log.tag || !log.content || !log.timestamp) return;
    if (!groups[log.tag]) groups[log.tag] = [];
    groups[log.tag].push(log);
  });

  // Return array of {tag, entries}
  return Object.entries(groups)
    .sort((a, b) => {
      const aTime = a[1][a[1].length - 1].timestamp;
      const bTime = b[1][b[1].length - 1].timestamp;
      return new Date(aTime) - new Date(bTime);
    })
    .map(([tag, entries]) => ({ tag, entries }));
}

function renderLogGroups(logs, container, autoScroll = true) {
  if (!container) return;
  container.innerHTML = "";

  groupedLogHTML(logs).forEach(({ tag, entries }) => {
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
          logList.insertBefore(line, logList.firstChild);
        });
        isLoaded = true;
      }
    };
    group.appendChild(logList);
    container.appendChild(group);
  });

  if (autoScroll && container.parentElement) {
    container.parentElement.scrollTop = container.parentElement.scrollHeight;
  }
}

// Render both views with fresh logs
function renderAllLogGroups() {
  renderLogGroups(loadPersistedLogs(), document.getElementById("onscreen-console-messages"), window.autoScrollConsole);
  if (document.getElementById("overlay-console-messages")) {
    renderLogGroups(loadPersistedLogs(), document.getElementById("overlay-console-messages"), overlayAutoScroll);
  }
}
function renderOverlayLogGroups() {
  renderLogGroups(loadPersistedLogs(), document.getElementById("overlay-console-messages"), overlayAutoScroll);
  scrollOverlayToBottom();
}

function scrollOverlayToBottom() {
  const overlay = document.getElementById("debug-overlay");
  if (!overlay) return;
  const container = overlay.querySelector("#overlay-console-messages");
  if (container && overlayAutoScroll) {
    container.parentElement.scrollTop = container.parentElement.scrollHeight;
  }
}

// --------- DOM Ready Init ---------
function injectOverlayLayout() {
  // Only inject once
  if (document.getElementById("overlay-console-messages")) return;
  const overlay = document.getElementById("debug-overlay");
  if (!overlay) return;

  overlay.innerHTML = `
    <div id="debug-modal">
      <button class="close-btn" style="float:right;margin-bottom:8px;">Close</button>
      <div style="margin-bottom:8px;display:flex;gap:8px;">
        <button id="overlay-clear" type="button">Clear Logs</button>
        <button id="overlay-export" type="button">Export Logs</button>
        <button id="overlay-autoscroll" type="button" style="opacity:1;">AutoScroll</button>
      </div>
      <div id="overlay-console-pane" style="height:55vh;max-height:60vh;overflow:auto;border-radius:10px;background:rgba(24,28,36,0.97);padding:10px;">
        <div id="overlay-console-messages"></div>
      </div>
    </div>
  `;
}

function initConsoleBindings() {
  const toggleBtn = document.getElementById("console-toggle-btn");
  const panel = document.getElementById("onscreen-console");
  if (toggleBtn && panel) {
    toggleBtn.addEventListener("click", () => {
      const isVisible = panel.style.display === "block";
      panel.style.display = isVisible ? "none" : "block";
      if (!isVisible) renderAllLogGroups();
    });
  }
  document.addEventListener("click", (e) => {
    if (e.target.classList && e.target.classList.contains("debug-line")) {
      navigator.clipboard.writeText(e.target.textContent);
      e.target.classList.add("clicked");
      setTimeout(() => e.target.classList.remove("clicked"), 400);
    }
  });
  // Inject minimal styles if not present
  if (!document.getElementById("console-style")) {
    const style = document.createElement("style");
    style.id = "console-style";
    style.textContent = `
      .log-group { border-left: 4px solid #444; margin: 8px 0; padding-left: 8px; }
      .log-group.info    { border-color: #999; }
      .log-group.success { border-color: #1db954; }
      .log-group.error   { border-color: #d7263d; }
      .log-group.debug   { border-color: #368bff; }
      .log-group.reply   { border-color: #ffa500; }
      .group-header { font-weight: bold; font-size: 0.85rem; padding: 2px 0; cursor: pointer; color: #aaa; }
      .log-list { padding-left: 4px; display: flex; flex-direction: column-reverse; }
      .debug-line { font-family: monospace; font-size: 0.75rem; padding: 2px 0; color: #f8fafd; white-space: pre-wrap; }
      .debug-line.clicked { background: #32cd3277 !important; }
      #overlay-console-pane { scrollbar-width: thin; }
    `;
    document.head.appendChild(style);
  }
  injectOverlayLayout();
  renderAllLogGroups();
}

// AutoScroll logic for mini console
function setupMiniConsoleScroll() {
  const miniPane = document.getElementById("onscreen-console");
  const msgBox = document.getElementById("onscreen-console-messages");
  let miniScrollTimer = null;

  if (miniPane && msgBox) {
    msgBox.onscroll = function () {
      window.autoScrollConsole = false;
      if (miniScrollTimer) clearTimeout(miniScrollTimer);
      document.querySelector("#console-toggle-btn").style.opacity = '0.5';
      miniScrollTimer = setTimeout(() => {
        window.autoScrollConsole = true;
        document.querySelector("#console-toggle-btn").style.opacity = '1';
        renderAllLogGroups();
      }, 3500);
    };
  }
}

// Run init
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    initConsoleBindings();
    setupMiniConsoleScroll();
  });
} else {
  initConsoleBindings();
  setupMiniConsoleScroll();
}