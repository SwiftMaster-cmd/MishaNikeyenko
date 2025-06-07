import { ref, get, child } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { db, auth } from "./firebaseConfig.js";

// Auto-scroll toggle and debug mode
window.autoScrollConsole = true;
window.DEBUG_MODE = true;

// Utility: format timestamp
function formatTimestamp(ts) {
  if (!ts) return "Invalid";
  try {
    return new Date(ts).toLocaleTimeString();
  } catch {
    return "Invalid";
  }
}

// Debug logger
window.debugLog = function (...args) {
  const timestamp = Date.now();
  const content = args.map(a => (typeof a === "object" ? JSON.stringify(a, null, 2) : a)).join(" ");
  const tagMatch = content.match(/^\[(\w+)\]/);
  const tag = tagMatch ? tagMatch[1].toUpperCase() : "INFO";

  const log = { tag, content, timestamp };
  renderLogGroups([log], true);
};

// Shortcut
window.debug = (...args) => {
  if (window.DEBUG_MODE) window.debugLog(...args);
};

// Show debug overlay
window.showDebugOverlay = function () {
  const overlay = document.getElementById("debug-overlay");
  const content = document.getElementById("debug-content");
  if (!overlay || !content) return;

  content.textContent = "[Loading logs from Firebase...]";
  overlay.style.display = "flex";

  auth.onAuthStateChanged(async (user) => {
    if (!user) return;
    const uid = user.uid;
    const paths = [
      { path: `notes/${uid}`, label: "Notes" },
      { path: `reminders/${uid}`, label: "Reminders" },
      { path: `calendarEvents/${uid}`, label: "Calendar" },
      { path: `memory/${uid}`, label: "Memory" },
      { path: `dayLog/${uid}`, label: "Day Log" },
    ];

    let summary = "";

    for (let { path, label } of paths) {
      try {
        const snap = await get(ref(db, path));
        if (!snap.exists()) {
          summary += `[${label}] No data\n`;
          continue;
        }

        const data = snap.val();
        const count = Object.keys(data).length;
        const preview = JSON.stringify(data, null, 2).slice(0, 200);
        summary += `[${label}] ${count} entries\n${preview}\n\n`;
      } catch (err) {
        summary += `[${label}] Error loading\n`;
      }
    }

    content.textContent = summary;
  });
};

// Render groups of logs
function renderLogGroups(logs = [], append = false) {
  const container = document.getElementById("onscreen-console-messages");
  if (!container) return;
  if (!append) container.innerHTML = "";

  const groups = {};

  logs.forEach(log => {
    if (!log || !log.tag || !log.content || !log.timestamp) return;
    if (!groups[log.tag]) groups[log.tag] = [];
    groups[log.tag].push(log);
  });

  Object.entries(groups)
    .sort((a, b) => {
      const aTime = a[1][a.length - 1].timestamp;
      const bTime = b[1][b.length - 1].timestamp;
      return aTime - bTime;
    })
    .forEach(([tag, entries]) => {
      const group = document.createElement("div");
      group.className = `log-group ${tag.toLowerCase()}`;

      const header = document.createElement("div");
      header.className = "group-header";
      header.textContent = `[${tag}] (${entries.length}) -- ${formatTimestamp(entries.at(-1).timestamp)}`;
      group.appendChild(header);

      const logList = document.createElement("div");
      logList.className = "log-list";
      logList.style.display = "none";

      entries.forEach(entry => {
        const line = document.createElement("div");
        line.className = "debug-line";
        line.textContent = `[${formatTimestamp(entry.timestamp)}] ${entry.content}`;
        logList.appendChild(line);
      });

      header.onclick = () => {
        logList.style.display = logList.style.display === "none" ? "block" : "none";
      };

      group.appendChild(logList);
      container.appendChild(group);
    });

  if (window.autoScrollConsole) {
    container.scrollTop = container.scrollHeight;
  }
}

// Inject styles + click handlers
document.addEventListener("DOMContentLoaded", () => {
  const style = document.createElement("style");
  style.textContent = `
    .log-group { border-left: 4px solid #444; margin: 8px 0; padding-left: 8px; }
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

  document.addEventListener("click", (e) => {
    if (e.target.classList.contains("debug-line")) {
      navigator.clipboard.writeText(e.target.textContent);
      e.target.classList.add("clicked");
      setTimeout(() => e.target.classList.remove("clicked"), 400);
    }
  });
});