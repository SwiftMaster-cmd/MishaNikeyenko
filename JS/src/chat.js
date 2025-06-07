// 🔹 chat.js – dual-mode memory saving + hover-to-view debug/info overlay (full updated)

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

// Wait for DOM to be ready
document.addEventListener("DOMContentLoaded", () => {
  const form        = document.getElementById("chat-form");
  const input       = document.getElementById("user-input");
  const log         = document.getElementById("chat-log");
  const debugToggle = document.getElementById("debug-toggle");

  // In-memory debug buffer
  const debugInfo = [];
  function addDebugMessage(msg) {
    debugInfo.push(`[${new Date().toISOString()}] ${msg}`);
  }

  // Create debug overlay once
  (function createDebugOverlay() {
    if (document.getElementById("debug-overlay")) return;
    const overlay = document.createElement("div");
    overlay.id = "debug-overlay";
    Object.assign(overlay.style, {
      display: "none",
      position: "fixed",
      top: 0,
      left: 0,
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
      transform: "translate(-50%,-50%)",
      backgroundColor: "var(--clr-card)",
      color: "var(--clr-text)",
      padding: "1.5rem",
      borderRadius: "12px",
      maxWidth: "80vw",
      maxHeight: "80vh",
      overflowY: "auto",
      boxShadow: "0 2px 10px rgba(0,0,0,0.5)"
    });
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "Close";
    Object.assign(closeBtn.style, {
      position: "absolute",
      top: "8px",
      right: "8px",
      background: "var(--clr-border)",
      color: "var(--clr-text)",
      border: "none",
      padding: "4px 8px",
      cursor: "pointer",
      borderRadius: "4px"
    });
    closeBtn.addEventListener("click", () => overlay.style.display = "none");
    const content = document.createElement("pre");
    content.id = "debug-content";
    Object.assign(content.style, {
      whiteSpace: "pre-wrap",
      fontFamily: "monospace",
      fontSize: "0.85rem",
      marginTop: "2rem"
    });
    modal.append(closeBtn, content);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  })();

  // Show overlay with current debug log
  function showDebugOverlay() {
    const overlay = document.getElementById("debug-overlay");
    const content = document.getElementById("debug-content");
    if (!overlay || !content) return;
    content.textContent = debugInfo.join("\n");
    overlay.style.display = "block";
  }
  debugToggle?.addEventListener("click", showDebugOverlay);

  // Scroll behavior
  let userScrolled = false;
  log.addEventListener("scroll", () => {
    userScrolled = (log.scrollTop + log.clientHeight + 50 < log.scrollHeight);
  });
  function scrollToBottom(force = false) {
    if (!userScrolled || force) {
      requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });
    }
  }

  // Append raw HTML message div
  function appendRawMessage(role, html) {
    const div = document.createElement("div");
    div.className = role === "assistant" ? "bot-msg" : "user-msg";
    div.innerHTML = html;
    log.appendChild(div);
    scrollToBottom();
  }

  // Firebase + Netlify endpoint setup
  let uid = null;
  const fnEndpoint = `${window.location.origin}/.netlify/functions/chatgpt`;
  signInAnonymously(auth).catch(e => addDebugMessage("Auth error: " + e.message));

  onAuthStateChanged(auth, user => {
    if (!user) {
      addDebugMessage("Waiting for anonymous sign-in...");
      return;
    }
    uid = user.uid;
    addDebugMessage("Signed in as " + uid);
    const chatRef = ref(db, `chatHistory/${uid}`);

    // Render last 20 on update
    onValue(chatRef, snap => {
      const data = snap.val() || {};
      const msgs = Object.values(data)
        .map(m => ({ role: m.role === "bot" ? "assistant" : m.role, content: m.content, timestamp: m.timestamp }))
        .sort((a,b) => a.timestamp - b.timestamp)
        .slice(-20);
      log.innerHTML = "";
      msgs.forEach(m => appendRawMessage(m.role, m.content));
    });
  });

  // Handle slash commands and regular input
  form.addEventListener("submit", e => {
    e.preventDefault();
    if (!uid) return;
    const raw = input.value.trim();
    if (!raw) return input.value = "";
    input.value = "";

    // Immediate static commands
    const cmd = raw.split(" ")[0].toLowerCase();
    if (cmd.startsWith("/")) {
      switch (cmd) {
        case "/notes":
          return listNotes(uid);
        case "/reminders":
          return listReminders(uid);
        case "/events":
          return listEvents(uid);
        default:
          if (["/time","/date","/uid","/clearchat","/commands","/summary"].includes(cmd)) {
            return handleStaticCommand(raw, uid);
          }
      }
    }

    // Push user
    const chatRef = ref(db, `chatHistory/${uid}`);
    const now = Date.now();
    push(chatRef, { role: "user", content: raw, timestamp: now }).catch(e => addDebugMessage("Push user failed: "+e));

    // Background: memory extraction + assistant reply
    (async () => {
      const today = new Date().toISOString().slice(0,10);

      // Fetch context & last20
      let last20 = [];
      try {
        const snap = await get(child(ref(db), `chatHistory/${uid}`));
        const all = snap.exists() ? snap.val() : {};
        last20 = Object.values(all)
          .map(m => ({ role: m.role === "bot" ? "assistant" : m.role, content: m.content, timestamp: m.timestamp }))
          .sort((a,b) => a.timestamp - b.timestamp)
          .slice(-20);
      } catch (e) { addDebugMessage("Fetch last20 failed: "+e.message); }

      // Fetch memory stores
      const [memory, dayLog, notes, calendar, reminders, calc] = await Promise.all([
        getMemory(uid),
        getDayLog(uid, today),
        getNotes(uid),
        getCalendar(uid),
        getReminders(uid),
        getCalcHistory(uid)
      ]).catch(e => { addDebugMessage("Fetch context failed: "+e.message); return []; });

      // Build system prompt + messages
      const sys = buildSystemPrompt({ memory, todayLog: dayLog, notes, calendar, reminders, calc, date: today });
      const convo = [{ role: "system", content: sys }, ...last20];

      // Memory extraction
      const { memoryType, rawPrompt } = detectMemoryType(raw);
      if (memoryType) {
        try {
          const resp = await fetch(fnEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "gpt-4o",
              temperature: 0.3,
              messages: [
                { role: "system", content: `
You are a memory extraction engine. Return exactly one JSON:
{"type":"note"|"reminder"|"calendar"|"log","content":"...","date":"YYYY-MM-DD"?}
Rules:
- "/note" → note
- "/reminder" or "remind me" → reminder
- mentions date/time → calendar
- "/log" or "journal" → log
- default → note
` },
                { role: "user", content: memoryType.startsWith("/") ? rawPrompt : raw }
              ]
            })
          });
          const txt = await resp.text();
          const obj = JSON.parse(txt);
          const path = obj.type === "calendar"
            ? `calendarEvents/${uid}`
            : obj.type === "reminder"
            ? `reminders/${uid}`
            : obj.type === "log"
            ? `dayLog/${uid}/${today}`
            : `notes/${uid}/${today}`;
          await push(ref(db, path), {
            content: obj.content,
            timestamp: Date.now(),
            ...(obj.date ? { date: obj.date } : {})
          });
          addDebugMessage(`Saved ${obj.type}: ${obj.content}`);
        } catch (e) {
          addDebugMessage("Memory write failed: "+e.message);
        }
      }

      // Assistant reply
      let assistantReply = "";
      try {
        const r = await fetch(fnEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: "gpt-4o", temperature: 0.8, messages: convo })
        });
        const json = await r.json();
        assistantReply = json.choices?.[0]?.message?.content || "[No reply]";
      } catch (e) {
        addDebugMessage("GPT error: "+e.message);
        assistantReply = "⚠️ AI unavailable right now.";
      }
      await push(chatRef, { role: "assistant", content: assistantReply, timestamp: Date.now() });
    })();

    // Summary every 20 messages
    (async () => {
      try {
        const snap = await get(child(ref(db), `chatHistory/${uid}`));
        const all = snap.exists() ? snap.val() : {};
        const count = Object.keys(all).length;
        if (count > 0 && count % 20 === 0) {
          const last20 = Object.values(all)
            .map(m => ({ role: m.role === "bot" ? "assistant" : m.role, content: m.content, timestamp: m.timestamp }))
            .sort((a,b) => a.timestamp - b.timestamp)
            .slice(-20);
          const text = last20.map(m => `${m.role}: ${m.content}`).join("\n");
          const sumR = await fetch(fnEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "gpt-4o",
              temperature: 0.5,
              messages: [
                { role: "system", content: "Summarize this conversation into one paragraph:" },
                { role: "user", content: text }
              ]
            })
          });
          const sumJ = await sumR.json();
          const summary = sumJ.choices?.[0]?.message?.content || "[No summary]";
          await push(ref(db, `memory/${uid}`), { summary, timestamp: Date.now() });
          addDebugMessage("Saved 20-msg summary.");
        }
      } catch (e) {
        addDebugMessage("Summary error: "+e.message);
      }
    })();
  });
});