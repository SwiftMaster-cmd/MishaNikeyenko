// 🔹 chat.js – dual-mode memory saving + hover-to-view debug/info overlay
// [imports remain unchanged]
import {
  ref, push, onValue, get, child
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import { db, auth } from "./firebaseConfig.js";
import {
  getMemory, getDayLog, getNotes, getCalendar,
  getReminders, getCalcHistory, buildSystemPrompt
} from "./memoryManager.js";
import {
  handleStaticCommand, listNotes, listReminders, listEvents
} from "./commandHandlers.js";
import { extractJson, detectMemoryType } from "./chatUtils.js";

const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const log = document.getElementById("chat-log");
const debugInfo = [];

let uid = null;
let chatRef = null;
let userHasScrolled = false;

function addDebugMessage(text) {
  debugInfo.push(text);
}

function createDebugOverlay() {
  const overlay = document.createElement("div");
  overlay.id = "debug-overlay";
  Object.assign(overlay.style, {
    display: "none", position: "fixed", top: "0", left: "0",
    width: "100vw", height: "100vh", backgroundColor: "rgba(0,0,0,0.85)", zIndex: 9999
  });

  const modal = document.createElement("div");
  modal.id = "debug-modal";
  Object.assign(modal.style, {
    position: "absolute", top: "50%", left: "50%",
    transform: "translate(-50%, -50%)",
    backgroundColor: "var(--clr-card)", color: "var(--clr-text)",
    padding: "1rem 1.5rem", borderRadius: "12px", boxShadow: "0 2px 10px rgba(0,0,0,0.5)",
    maxWidth: "80vw", maxHeight: "80vh", overflowY: "auto",
    border: "1px solid var(--clr-border)"
  });

  const closeBtn = document.createElement("button");
  closeBtn.className = "close-btn";
  closeBtn.textContent = "Close";
  Object.assign(closeBtn.style, {
    position: "absolute", top: "8px", right: "8px",
    background: "var(--clr-border)", color: "var(--clr-text)",
    border: "none", padding: "4px 8px", cursor: "pointer",
    borderRadius: "4px", fontSize: "0.9rem"
  });
  closeBtn.addEventListener("click", () => { overlay.style.display = "none"; });

  const contentDiv = document.createElement("div");
  contentDiv.id = "debug-content";
  Object.assign(contentDiv.style, {
    marginTop: "32px", whiteSpace: "pre-wrap", fontFamily: "monospace",
    fontSize: "0.9rem", lineHeight: "1.4"
  });

  modal.appendChild(closeBtn);
  modal.appendChild(contentDiv);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

function showDebugOverlay() {
  const overlay = document.getElementById("debug-overlay");
  const contentDiv = document.getElementById("debug-content");
  if (!overlay || !contentDiv) return;
  contentDiv.textContent = debugInfo.join("\n");
  overlay.style.display = "block";
}

log.addEventListener("scroll", () => {
  userHasScrolled = (log.scrollTop + log.clientHeight + 100 < log.scrollHeight);
});
function scrollToBottom(force = false) {
  if (!userHasScrolled || force) {
    requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });
  }
}
function renderMessages(messages) {
  log.innerHTML = "";
  messages
    .sort((a, b) => a.timestamp - b.timestamp)
    .forEach((msg) => {
      const role = msg.role === "bot" ? "assistant" : msg.role;
      const div = document.createElement("div");
      div.className = `msg ${role === "user" ? "user-msg" : role === "assistant" ? "bot-msg" : "debug-msg"}`;
      div.innerHTML = msg.content;
      log.appendChild(div);
    });
  scrollToBottom();
}

createDebugOverlay();
const debugToggle = document.getElementById("debug-toggle");
if (debugToggle) debugToggle.addEventListener("click", showDebugOverlay);

onAuthStateChanged(auth, (user) => {
  if (!user) {
    signInAnonymously(auth);
    addDebugMessage("Auth: Signed in anonymously.");
    return;
  }
  uid = user.uid;
  chatRef = ref(db, `chatHistory/${uid}`);
  onValue(chatRef, (snapshot) => {
    const data = snapshot.val() || {};
    const allMessages = Object.entries(data).map(([id, msg]) => ({
      id, role: msg.role === "bot" ? "assistant" : msg.role,
      content: msg.content, timestamp: msg.timestamp || 0
    }));
    const last20 = allMessages.sort((a, b) => a.timestamp - b.timestamp).slice(-20);
    renderMessages(last20);
  });
});

// 🔧 GPT CALL WRAPPER
async function fetchGPTResponse(payload) {
  try {
    const res = await fetch("/.netlify/functions/chatgpt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.error) {
      addDebugMessage("GPT error: " + data.error.message);
      return "[GPT error: " + data.error.message + "]";
    }
    if (!data.choices || !data.choices[0]) {
      addDebugMessage("GPT returned no choices");
      return "[No reply from GPT]";
    }
    return data.choices[0].message.content;
  } catch (err) {
    addDebugMessage("GPT fetch error: " + err.message);
    return "[GPT fetch error: " + err.message + "]";
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt || !chatRef || !uid) return;
  input.value = "";

  const now = Date.now();
  await push(chatRef, { role: "user", content: prompt, timestamp: now });

  // Command short-circuit
  const staticCommands = ["/time", "/date", "/uid", "/clearchat", "/summary", "/commands"];
  if (staticCommands.includes(prompt)) return await handleStaticCommand(prompt, chatRef, uid);
  if (prompt === "/notes") return await listNotes(chatRef);
  if (prompt === "/reminders") return await listReminders(chatRef);
  if (prompt === "/events") return await listEvents(chatRef);

  // Assistant logic
  (async () => {
    const today = new Date().toISOString().slice(0, 10);

    let last20 = [];
    try {
      const snap = await get(child(ref(db), `chatHistory/${uid}`));
      const data = snap.exists() ? snap.val() : {};
      last20 = Object.entries(data)
        .map(([id, msg]) => ({
          role: msg.role === "bot" ? "assistant" : msg.role,
          content: msg.content,
          timestamp: msg.timestamp || 0
        }))
        .sort((a, b) => a.timestamp - b.timestamp)
        .slice(-20);
    } catch (err) {
      addDebugMessage("Error fetching last 20: " + err.message);
    }

    const [memory, dayLog, notes, calendar, reminders, calc] = await Promise.all([
      getMemory(uid), getDayLog(uid, today), getNotes(uid),
      getCalendar(uid), getReminders(uid), getCalcHistory(uid)
    ]);

    const sysPrompt = buildSystemPrompt({ memory, todayLog: dayLog, notes, calendar, reminders, calc, date: today });
    const full = [{ role: "system", content: sysPrompt }, ...last20];

    // memory detection
    const { memoryType, rawPrompt } = detectMemoryType(prompt);
    if (memoryType) {
      const memoryContent = await fetchGPTResponse({
        messages: [
          {
            role: "system",
            content: `You are a memory extraction engine... [shortened for brevity]`
          },
          { role: "user", content: memoryType.startsWith("/") ? rawPrompt : prompt }
        ],
        model: "gpt-4o",
        temperature: 0.3
      });
      try {
        const extracted = extractJson(memoryContent);
        if (extracted?.type && extracted?.content) {
          const path = extracted.type === "calendar" ? `calendarEvents/${uid}`
            : extracted.type === "reminder" ? `reminders/${uid}`
            : extracted.type === "log" ? `dayLog/${uid}/${today}`
            : `notes/${uid}/${today}`;
          await push(ref(db, path), {
            content: extracted.content,
            timestamp: Date.now(),
            ...(extracted.date ? { date: extracted.date } : {})
          });
        }
      } catch (err) {
        addDebugMessage("Memory write fail: " + err.message);
      }
    }

    const assistantReply = await fetchGPTResponse({
      messages: full, model: "gpt-4o", temperature: 0.8
    });

    await push(chatRef, {
      role: "assistant", content: assistantReply, timestamp: Date.now()
    });
  })();

  // Auto-summary
  (async () => {
    const snap = await get(child(ref(db), `chatHistory/${uid}`));
    const data = snap.exists() ? snap.val() : {};
    const allMessages = Object.entries(data)
      .map(([id, msg]) => ({
        role: msg.role === "bot" ? "assistant" : msg.role,
        content: msg.content, timestamp: msg.timestamp || 0
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
    const allCount = allMessages.length;

    if (allCount > 0 && allCount % 20 === 0) {
      const convoText = allMessages.slice(-20)
        .map(m => `${m.role === "assistant" ? "Assistant" : "User"}: ${m.content}`)
        .join("\n");

      const summary = await fetchGPTResponse({
        messages: [
          { role: "system", content: "Summarize the following conversation block into one paragraph:" },
          { role: "user", content: convoText }
        ],
        model: "gpt-4o", temperature: 0.5
      });

      await push(ref(db, `memory/${uid}`), {
        summary, timestamp: Date.now()
      });
    }
  })();
}); 