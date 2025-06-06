// 🔹 chat.js – enhanced command-based chat with GPT classification
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, push, set, onValue
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged
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

    const messages = allMessages
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-20);

    renderMessages(messages);
  });
});

function extractJson(raw) {
  if (!raw) return null;
  const clean = raw.replace(/```json\s*([\s\S]*?)```/gi, '$1').replace(/```([\s\S]*?)```/gi, '$1').trim();
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

  // 🔹 Functional Commands (No GPT Required)
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
    const [dayLog, notes] = await Promise.all([
      getDayLog(uid, today),
      getNotes(uid)
    ]);
    const noteList = Object.values(notes?.[today] || {}).map(n => `- ${n.content}`).join("\n") || "No notes.";
    const logSummary = Object.entries(dayLog || {}).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`).join("\n") || "No log.";
    await push(chatRef, {
      role: "assistant",
      content: `📝 **Today’s Summary**:\n\n📓 Log:\n${logSummary}\n\n🗒️ Notes:\n${noteList}`,
      timestamp: Date.now()
    });
    return;
  }

  if (prompt === "/commands") {
    const commandList = [
      { cmd: "/note", desc: "Save a note (e.g. /note call Mom later)" },
      { cmd: "/reminder", desc: "Set a reminder (e.g. /reminder pay bill tomorrow)" },
      { cmd: "/calendar", desc: "Create a calendar event (e.g. /calendar dinner Friday)" },
      { cmd: "/log", desc: "Add to your day log (e.g. /log felt great after run)" },
      { cmd: "/summary", desc: "Summarize today’s log and notes" },
      { cmd: "/clearchat", desc: "Clear the visible chat history" },
      { cmd: "/time", desc: "Show current time" },
      { cmd: "/date", desc: "Show today’s date" },
      { cmd: "/uid", desc: "Show your Firebase user ID" }
    ];
    const response = commandList.map(c => `🔹 **${c.cmd}** – ${c.desc}`).join("\n");
    await push(chatRef, {
      role: "assistant",
      content: `🧭 **Available Commands**:\n\n${response}`,
      timestamp: Date.now()
    });
    return;
  }

  // Default: Chat + Memory Trigger
  await push(chatRef, { role: "user", content: prompt, timestamp: Date.now() });

  const snapshot = await new Promise(resolve => onValue(chatRef, resolve, { onlyOnce: true }));
  const allMessages = Object.entries(snapshot.val() || {}).map(([id, msg]) => ({
    role: msg.role === "bot" ? "assistant" : msg.role,
    content: msg.content,
    timestamp: msg.timestamp || 0
  }));
  const messages = allMessages.sort((a, b) => a.timestamp - b.timestamp).slice(-20);

  const [memory, dayLog, notes, calendar, reminders, calc] = await Promise.all([
    getMemory(uid),
    getDayLog(uid, today),
    getNotes(uid),
    getCalendar(uid),
    getReminders(uid),
    getCalcHistory(uid)
  ]);

  const sysPrompt = buildSystemPrompt({
    memory, todayLog: dayLog, notes, calendar, reminders, calc, date: today
  });
  const full = [{ role: "system", content: sysPrompt }, ...messages];

  const lower = prompt.toLowerCase();
  const isNote = lower.startsWith("/note ");
  const isReminder = lower.startsWith("/reminder ");
  const isCalendar = lower.startsWith("/calendar ");
  const isLog = lower.startsWith("/log ");

  const shouldSaveMemory = isNote || isReminder || isCalendar || isLog;
  const rawPrompt = shouldSaveMemory
    ? prompt.replace(/^\/(note|reminder|calendar|log)\s*/i, "").trim()
    : prompt;

  if (shouldSaveMemory) {
    const res = await fetch("/.netlify/functions/chatgpt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content: `You are a memory parser. Extract structured memory from the user input in this exact JSON format:
\`\`\`json
{
  "type": "note",
  "content": "string",
  "date": "optional YYYY-MM-DD"
}
\`\`\`
Only return the JSON block. Supported types: note, calendar, reminder, log.`
          },
          { role: "user", content: rawPrompt }
        ],
        model: "gpt-4o", temperature: 0.3
      })
    });

    const raw = await res.text();
    let parsed, extracted, data;

    try {
      parsed = JSON.parse(raw);
      extracted = parsed?.choices?.[0]?.message?.content;
      data = extractJson(extracted);
    } catch (err) {
      console.warn("[PARSE FAIL]", raw);
      addDebugMessage("❌ JSON parse error.");
    }

    if (!data || !data.type || !data.content) {
      console.warn("[MEMORY FAIL]", extracted);
      addDebugMessage("⚠️ GPT returned invalid or incomplete memory structure.");
    } else {
      try {
        const path = data.type === "calendar" ? `calendarEvents/${uid}` :
                    data.type === "reminder" ? `reminders/${uid}` :
                    data.type === "log" ? `dayLog/${uid}/${today}` :
                    `notes/${uid}/${today}`;
        const refNode = ref(db, path);
        const entry = {
          content: data.content,
          timestamp: Date.now(),
          ...(data.date ? { date: data.date } : {})
        };
        await push(refNode, entry);
        addDebugMessage(`✅ Memory added to /${data.type}`);
      } catch (err) {
        addDebugMessage("❌ Firebase write failed: " + err.message);
      }
    }
  } else {
    addDebugMessage("🔕 Memory not saved (no command trigger).");
  }

  // GPT Reply
  const replyRes = await fetch("/.netlify/functions/chatgpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: full, model: "gpt-4o", temperature: 0.8 })
  });

  const replyData = await replyRes.json();
  const reply = replyData?.choices?.[0]?.message?.content || "[No reply]";
  await push(chatRef, { role: "assistant", content: reply, timestamp: Date.now() });
});