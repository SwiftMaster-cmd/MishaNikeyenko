// 🔹 chat.js – dual-mode memory + hover-to-view debug/info overlay
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

import { db, auth } from "./firebaseconfig.js";
import {
  getMemory,
  getDayLog,
  getNotes,
  getCalendar,
  getReminders,
  getCalcHistory,
  buildSystemPrompt
} from "./memorymanager.js";
import {
  handleStaticCommand,
  listNotes,
  listReminders,
  listEvents
} from "./commandhandlers.js";
import { extractJson, detectMemoryType } from "./chatutils.js";

const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const log = document.getElementById("chat-log");

// --- Debug infrastructure ---
const debugInfo = [];
function addDebugMessage(text) {
  debugInfo.push(`${new Date().toLocaleTimeString()}: ${text}`);
  console.error("Debug:", text);
}

// Create overlay + toggle button if missing
function createDebugOverlay() {
  // Overlay container
  const overlay = document.createElement("div");
  overlay.id = "debug-overlay";
  Object.assign(overlay.style, {
    display: "none",
    position: "fixed",
    top: "0",
    left: "0",
    width: "100vw",
    height: "100vh",
    backgroundColor: "rgba(0, 0, 0, 0.9)",
    color: "#fff",
    zIndex: 10000,
    padding: "2rem",
    boxSizing: "border-box",
    overflowY: "auto",
    fontFamily: "monospace"
  });

  // Close button
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "× Close Debug";
  Object.assign(closeBtn.style, {
    position: "fixed",
    top: "1rem",
    right: "1rem",
    background: "#444",
    color: "#fff",
    border: "none",
    padding: "0.5rem 1rem",
    cursor: "pointer",
    fontSize: "1rem",
    borderRadius: "4px"
  });
  closeBtn.addEventListener("click", () => overlay.style.display = "none");

  // Content container
  const content = document.createElement("pre");
  content.id = "debug-content";
  Object.assign(content.style, {
    whiteSpace: "pre-wrap",
    marginTop: "3rem"
  });

  overlay.appendChild(closeBtn);
  overlay.appendChild(content);
  document.body.appendChild(overlay);

  // Toggle button in page header if missing
  if (!document.getElementById("debug-toggle")) {
    const btn = document.createElement("button");
    btn.id = "debug-toggle";
    btn.textContent = "🔍 Debug";
    Object.assign(btn.style, {
      position: "fixed",
      bottom: "1rem",
      right: "1rem",
      background: "#7e3af2",
      color: "#fff",
      border: "none",
      padding: "0.5rem 1rem",
      cursor: "pointer",
      borderRadius: "4px",
      zIndex: 10001
    });
    btn.addEventListener("click", showDebugOverlay);
    document.body.appendChild(btn);
  }
}

function showDebugOverlay() {
  const overlay = document.getElementById("debug-overlay");
  const content = document.getElementById("debug-content");
  if (!overlay || !content) return;
  content.textContent = debugInfo.join("\n");
  overlay.style.display = "block";
}

// Initialize debug UI
createDebugOverlay();

// --- Scrolling helpers ---
let userHasScrolled = false;
log.addEventListener("scroll", () => {
  const threshold = 100;
  userHasScrolled = log.scrollTop + log.clientHeight + threshold < log.scrollHeight;
});
function scrollToBottom(force = false) {
  if (!userHasScrolled || force) {
    requestAnimationFrame(() => {
      log.scrollTop = log.scrollHeight;
    });
  }
}

// --- Message rendering ---
function renderMessages(messages) {
  log.innerHTML = "";
  messages
    .sort((a, b) => a.timestamp - b.timestamp)
    .forEach(msg => {
      const roleClass = msg.role === "user"
        ? "user-msg"
        : msg.role === "assistant"
          ? "bot-msg"
          : "debug-msg";
      const div = document.createElement("div");
      div.className = `msg ${roleClass}`;
      div.innerHTML = msg.content;
      log.appendChild(div);
    });
  scrollToBottom();
}

// --- Firebase auth & listener ---
let uid = null;
let chatRef = null;

onAuthStateChanged(auth, user => {
  if (!user) {
    signInAnonymously(auth);
    addDebugMessage("Signed in anonymously");
    return;
  }
  uid = user.uid;
  chatRef = ref(db, `chathistory/${uid}`);

  onValue(chatRef, snap => {
    const data = snap.val() || {};
    const msgs = Object.entries(data).map(([id, m]) => ({
      id,
      role: m.role === "bot" ? "assistant" : m.role,
      content: m.content,
      timestamp: m.timestamp || 0
    }));
    renderMessages(msgs.slice(-20));
  }, err => {
    addDebugMessage("onValue error: " + err.message);
  });
});

// --- Form submission & GPT logic ---
form.addEventListener("submit", async e => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt || !chatRef || !uid) return;
  input.value = "";

  // Static commands
  const cmds = ["/time","/date","/uid","/clearchat","/summary","/commands"];
  if (cmds.includes(prompt)) {
    return handleStaticCommand(prompt, chatRef, uid);
  }
  if (prompt === "/notes") return listNotes(chatRef);
  if (prompt === "/reminders") return listReminders(chatRef);
  if (prompt === "/events") return listEvents(chatRef);

  // Push user message
  const now = Date.now();
  await push(chatRef, { role: "user", content: prompt, timestamp: now });

  // Async GPT + memory
  (async () => {
    // Fetch last 20
    let last20 = [];
    try {
      const snap = await get(child(ref(db), `chatHistory/${uid}`));
      const data = snap.exists() ? snap.val() : {};
      last20 = Object.values(data)
        .map(m => ({
          role: m.role === "bot" ? "assistant" : m.role,
          content: m.content,
          timestamp: m.timestamp || 0
        }))
        .sort((a,b) => a.timestamp - b.timestamp)
        .slice(-20);
    } catch (err) {
      addDebugMessage("Fetch last20 error: " + err.message);
    }

    // Fetch memory data
    const today = new Date().toISOString().slice(0,10);
    let memory, dayLog, notes, calendar, reminders, calc;
    try {
      [memory, dayLog, notes, calendar, reminders, calc] = await Promise.all([
        getMemory(uid),
        getDayLog(uid, today),
        getNotes(uid),
        getCalendar(uid),
        getReminders(uid),
        getCalcHistory(uid),
      ]);
    } catch (err) {
      addDebugMessage("Memory fetch error: " + err.message);
    }

    // Build system prompt
    const sysPrompt = buildSystemPrompt({
      memory, todayLog: dayLog, notes, calendar, reminders, calc, date: today
    });
    const full = [{ role: "system", content: sysPrompt }, ...last20];

    // Memory extraction
    const { memoryType, rawPrompt } = detectMemoryType(prompt);
    if (memoryType) {
      try {
        const res = await fetch(`${window.location.origin}/.netlify/functions/chatgpt`, {
          method: "POST",
          headers: {"Content-Type":"application/json"},
          body: JSON.stringify({
            messages: [
              { role:"system", content: `
You are a memory extraction engine. ALWAYS return exactly one JSON object with:
{ "type": "note"|"reminder"|"calendar"|"log", "content":"string", "date":"YYYY-MM-DD" }
…`} ,
              { role:"user", content: memoryType.startsWith("/") ? rawPrompt : prompt }
            ],
            model:"gpt-4o", temperature:0.3
          })
        });
        const memJson = await res.json();
        const content = memJson.choices?.[0]?.message?.content;
        const parsed = JSON.parse(content);
        if (parsed.type && parsed.content) {
          const path = parsed.type==="calendar"
            ? `calendarEvents/${uid}`
            : parsed.type==="reminder"
              ? `reminders/${uid}`
              : parsed.type==="log"
                ? `dayLog/${uid}/${today}`
                : `notes/${uid}/${today}`;
          await push(ref(db, path), {
            content: parsed.content, timestamp: Date.now(),
            ...(parsed.date ? { date: parsed.date } : {})
          });
          addDebugMessage(`Saved memory: ${parsed.type}`);
        } else {
          addDebugMessage("Memory parse returned invalid object");
        }
      } catch (err) {
        addDebugMessage("Memory write failed: " + err.message);
      }
    }

    // GPT reply
    let assistantReply = "[No reply]";
    try {
      const replyRes = await fetch(`${window.location.origin}/.netlify/functions/chatgpt`, {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ messages: full, model:"gpt-4o", temperature:0.8 })
      });
      const replyData = await replyRes.json();
      assistantReply = replyData.choices?.[0]?.message?.content || assistantReply;
    } catch (err) {
      addDebugMessage("GPT reply error: " + err.message);
    }

    // Push assistant reply
    await push(chatRef, {
      role: "assistant",
      content: assistantReply,
      timestamp: Date.now()
    });
  })();

  // Summary every 20 messages
  (async () => {
    try {
      const snap = await get(child(ref(db), `chatHistory/${uid}`));
      const data = snap.exists() ? snap.val() : {};
      const count = Object.keys(data).length;
      if (count % 20 === 0) {
        const last20 = Object.values(data)
          .map(m => ({
            role: m.role==="bot"?"Assistant":"User",
            content: m.content,
            timestamp: m.timestamp
          }))
          .sort((a,b) => a.timestamp - b.timestamp)
          .slice(-20)
          .map(m => `${m.role}: ${m.content}`)
          .join("\n");
        const sumRes = await fetch(`${window.location.origin}/.netlify/functions/chatgpt`, {
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body: JSON.stringify({
            messages:[
              { role:"system", content:"You are a concise summarizer. Summarize the following conversation into one paragraph:" },
              { role:"user", content: last20 }
            ],
            model:"gpt-4o", temperature:0.5
          })
        });
        const sumJson = await sumRes.json();
        const summary = sumJson.choices?.[0]?.message?.content || "[No summary]";
        await push(ref(db, `memory/${uid}`), { summary, timestamp: Date.now() });
        addDebugMessage("20-msg summary saved");
      }
    } catch (err) {
      addDebugMessage("Summary error: " + err.message);
    }
  })();
});