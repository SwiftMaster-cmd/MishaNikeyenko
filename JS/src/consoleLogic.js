// --- LOGIC, STATE, & RENDERING ---

const LOG_STORAGE_KEY = "assistantDebugLog";
export let miniAutoscroll = true;
let miniScrollTimer = null;
export let overlayAutoscroll = true;
let overlayScrollTimer = null;

export function loadPersistedLogs() {
  try {
    const logs = JSON.parse(localStorage.getItem(LOG_STORAGE_KEY) || "[]");
    return Array.isArray(logs) ? logs : [];
  } catch {
    return [];
  }
}
export function saveLogs(logArray) {
  localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(logArray));
}
export function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString();
}

// -- LOGGING API --
export function debugLog(...args) {
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
}
export function clearLogs() {
  localStorage.removeItem(LOG_STORAGE_KEY);
  renderAllLogGroups();
}
export function exportLogs() {
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
}

// -- FULL VIEW (OVERLAY) --
export function showOverlay() {
  const overlay = document.getElementById("debug-overlay");
  const mini = document.getElementById("onscreen-console");
  if (!overlay) return;
  if (mini) mini.style.display = "none";
  overlay.style.display = "flex";
  renderOverlayLogs();
}
export function closeOverlay() {
  const overlay = document.getElementById("debug-overlay");
  const mini = document.getElementById("onscreen-console");
  if (overlay) overlay.style.display = "none";
  if (mini) mini.style.display = "block";
  overlayAutoscroll = true;
}
export function toggleAutoscroll() {
  miniAutoscroll = !miniAutoscroll;
  const btn = document.getElementById("console-autoscroll-btn");
  if (btn) btn.style.opacity = miniAutoscroll ? '1' : '0.5';
}
export function toggleOverlayAutoscroll() {
  overlayAutoscroll = !overlayAutoscroll;
  const btn = document.getElementById("overlay-autoscroll");
  if (btn) btn.style.opacity = overlayAutoscroll ? '1' : '0.5';
  if (overlayAutoscroll) scrollOverlayToBottom();
}

// --- LOG GROUPING & RENDERING ---
export function groupedLogHTML(logs) {
  const groups = {};
  logs.forEach(log => {
    if (!log || !log.tag || !log.content || !log.timestamp) return;
    if (!groups[log.tag]) groups[log.tag] = [];
    groups[log.tag].push(log);
  });
  return Object.entries(groups)
    .sort((a, b) => {
      const aTime = a[1][a[1].length - 1].timestamp;
      const bTime = b[1][b[1].length - 1].timestamp;
      return new Date(aTime) - new Date(bTime);
    })
    .map(([tag, entries]) => ({ tag, entries }));
}

export function renderLogGroups(logs, container, useAutoscroll = true) {
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
  // Only scroll to bottom if autoscroll is ON and already at (or very near) bottom.
  if (useAutoscroll && atBottom(container)) {
    container.scrollTop = container.scrollHeight;
  }
}
export function renderMiniLogs() {
  renderLogGroups(loadPersistedLogs(), document.getElementById("onscreen-console-messages"), miniAutoscroll);
}
export function renderOverlayLogs() {
  renderLogGroups(loadPersistedLogs(), document.getElementById("overlay-console-messages"), overlayAutoscroll);
  scrollOverlayToBottom();
}
export function renderAllLogGroups() {
  renderMiniLogs();
  if (document.getElementById("overlay-console-messages")) {
    renderOverlayLogs();
  }
}
export function scrollOverlayToBottom() {
  const overlay = document.getElementById("debug-overlay");
  if (!overlay) return;
  const container = overlay.querySelector("#overlay-console-pane");
  if (container && overlayAutoscroll && atBottom(container)) {
    container.scrollTop = container.scrollHeight;
  }
}
export function atBottom(scrollEl) {
  if (!scrollEl) return true;
  // Within 12px of bottom is close enough
  return scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < 12;
}

// -- Clipboard
export function setupClipboardCopy() {
  document.addEventListener("click", (e) => {
    if (e.target.classList && e.target.classList.contains("debug-line")) {
      navigator.clipboard.writeText(e.target.textContent);
      e.target.classList.add("clicked");
      setTimeout(() => e.target.classList.remove("clicked"), 400);
    }
  });
}

// -- Mini console scroll logic --
export function setupMiniConsoleScroll() {
  const msgBox = document.getElementById("onscreen-console-messages");
  if (msgBox) {
    msgBox.onscroll = function () {
      if (!atBottom(msgBox)) {
        miniAutoscroll = false;
        if (miniScrollTimer) clearTimeout(miniScrollTimer);
        miniScrollTimer = setTimeout(() => {
          if (atBottom(msgBox)) {
            miniAutoscroll = true;
          }
        }, 3500);
      } else {
        miniAutoscroll = true;
      }
    };
  }
}