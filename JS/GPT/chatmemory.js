// 🔹 chat.js – dual‐mode memory saving (commands + natural input + list commands)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase,
  ref,
  push,
  set,
  onValue,
  get,
  child
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  getMemory,
  getDayLog,
  getNotes,
  getCalendar,
  getReminders,
  getCalcHistory,
  updateDayLog,
  buildSystemPrompt
} from "./memoryManager.js";

// Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyCf_se10RUg8i_u8pdowHlQvrFViJ4jh_Q",
  authDomain: "mishanikeyenko.firebaseapp.com",
  databaseURL: "https://mishanikeyenko-default-rtdb.firebaseio.com",
  projectId: "mishanikeyenko",
  storageBucket: "mishanikeyenko.firebasestorage.app",
  messagingSenderId: "1089190937368",
  appId: "1:1089190937368:web:959c825fc596a5e3ae946d"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// DOM
const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const log = document.getElementById("chat-log");

let uid = null;
let chatRef = null;
let userHasScrolled = false;

function addDebugMessage(text) {
  const div = document.createElement("div");
  div.className = "msg debug-msg";
  div.textContent = `[DEBUG] ${text}`;
  log.appendChild(div);
  scrollToBottom(true);
}

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

function renderMessages(messages) {
  log.innerHTML = "";
  messages
    .sort((a, b) => a.timestamp - b.timestamp)
    .forEach((msg) => {
      const role = msg.role === "bot" ? "assistant" : msg.role;
      const div = document.createElement("div");
      div.className = `msg ${role === "user" ? "user-msg" : role === "assistant" ? "bot-msg" : "debug-msg"}`;
      div.textContent = msg.content;
      log.appendChild(div);
    });
  scrollToBottom();
}

// Auth
onAuthStateChanged(auth, (user) => {
  if (!user) {
    signInAnonymously(auth);
    addDebugMessage("Signed in anonymously.");
    return;
  }

  uid = user.uid;
  chatRef = ref(db, `chatHistory/${uid}`);

  onValue(chatRef, (snapshot) => {
    const data = snapshot.val() || {};
    const allMessages = Object.entries(data).map(([id, msg]) => ({
      id,
      role: msg.role === "bot" ? "assistant" : msg.role,
      content: msg.content,
      timestamp: msg.timestamp || 0
    }));
    const messages = allMessages.sort((a, b) => a.timestamp - b.timestamp).slice(-20);
    renderMessages(messages);
  });
});

function extractJson(raw) {
  if (!raw) return null;
  const clean = raw
    .replace(/```json\s*([\s\S]*?)```/gi, "$1")
    .replace(/```([\s\S]*?)```/gi, "$1")
    .trim();
  try {
    return JSON.parse(clean);
  } catch {
    return null;
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt || !chatRef || !uid) return;

  const today = new Date().toISOString().slice(0, 10);
  input.value = "";

  // ── Static Utility Commands ──

  if (prompt === "/time") {
    const time = new Date().toLocaleTimeString();
    await push(chatRef, { role: "assistant", content: `🕒 Current time is ${time}`, timestamp: Date.now() });
    return;
  }

  if (prompt === "/date") {
    await push(chatRef, { role: "assistant", content: `📅 Today's date is ${today}`, timestamp: Date.now() });
    return;
  }

  if (prompt === "/uid") {
    await push(chatRef, { role: "assistant", content: `🆔 Your UID is: ${uid}`, timestamp: Date.now() });
    return;
  }

  if (prompt === "/clearchat") {
    await set(chatRef, {});
    log.innerHTML = "";
    await push(chatRef, { role: "assistant", content: "🧼 Chat history cleared.", timestamp: Date.now() });
    return;
  }

  if (prompt === "/summary") {
    const [dayLog, notes] = await Promise.all([getDayLog(uid, today), getNotes(uid)]);
    const noteList = Object.values(notes?.[today] || {})
      .map(n => `- ${n.content}`)
      .join("\n") || "No notes.";

    const logSummary = Object.entries(dayLog || {})
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
      .join("\n") || "No log.";

    await push(chatRef, {
      role: "assistant",
      content: `📝 **Today’s Summary**:\n\n📓 Log:\n${logSummary}\n\n🗒️ Notes:\n${noteList}`,
      timestamp: Date.now()
    });
    return;
  }

  if (prompt === "/commands") {
    const commandList = [
      { cmd: "/note",     desc: "Save a note (e.g. /note call Mom later)" },
      { cmd: "/reminder", desc: "Set a reminder (e.g. /reminder pay bill tomorrow)" },
      { cmd: "/calendar", desc: "Create a calendar event (e.g. /calendar dinner Friday)" },
      { cmd: "/log",      desc: "Add to your day log (e.g. /log felt great after run)" },
      { cmd: "/notes",    desc: "List all notes saved today" },
      { cmd: "/reminders",desc: "List all reminders" },
      { cmd: "/events",   desc: "List all calendar events" },
      { cmd: "/summary",  desc: "Summarize today’s log and notes" },
      { cmd: "/clearchat",desc: "Clear the visible chat history" },
      { cmd: "/time",     desc: "Show current time" },
      { cmd: "/date",     desc: "Show today’s date" },
      { cmd: "/uid",      desc: "Show your Firebase user ID" }
    ];
    const response = commandList.map(c => `🔹 **${c.cmd}** – ${c.desc}`).join("\n");
    await push(chatRef, {
      role: "assistant",
      content: `🧭 **Available Commands**:\n\n${response}`,
      timestamp: Date.now()
    });
    return;
  }

  // ── List Notes ──
  if (prompt === "/notes") {
    try {
      const allNotesSnap = await get(child(ref(db), `notes/${uid}`));
      const notesForToday = allNotesSnap.exists() ? allNotesSnap.val()[today] || {} : {};
      const keys = Object.keys(notesForToday);

      if (!keys.length) {
        await push(chatRef, { role: "assistant", content: "🗒️ You have no notes for today." });
        return;
      }

      const lines = keys.map(key => {
        const { content, timestamp } = notesForToday[key];
        const time = new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        return `• [${time}] ${content}`;
      });

      const response = "🗒️ **Today's Notes:**\n" + lines.join("\n");
      await push(chatRef, { role: "assistant", content: response });
    } catch (err) {
      addDebugMessage("❌ Error fetching notes: " + err.message);
    }
    return;
  }

  // ── List Reminders ──
  if (prompt === "/reminders") {
    try {
      const allRemSnap = await get(child(ref(db), `reminders/${uid}`));
      const remData = allRemSnap.exists() ? allRemSnap.val() : {};
      const keys = Object.keys(remData);

      if (!keys.length) {
        await push(chatRef, { role: "assistant", content: "⏰ You have no reminders set." });
        return;
      }

      const lines = keys.map(key => {
        const { content, timestamp, date } = remData[key];
        const time = date ? date : new Date(timestamp).toLocaleDateString();
        return `• [${time}] ${content}`;
      });

      const response = "⏰ **Your Reminders:**\n" + lines.join("\n");
      await push(chatRef, { role: "assistant", content: response });
    } catch (err) {
      addDebugMessage("❌ Error fetching reminders: " + err.message);
    }
    return;
  }

  // ── List Calendar Events ──
  if (prompt === "/events") {
    try {
      const allCalSnap = await get(child(ref(db), `calendarEvents/${uid}`));
      const evData = allCalSnap.exists() ? allCalSnap.val() : {};
      const keys = Object.keys(evData);

      if (!keys.length) {
        await push(chatRef, { role: "assistant", content: "📆 You have no calendar events." });
        return;
      }

      const lines = keys.map(key => {
        const { content, timestamp, date } = evData[key];
        const time = date ? date : new Date(timestamp).toLocaleDateString();
        return `• [${time}] ${content}`;
      });

      const response = "📆 **Your Events:**\n" + lines.join("\n");
      await push(chatRef, { role: "assistant", content: response });
    } catch (err) {
      addDebugMessage("❌ Error fetching calendar events: " + err.message);
    }
    return;
  }

  // ── Default chat + memory logic ──

  // 1) Push user message
  await push(chatRef, { role: "user", content: prompt, timestamp: Date.now() });

  // 2) Fetch last 20 messages with get()
  let messages = [];
  try {
    const snap = await get(child(ref(db), `chatHistory/${uid}`));
    const data = snap.exists() ? snap.val() : {};
    const allMessages = Object.entries(data).map(([id, msg]) => ({
      role: msg.role === "bot" ? "assistant" : msg.role,
      content: msg.content,
      timestamp: msg.timestamp || 0
    }));
    messages = allMessages.sort((a, b) => a.timestamp - b.timestamp).slice(-20);
  } catch (err) {
    addDebugMessage("❌ Error fetching chat history: " + err.message);
  }

  // 3) Fetch memory/context
  const [memory, dayLog, notes, calendar, reminders, calc] = await Promise.all([
    getMemory(uid),
    getDayLog(uid, today),
    getNotes(uid),
    getCalendar(uid),
    getReminders(uid),
    getCalcHistory(uid)
  ]);

  // 4) Build system prompt & full history
  const sysPrompt = buildSystemPrompt({
    memory,
    todayLog: dayLog,
    notes,
    calendar,
    reminders,
    calc,
    date: today
  });
  const full = [{ role: "system", content: sysPrompt }, ...messages];

  // 5) Memory‐type detection
  const lower = prompt.toLowerCase();
  const isNote     = lower.startsWith("/note ");
  const isReminder = lower.startsWith("/reminder ");
  const isCalendar = lower.startsWith("/calendar ");
  const isLog      = lower.startsWith("/log ");
  const hasSlash   = isNote || isReminder || isCalendar || isLog;
  const rawPrompt  = prompt.replace(/^\/(note|reminder|calendar|log)\s*/i, "").trim();

  let inferredType = null;
  if (!hasSlash) {
    if (/\b(remind me|reminder|remember)\b/i.test(prompt)) {
      inferredType = "reminder";
    } else if (/\b(on\s+\w+|tomorrow|today|at\s+\d{1,2}(:\d{2})?|am|pm|Monday|Tuesday|Friday|Saturday|Sunday)\b/i.test(prompt)) {
      inferredType = "calendar";
    } else if (/\b(log|journal)\b/i.test(prompt)) {
      inferredType = "log";
    }
  }

  const memoryType = hasSlash
    ? (isNote     ? "note"
     : isReminder ? "reminder"
     : isCalendar ? "calendar"
     : isLog      ? "log"
     : null)
    : inferredType;

  if (memoryType) {
    const memoryPrompt = hasSlash
      ? `Type: ${memoryType}\nContent: ${rawPrompt}`
      : prompt;

    let extractedData = null;
    try {
      const res = await fetch("/.netlify/functions/chatgpt", {
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
3. If it mentions a specific date/time (e.g. "tomorrow", "Friday at 3pm", "on 2025-06-10"), type="calendar".
4. If it begins with "/log" or includes "journaled", "logged", type="log".
5. Otherwise, type="note" only as last resort.
6. Populate "date" only when user explicitly gives it.
7. Do NOT append any closing lines like "If you need more information or assistance...".
8. Return ONLY the JSON block.`
            },
            { role: "user", content: memoryPrompt }
          ],
          model: "gpt-4o",
          temperature: 0.3
        })
      });
      const raw = await res.text();
      const parsed = JSON.parse(raw);
      const extracted = parsed.choices?.[0]?.message?.content || "";
      extractedData = extractJson(extracted);
    } catch (err) {
      console.warn("[PARSE FAIL]", err);
      addDebugMessage("❌ JSON parse error (memory).");
    }

    if (extractedData?.type && extractedData?.content) {
      try {
        const path =
          extractedData.type === "calendar"
            ? `calendarEvents/${uid}`
            : extractedData.type === "reminder"
            ? `reminders/${uid}`
            : extractedData.type === "log"
            ? `dayLog/${uid}/${today}`
            : `notes/${uid}/${today}`;

        const refNode = ref(db, path);
        const entry = {
          content: extractedData.content,
          timestamp: Date.now(),
          ...(extractedData.date ? { date: extractedData.date } : {})
        };
        await push(refNode, entry);
        addDebugMessage(`✅ Memory added to /${extractedData.type}`);
      } catch (err) {
        addDebugMessage("❌ Firebase write failed: " + err.message);
      }
    } else {
      addDebugMessage("⚠️ GPT returned incomplete memory structure.");
    }
  } else {
    addDebugMessage("🔕 No valid memory trigger.");
  }

  // 6) Assistant reply
  let reply = "[No reply]";
  try {
    const replyRes = await fetch("/.netlify/functions/chatgpt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: full, model: "gpt-4o", temperature: 0.8 })
    });
    const replyData = await replyRes.json();
    reply = replyData.choices?.[0]?.message?.content || reply;
  } catch (err) {
    addDebugMessage("❌ Error getting GPT reply: " + err.message);
  }

  await push(chatRef, { role: "assistant", content: reply, timestamp: Date.now() });
});