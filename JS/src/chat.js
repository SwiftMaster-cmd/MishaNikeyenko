// 🔹 chat.js – dual‐mode memory saving + hover‐to‐view debug/info overlay
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

// Store debug messages in this array instead of appending to chat
const debugInfo = [];

let uid = null;
let chatRef = null;
let userHasScrolled = false;

function addDebugMessage(text) {
  // Push into debugInfo array; not appended to chat
  debugInfo.push(text);
}

// Create the debug overlay element (hidden by default)
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

  // Close button
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

  // Container for debug lines
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

// Populate and show the debug overlay
function showDebugOverlay() {
  const overlay = document.getElementById("debug-overlay");
  const contentDiv = document.getElementById("debug-content");
  if (!overlay || !contentDiv) return;
  // Combine all debugInfo entries into one string
  contentDiv.textContent = debugInfo.join("\n");
  overlay.style.display = "block";
}

// Scroll log to bottom unless user manually scrolled up
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

// Render the last 20 messages, and add an info icon to the most recent assistant bubble
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
      div.textContent = msg.content;
      log.appendChild(div);
    });

  // After rendering all messages, locate the last assistant message
  const assistantBubbles = log.querySelectorAll(".bot-msg");
  if (assistantBubbles.length > 0) {
    const lastBubble = assistantBubbles[assistantBubbles.length - 1];
    attachInfoIcon(lastBubble);
  }

  scrollToBottom();
}

// Attach a small "ℹ️" icon to the given assistant bubble element
function attachInfoIcon(bubbleElement) {
  // Remove any existing icons to avoid duplicates
  const existingIcon = bubbleElement.querySelector(".info-icon");
  if (existingIcon) existingIcon.remove();

  const icon = document.createElement("span");
  icon.className = "info-icon";
  icon.textContent = " ℹ️";
  Object.assign(icon.style, {
    cursor: "pointer",
    fontSize: "0.9em",
    marginLeft: "6px",
    opacity: "0.6"
  });
  // Show overlay on click
  icon.addEventListener("click", showDebugOverlay);
  // Append to bubble
  bubbleElement.appendChild(icon);
}

// Initial debug overlay creation
createDebugOverlay();

onAuthStateChanged(auth, (user) => {
  if (!user) {
    signInAnonymously(auth);
    addDebugMessage("Auth: Signed in anonymously.");
    return;
  }
  uid = user.uid;
  chatRef = ref(db, `chatHistory/${uid}`);

  // Listen to chatHistory changes and re-render last 20
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
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt || !chatRef || !uid) return;
  input.value = "";

  // ── Handle static & listing commands first ──
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

  // ── 1) Push user message ──
  const now = Date.now();
  await push(chatRef, { role: "user", content: prompt, timestamp: now });

  // ── 2) In parallel: assistant reply + memory write ──
  (async () => {
    const today = new Date().toISOString().slice(0, 10);

    // Fetch last 20 messages for context
    let last20 = [];
    try {
      const snap = await get(child(ref(db), `chatHistory/${uid}`));
      const data = snap.exists() ? snap.val() : {};
      const allMessages = Object.entries(data).map(([id, msg]) => ({
        role: msg.role === "bot" ? "assistant" : msg.role,
        content: msg.content,
        timestamp: msg.timestamp || 0
      }));
      last20 = allMessages
        .sort((a, b) => a.timestamp - b.timestamp)
        .slice(-20);
    } catch (err) {
      addDebugMessage("Error fetching last 20 for reply: " + err.message);
    }

    // Fetch memory/context
    const [memory, dayLog, notes, calendar, reminders, calc] = await Promise.all([
      getMemory(uid),
      getDayLog(uid, today),
      getNotes(uid),
      getCalendar(uid),
      getReminders(uid),
      getCalcHistory(uid)
    ]);

    // Build system prompt + conversation for assistant
    const sysPrompt = buildSystemPrompt({
      memory,
      todayLog: dayLog,
      notes,
      calendar,
      reminders,
      calc,
      date: today
    });
    const full = [{ role: "system", content: sysPrompt }, ...last20];

    // Detect "memory" commands and write to appropriate nodes
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
  "type":   "note" | "reminder" | "calendar" | "log",
  "content": "string",
  "date":   "optional YYYY-MM-DD"
}

RULES:
1. If text begins with "/note", type="note".
2. If it begins with "/reminder" or "remind me", type="reminder".
3. If it mentions a date/time (e.g. "tomorrow", "Friday", "on 2025-06-10"), type="calendar".
4. If it begins with "/log" or includes "journal", type="log".
5. Otherwise, type="note" as a last resort.
6. Populate "date" only when explicitly given.
7. Return ONLY the JSON block.`
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
          const path =
            extracted.type === "calendar"
              ? `calendarEvents/${uid}`
              : extracted.type === "reminder"
              ? `reminders/${uid}`
              : extracted.type === "log"
              ? `dayLog/${uid}/${today}`
              : `notes/${uid}/${today}`;
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

    // Get the assistant’s reply from GPT
    let assistantReply = "[No reply]";
    try {
      const replyRes = await fetch("/.netlify/functions/chatgpt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: full, model: "gpt-4o", temperature: 0.8 })
      });
      const replyData = await replyRes.json();
      assistantReply = replyData.choices?.[0]?.message?.content || assistantReply;
    } catch (err) {
      addDebugMessage("GPT reply error: " + err.message);
    }

    // Push the assistant’s reply into chatHistory
    await push(chatRef, { role: "assistant", content: assistantReply, timestamp: Date.now() });
  })();

  // ── 3) In parallel: if total messages is a multiple of 20, summarize and save to memory ──
  (async () => {
    let allCount = 0;
    let last20ForSummary = [];
    try {
      const snap = await get(child(ref(db), `chatHistory/${uid}`));
      const data = snap.exists() ? snap.val() : {};
      allCount = Object.keys(data).length;
      const allMessages = Object.entries(data).map(([id, msg]) => ({
        role: msg.role === "bot" ? "assistant" : msg.role,
        content: msg.content,
        timestamp: msg.timestamp || 0
      }));
      last20ForSummary = allMessages
        .sort((a, b) => a.timestamp - b.timestamp)
        .slice(-20);
    } catch (err) {
      addDebugMessage("Error fetching chatHistory for summary: " + err.message);
      return;
    }

    if (allCount > 0 && allCount % 20 === 0) {
      const convoText = last20ForSummary
        .map(m => `${m.role === "assistant" ? "Assistant" : "User"}: ${m.content}`)
        .join("\n");

      try {
        const summaryRes = await fetch("/.netlify/functions/chatgpt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [
              {
                role: "system",
                content: `You are a concise summarizer. Summarize the following conversation block into one paragraph:`
              },
              { role: "user", content: convoText }
            ],
            model: "gpt-4o",
            temperature: 0.5
          })
        });
        const summaryJson = await summaryRes.json();
        const summary = summaryJson.choices?.[0]?.message?.content || "[No summary]";
        await push(ref(db, `memory/${uid}`), {
          summary,
          timestamp: Date.now()
        });
        addDebugMessage("20-message summary saved to memory");
      } catch (err) {
        addDebugMessage("Summary generation failed: " + err.message);
      }
    }
  })();
});