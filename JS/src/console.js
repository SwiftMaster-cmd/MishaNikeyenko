import { ref, get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { db, auth } from "./firebaseConfig.js";
import { getNotes, getReminders, getCalendar, getMemory, getDayLog } from "./memoryManager.js";

const LOG_KEY = "assistantDebugLog";
window.autoScrollConsole = true;
window.DEBUG_MODE = true;

// === Persistence ===
function loadLogs() {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    return Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLogs(logs) {
  localStorage.setItem(LOG_KEY, JSON.stringify(logs));
}

// === Logging ===
window.debugLog = function (...args) {
  const logs = loadLogs();
  const msg = args.map(a => typeof a === "object" ? JSON.stringify(a, null, 2) : a).join(" ");
  const tag = /^\[(\w+)\]/.exec(msg)?.[1]?.toUpperCase() || "INFO";
  const ts = new Date().toISOString();

  logs.push({ tag, timestamp: ts, content: msg });
  saveLogs(logs);
  renderLogGroups([logs.at(-1)]);
};

window.clearDebugLog = () => {
  localStorage.removeItem(LOG_KEY);
  renderLogGroups([]);
};

window.exportDebugLog = () => {
  const logs = loadLogs();
  const blob = new Blob([logs.map(l => `[${l.timestamp}] ${l.content}`).join("\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), {
    href: url,
    download: `assistant-log-${new Date().toISOString().slice(0, 10)}.txt`
  });
  a.click();
  URL.revokeObjectURL(url);
};

window.setStatusFeedback = (type, msg = "") => {
  const bar = document.getElementById("chat-status-bar");
  if (!bar) return;

  const styles = {
    success: { color: "#1db954", bg: "#1db95422" },
    error: { color: "#d7263d", bg: "#d7263d22" },
    loading: { color: "#ffd600", bg: "#ffd60022" }
  };

  if (!styles[type]) {
    bar.style.opacity = 0;
    return;
  }

  bar.textContent = msg;
  bar.style.color = styles[type].color;
  bar.style.background = styles[type].bg;
  bar.style.opacity = 1;

  if (type !== "loading") setTimeout(() => (bar.style.opacity = 0), 1800);
};

window.logAssistantReply = reply => {
  const preview = reply.length > 80 ? reply.slice(0, 77) + "..." : reply;
  window.debugLog("[REPLY]", preview);
  window.setStatusFeedback("success", "Assistant responded");
};

// === Debug Panel & Overlay ===
window.showDebugOverlay = () => {
  const overlay = document.getElementById("debug-overlay");
  const content = document.getElementById("debug-content");
  const logs = loadLogs();
  if (!overlay || !content) return;
  content.textContent = logs.length ? logs.map(l => `[${l.timestamp}] ${l.content}`).join("\n") : "No logs yet.";
  overlay.style.display = "flex";
};

// === Log Rendering ===
function renderLogGroups(logs) {
  const container = document.getElementById("onscreen-console-messages");
  if (!container) return;

  const all = logs.length ? [...loadLogs(), ...logs] : loadLogs();
  const grouped = {};
  all.forEach(log => {
    if (!log.tag) return;
    grouped[log.tag] = grouped[log.tag] || [];
    grouped[log.tag].push(log);
  });

  container.innerHTML = "";

  Object.entries(grouped)
    .sort((a, b) => new Date(b[1].at(-1).timestamp) - new Date(a[1].at(-1).timestamp))
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

      entries.forEach(entry => {
        const line = document.createElement("div");
        line.className = "debug-line";
        line.textContent = `[${formatTime(entry.timestamp)}] ${entry.content}`;
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

function formatTime(ts) {
  const d = new Date(ts);
  return isNaN(d) ? "Invalid time" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// === Summarize Firebase nodes
window.fetchFirebaseSummaries = async () => {
  const uid = auth.currentUser?.uid;
  if (!uid) return window.debugLog("[ERROR] No user");

  try {
    const nodes = {
      notes: await getNotes(uid),
      reminders: await getReminders(uid),
      calendar: await getCalendar(uid),
      memory: await getMemory(uid),
      log: await getDayLog(uid, new Date().toISOString().slice(0, 10))
    };

    const prompt = `
Summarize each node in 1 short line.
Respond ONLY in this JSON format:
{
  "notes": "...",
  "reminders": "...",
  "calendar": "...",
  "memory": "...",
  "log": "..."
}`;

    const res = await fetch("/.netlify/functions/chatgpt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: JSON.stringify(nodes, null, 2) }
        ],
        model: "gpt-4o",
        temperature: 0.3
      })
    });

    const raw = await res.text();
    const parsed = JSON.parse(raw.match(/{[\s\S]+}/)?.[0] || "{}");

    Object.entries(parsed).forEach(([k, v]) =>
      window.debugLog(`[INFO] ${k.toUpperCase()}: ${v}`)
    );
  } catch (err) {
    window.debugLog("[ERROR] Failed to fetch summaries:", err.message);
  }
};

// === Init
document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.getElementById("console-toggle-btn");
  const panel = document.getElementById("onscreen-console");

  if (toggle && panel) {
    toggle.onclick = () => {
      panel.style.display = panel.style.display === "block" ? "none" : "block";
      if (panel.style.display === "block") renderLogGroups([]);
    };
  }

  document.addEventListener("click", (e) => {
    if (e.target.classList.contains("debug-line")) {
      navigator.clipboard.writeText(e.target.textContent);
      e.target.classList.add("clicked");
      setTimeout(() => e.target.classList.remove("clicked"), 300);
    }
  });

  renderLogGroups([]);
});