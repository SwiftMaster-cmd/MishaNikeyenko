// 🔹 chat.js – dual-mode memory saving + hover-to-view debug/info overlay

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
const debugToggle = document.getElementById("debug-toggle");

let uid = null;
let chatRef = null;
let userHasScrolled = false;
const debugInfo = [];

/** Debug overlay */
function addDebugMessage(text) {
  debugInfo.push(`${new Date().toLocaleTimeString()}: ${text}`);
}
function createDebugOverlay() {
  const overlay = document.createElement("div");
  overlay.id = "debug-overlay";
  Object.assign(overlay.style, {
    display: "none",
    position: "fixed",
    top: "0",
    left: "0",
    width: "100vw",
    height: "100vh",
    backgroundColor: "rgba(0,0,0,0.85)",
    zIndex: 9999
  });
  const modal = document.createElement("div");
  modal.id = "debug-modal";
  Object.assign(modal.style, {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    backgroundColor: "var(--clr-card)",
    color:      "var(--clr-text)",
    padding:    "1rem 1.5rem",
    borderRadius: "12px",
    maxWidth:   "80vw",
    maxHeight:  "80vh",
    overflowY:  "auto",
    border:     "1px solid var(--clr-border)"
  });
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "Close";
  Object.assign(closeBtn.style, {
    position: "absolute",
    top: "8px",
    right: "8px",
    background: "var(--clr-border)",
    color:      "var(--clr-text)",
    padding:    "4px 8px",
    border:     "none",
    cursor:     "pointer",
    borderRadius: "4px"
  });
  closeBtn.addEventListener("click", () => overlay.style.display = "none");
  const content = document.createElement("pre");
  content.id = "debug-content";
  Object.assign(content.style, {
    marginTop: "32px",
    whiteSpace: "pre-wrap",
    fontFamily: "monospace",
    fontSize: "0.9rem"
  });
  modal.append(closeBtn, content);
  overlay.append(modal);
  document.body.append(overlay);
}
function showDebugOverlay() {
  const overlay = document.getElementById("debug-overlay");
  const content = document.getElementById("debug-content");
  content.textContent = debugInfo.join("\n");
  overlay.style.display = "block";
}

/** Scrolling */
log.addEventListener("scroll", () => {
  userHasScrolled = log.scrollTop + log.clientHeight + 100 < log.scrollHeight;
});
function scrollToBottom(force = false) {
  if (!userHasScrolled || force) {
    requestAnimationFrame(() => {
      log.scrollTop = log.scrollHeight;
    });
  }
}

/** Render messages */
function renderMessages(messages) {
  log.innerHTML = "";
  messages
    .sort((a, b) => a.timestamp - b.timestamp)
    .forEach(({ role, content }) => {
      const div = document.createElement("div");
      div.className = role === "user"
        ? "msg user-msg"
        : role === "assistant"
        ? "msg bot-msg"
        : "msg debug-msg";
      div.innerHTML = content;
      log.append(div);
    });
  scrollToBottom();
}

/** Auth & initial listeners */
createDebugOverlay();
if (debugToggle) debugToggle.addEventListener("click", showDebugOverlay);

onAuthStateChanged(auth, (user) => {
  if (!user) {
    signInAnonymously(auth);
    addDebugMessage("Signed in anonymously");
    return;
  }
  uid = user.uid;
  chatRef = ref(db, `chatHistory/${uid}`);

  onValue(chatRef, (snap) => {
    const data = snap.val() || {};
    const all = Object.values(data).map(msg => ({
      role: msg.role === "bot" ? "assistant" : msg.role,
      content: msg.content,
      timestamp: msg.timestamp || 0
    }));
    renderMessages(all.slice(-20));
  });
});

/** Form submit */
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text || !chatRef || !uid) return;
  input.value = "";
  userHasScrolled = false;

  // static commands
  const staticList = ["/time","/date","/uid","/clearchat","/summary","/commands"];
  if (staticList.includes(text)) {
    await handleStaticCommand(text, chatRef, uid);
    return;
  }
  if (text === "/notes")     { await listNotes(chatRef);     return; }
  if (text === "/reminders") { await listReminders(chatRef); return; }
  if (text === "/events")    { await listEvents(chatRef);    return; }

  // push user
  const ts = Date.now();
  await push(chatRef, { role: "user", content: text, timestamp: ts });

  // async memory + reply
  (async () => {
    const today = new Date().toISOString().slice(0,10);
    let last20 = [];
    try {
      const snap = await get(child(ref(db), `chatHistory/${uid}`));
      const data = snap.exists() ? snap.val() : {};
      last20 = Object.values(data)
        .map(m => ({
          role: m.role==="bot"?"assistant":m.role,
          content: m.content,
          timestamp: m.timestamp||0
        }))
        .sort((a,b)=>a.timestamp-b.timestamp)
        .slice(-20);
    } catch(err) {
      addDebugMessage("Fetch history failed: "+err.message);
    }

    // load memory slices
    const [memory, dayLog, notes, calendar, reminders, calc] = await Promise.all([
      getMemory(uid),
      getDayLog(uid, today),
      getNotes(uid),
      getCalendar(uid),
      getReminders(uid),
      getCalcHistory(uid)
    ]);

    // build system prompt
    const sys = buildSystemPrompt({
      memory, todayLog: dayLog, notes, calendar, reminders, calc, date: today
    });
    const convo = [{role:"system",content:sys}, ...last20];

    // detect & save memory
    const { memoryType, rawPrompt } = detectMemoryType(text);
    if (memoryType) {
      try {
        const memRes = await fetch("/.netlify/functions/chatgpt", {
          method: "POST",
          headers: {"Content-Type":"application/json"},
          body: JSON.stringify({
            model: "gpt-4o",
            temperature: 0.3,
            messages: [
              { role: "system", content: `
You are a memory extraction engine. ALWAYS return exactly one JSON object...
` },
              { role: "user", content: memoryType.startsWith("/")?rawPrompt:text }
            ]
          })
        });
        const memJson = await memRes.json();
        const parsed = extractJson(memJson.choices[0].message.content);
        if (parsed?.type && parsed?.content) {
          const path = parsed.type==="calendar"
            ? `calendarEvents/${uid}`
            : parsed.type==="reminder"
            ? `reminders/${uid}`
            : parsed.type==="log"
            ? `dayLog/${uid}/${today}`
            : `notes/${uid}/${today}`;
          await push(ref(db, path), {
            content: parsed.content,
            timestamp: Date.now(),
            ...(parsed.date?{date:parsed.date}:{})
          });
          addDebugMessage(`Saved ${parsed.type}`);
        }
      } catch(err) {
        addDebugMessage("Memory save failed: "+err.message);
      }
    }

    // get assistant reply
    let reply = "[No reply]";
    try {
      const res = await fetch("/.netlify/functions/chatgpt", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ model: "gpt-4o", temperature: 0.8, messages: convo })
      });
      const json = await res.json();
      reply = json.choices?.[0]?.message?.content || reply;
    } catch(err) {
      addDebugMessage("GPT error: "+err.message);
    }
    await push(chatRef, { role: "assistant", content: reply, timestamp: Date.now() });
  })();
});