// 🔹 chat.js – dual-mode memory saving + enhanced context + GIF support
import {
  ref,
  push,
  onValue,
  get,
  child
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import { db, auth } from "./firebaseConfig.js";
import {
  getMemory,
  getDayLog,
  getNotes,
  getCalendar,
  getReminders,
  getCalcHistory,
  getLocation,
  getPreferences,
  buildSystemPrompt
} from "./memoryManager.js";
import {
  handleStaticCommand,
  listNotes,
  listReminders,
  listEvents
} from "./commandHandlers.js";
import { extractJson, detectMemoryType } from "./chatUtils.js";

const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const log = document.getElementById("chat-log");

// Store debug lines here; not in chat bubbles
const debugInfo = [];

// Giphy API key
const GIPHY_API_KEY = "pZmJaNsF62Lie54ZMcn7qtVujC7sQ7KA";

// Add a debug message to internal array
function addDebugMessage(text) {
  debugInfo.push(text);
  console.debug("[DEBUG]", text);
}

// Create a hidden overlay for debug info
function createDebugOverlay() {
  const overlay = document.createElement("div");
  overlay.id = "debug-overlay";
  Object.assign(overlay.style, {
    display: "none",
    position: "fixed",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    backgroundColor: "rgba(0, 0, 0, 0.9)",
    color: "#fff",
    padding: "20px",
    borderRadius: "8px",
    maxHeight: "70vh",
    maxWidth: "80vw",
    overflowY: "auto",
    zIndex: 10000,
    boxShadow: "0 2px 10px rgba(0,0,0,0.5)"
  });

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "Close";
  Object.assign(closeBtn.style, {
    position: "absolute",
    top: "10px",
    right: "10px",
    background: "#444",
    color: "#fff",
    border: "none",
    padding: "6px 10px",
    cursor: "pointer",
    borderRadius: "4px"
  });
  closeBtn.addEventListener("click", () => {
    overlay.style.display = "none";
  });
  overlay.appendChild(closeBtn);

  const contentDiv = document.createElement("div");
  contentDiv.id = "debug-content";
  Object.assign(contentDiv.style, {
    marginTop: "30px",
    whiteSpace: "pre-wrap",
    fontFamily: "monospace",
    fontSize: "14px"
  });
  overlay.appendChild(contentDiv);

  document.body.appendChild(overlay);
}

// Show and populate debug overlay
function showDebugOverlay() {
  const overlay = document.getElementById("debug-overlay");
  const contentDiv = document.getElementById("debug-content");
  if (!overlay || !contentDiv) return;
  contentDiv.textContent = debugInfo.join("\n");
  overlay.style.display = "block";
}

// Scroll logic
let userHasScrolled = false;
log.addEventListener("scroll", () => {
  const threshold = 100;
  userHasScrolled = (log.scrollTop + log.clientHeight + threshold < log.scrollHeight);
});
function scrollToBottom(force = false) {
  if (!userHasScrolled || force) {
    requestAnimationFrame(() => {
      log.scrollTop = log.scrollHeight;
    });
  }
}

// Render last 20 messages, attach info icon to last assistant bubble
function renderMessages(messages) {
  log.innerHTML = "";
  messages
    .sort((a, b) => a.timestamp - b.timestamp)
    .forEach((msg) => {
      const role = msg.role === "bot" ? "assistant" : msg.role;
      const div = document.createElement("div");
      div.className = `msg ${
        role === "user" ? "user-msg" :
        role === "assistant" ? "bot-msg" :
        "debug-msg"
      }`;
      div.innerHTML = msg.content;
      log.appendChild(div);
    });

  const assistantBubbles = log.querySelectorAll(".bot-msg");
  if (assistantBubbles.length) {
    const lastBubble = assistantBubbles[assistantBubbles.length - 1];
    attachInfoIcon(lastBubble);
  }

  scrollToBottom();
}

// Attach a small ℹ️ icon to the given assistant bubble
function attachInfoIcon(bubble) {
  const existing = bubble.querySelector(".info-icon");
  if (existing) existing.remove();

  const icon = document.createElement("span");
  icon.className = "info-icon";
  icon.textContent = " ℹ️";
  Object.assign(icon.style, {
    cursor: "pointer",
    fontSize: "0.9em",
    marginLeft: "6px",
    opacity: "0.6"
  });
  icon.addEventListener("click", showDebugOverlay);
  bubble.appendChild(icon);
}

// Minimal CSS for info icon
const style = document.createElement("style");
style.textContent = `
  .bot-msg {
    position: relative;
  }
  .info-icon {
    display: inline;
  }
  .bot-msg:hover .info-icon {
    opacity: 1;
  }
`;
document.head.appendChild(style);

// Create debug overlay on load
createDebugOverlay();

let uid = null;
let chatRef = null;

onAuthStateChanged(auth, (user) => {
  if (!user) {
    signInAnonymously(auth);
    addDebugMessage("Auth: Signed in anonymously.");
    return;
  }
  uid = user.uid;
  chatRef = ref(db, `chatHistory/${uid}`);

  // Listen for last 20 messages
  onValue(chatRef, (snapshot) => {
    const data = snapshot.val() || {};
    const allMessages = Object.entries(data).map(([id, msg]) => ({
      id,
      role: msg.role === "bot" ? "assistant" : msg.role,
      content: msg.content,
      timestamp: msg.timestamp || 0
    }));
    const last20 = allMessages
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-20);
    renderMessages(last20);
  });

  // Capture geolocation once
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude, longitude } = pos.coords;
      await push(ref(db, `location/${uid}`), {
        lat: latitude,
        lon: longitude,
        timestamp: Date.now()
      });
      addDebugMessage(`Location saved: ${latitude.toFixed(3)},${longitude.toFixed(3)}`);
    }, (err) => {
      addDebugMessage("Geolocation error: " + err.message);
    });
  }

  // Pattern mining (last 30 days of notes)
  (async () => {
    try {
      const aggregated = {};
      for (let i = 0; i < 30; i++) {
        const date = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
        const snap = await get(child(ref(db), `notes/${uid}/${date}`));
        if (!snap.exists()) continue;
        Object.values(snap.val()).forEach(entry => {
          entry.content.split(/\W+/).forEach(word => {
            const w = word.toLowerCase();
            if (w.length > 3) {
              aggregated[w] = (aggregated[w] || 0) + 1;
            }
          });
        });
      }
      const patterns = Object.entries(aggregated)
        .filter(([, cnt]) => cnt >= 3)
        .map(([kw]) => kw);
      if (patterns.length) {
        await push(ref(db, `memory/${uid}`), {
          type: "pattern",
          content: `Frequent keywords: ${patterns.join(", ")}`,
          timestamp: Date.now()
        });
        addDebugMessage("Pattern summary saved to memory");
      }
    } catch (err) {
      addDebugMessage("Pattern mining failed: " + err.message);
    }
  })();
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt || !chatRef || !uid) return;
  input.value = "";

  // ── Handle static & listing commands ──
  const staticCommands = ["/time", "/date", "/uid", "/clearchat", "/summary", "/commands"];
  if (staticCommands.includes(prompt)) {
    await handleStaticCommand(prompt, chatRef, uid);
    return;
  }
  if (prompt === "/notes") {
    await listNotes(chatRef);
    return;
  }
  if (prompt === "/reminders") {
    await listReminders(chatRef);
    return;
  }
  if (prompt === "/events") {
    await listEvents(chatRef);
    return;
  }
  if (prompt.startsWith("/gif ")) {
    // User-triggered GIF command
    const term = prompt.slice(5).trim();
    try {
      const resp = await fetch(
        `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}` +
        `&q=${encodeURIComponent(term)}&limit=1&rating=pg-13`
      );
      const { data } = await resp.json();
      if (data && data.length) {
        const gifUrl = data[0].images.fixed_height.url;
        await push(chatRef, {
          role: "assistant",
          content: `<img src="${gifUrl}" alt="${term}" style="max-width:300px; border-radius:8px;" />`,
          timestamp: Date.now()
        });
      } else {
        await push(chatRef, {
          role: "assistant",
          content: `Sorry, I couldn't find a GIF for "${term}".`,
          timestamp: Date.now()
        });
      }
    } catch (err) {
      await push(chatRef, {
        role: "assistant",
        content: `Error fetching GIF: ${err.message}`,
        timestamp: Date.now()
      });
    }
    return;
  }

  // ── 1) Push user message ──
  await push(chatRef, { role: "user", content: prompt, timestamp: Date.now() });

  // ── 2) Assistant reply & memory writes (non-blocking) ──
  (async () => {
    const today = new Date().toISOString().slice(0, 10);

    // a) Fetch last 20 messages for context
    let last20 = [];
    try {
      const snap = await get(child(ref(db), `chatHistory/${uid}`));
      const data = snap.exists() ? snap.val() : {};
      const allMsgs = Object.entries(data).map(([id, msg]) => ({
        role: msg.role === "bot" ? "assistant" : msg.role,
        content: msg.content,
        timestamp: msg.timestamp || 0
      }));
      last20 = allMsgs
        .sort((a, b) => a.timestamp - b.timestamp)
        .slice(-20);
    } catch (err) {
      addDebugMessage("Error fetching last 20 for reply: " + err.message);
    }

    // b) Fetch context slices
    const [memory, dayLog, notes, calendar, reminders, calc, locationBlock, prefBlock] = await Promise.all([
      getMemory(uid),
      getDayLog(uid, today),
      getNotes(uid),
      getCalendar(uid),
      getReminders(uid),
      getCalcHistory(uid),
      getLocation(uid),
      getPreferences(uid)
    ]);

    // c) Build enhanced system prompt
    const sysPrompt = await buildSystemPrompt({
      uid,
      memory,
      todayLog: dayLog,
      notes,
      calendar,
      reminders,
      calc,
      date: today
    });
    const full = [{ role: "system", content: sysPrompt }, ...last20];

    // d) Memory-type detection & writes (including preference)
    const { memoryType, rawPrompt } = detectMemoryType(prompt);
    if (memoryType) {
      try {
        const parsed = await fetch("/.netlify/functions/chatgpt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [
              {
                role: "system",
                content: `
You are a memory extraction engine. ALWAYS return exactly one JSON object with these keys:
{
  "type":   "note" | "reminder" | "calendar" | "log" | "preference",
  "content": "string",
  "date":   "optional YYYY-MM-DD"
}

RULES:
1. If text begins with "/note", type="note".
2. If it begins with "/reminder" or "remind me", type="reminder".
3. If it mentions a date/time (e.g. "tomorrow", "Friday", "on 2025-06-10"), type="calendar".
4. If it begins with "/log" or includes "journal", type="log".
5. If it expresses a like/dislike (starts with "I like", "I love", "I prefer", "I hate", "I dislike"), type="preference".
6. Otherwise, type="note" as a last resort.
7. Populate "date" only when explicitly given.
8. Return ONLY the JSON block.`
              },
              { role: "user", content: memoryType.startsWith("/") ? rawPrompt : prompt }
            ],
            model: "gpt-4o",
            temperature: 0.3
          })
        });
        const text = await parsed.text();
        const parsedJSON = JSON.parse(text);
        const extracted = extractJson(parsedJSON.choices?.[0]?.message?.content || "");
        if (extracted?.type && extracted?.content) {
          let path;
          switch (extracted.type) {
            case "calendar":
              path = `calendarEvents/${uid}`; break;
            case "reminder":
              path = `reminders/${uid}`; break;
            case "log":
              path = `dayLog/${uid}/${today}`; break;
            case "preference":
              path = `preferences/${uid}`; break;
            default:
              path = `notes/${uid}/${today}`;
          }
          await push(ref(db, path), {
            content: extracted.content,
            timestamp: Date.now(),
            ...(extracted.date ? { date: extracted.date } : {})
          });
          addDebugMessage(`Memory saved: type=${extracted.type}, content="${extracted.content}"`);
        } else {
          addDebugMessage("Incomplete memory structure returned");
        }
      } catch (err) {
        addDebugMessage("Memory parse/write failed: " + err.message);
      }
    }

    // e) Fetch assistant’s reply from GPT
    let rawReply = "[No reply]";
    try {
      const replyRes = await fetch("/.netlify/functions/chatgpt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: full, model: "gpt-4o", temperature: 0.8 })
      });
      const replyData = await replyRes.json();
      rawReply = replyData.choices?.[0]?.message?.content || rawReply;
    } catch (err) {
      addDebugMessage("GPT reply error: " + err.message);
    }

    // f) Handle possible GIF instruction
    if (rawReply.startsWith("GIF:")) {
      const term = rawReply.slice(4).trim();
      try {
        const resp = await fetch(
          `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}` +
          `&q=${encodeURIComponent(term)}&limit=1&rating=pg-13`
        );
        const { data } = await resp.json();
        if (data && data.length) {
          const gifUrl = data[0].images.fixed_height.url;
          await push(chatRef, {
            role: "assistant",
            content: `<img src="${gifUrl}" alt="${term}" style="max-width:300px; border-radius:8px;" />`,
            timestamp: Date.now()
          });
        } else {
          await push(chatRef, {
            role: "assistant",
            content: `Sorry, I couldn't find a GIF for "${term}".`,
            timestamp: Date.now()
          });
        }
      } catch (err) {
        await push(chatRef, {
          role: "assistant",
          content: `Error fetching GIF: ${err.message}`,
          timestamp: Date.now()
        });
      }
    } else {
      // Normal text reply
      await push(chatRef, { role: "assistant", content: rawReply, timestamp: Date.now() });
    }
  })();

  // ── 3) In parallel: Every 20 messages → summarize last 20 into memory ──
  (async () => {
    let allCount = 0;
    let last20ForSummary = [];
    try {
      const snap = await get(child(ref(db), `chatHistory/${uid}`));
      const data = snap.exists() ? snap.val() : {};
      allCount = Object.keys(data).length;
      const allMessages = Object.entries(data).map(([id, msg]) => ({
        role: msg.role === "bot" ? "assistant" : msg.role,
        content: