import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase,
  ref,
  push,
  onValue,
  get
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
  getCalcHistory,
  getReminders,
  buildSystemPrompt,
  updateDayLog
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

// RENDER
function renderMessages(messages) {
  log.innerHTML = "";
  messages
    .sort((a, b) => a.timestamp - b.timestamp)
    .forEach((msg) => {
      const div = document.createElement("div");
      div.className = `msg ${msg.role}`;
      div.textContent = msg.content;
      log.appendChild(div);
    });
  log.scrollTop = log.scrollHeight;
}

// AUTH
onAuthStateChanged(auth, (user) => {
  if (!user) return signInAnonymously(auth);
  uid = user.uid;
  chatRef = ref(db, `chatHistory/${uid}`);
  onValue(chatRef, (snapshot) => {
    const data = snapshot.val() || {};
    const messages = Object.entries(data).map(([_, msg]) => msg);
    renderMessages(messages);
  });
});

// SUBMIT
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt || !uid) return;

  input.value = "";
  const userMsg = { role: "user", content: prompt, timestamp: Date.now() };
  await push(chatRef, userMsg);

  const today = new Date().toISOString().slice(0, 10);

  // 🔄 SAFE: memory, notes, logs, reminders
  let memory = {}, dayLog = {}, notes = {}, reminders = {};
  const results = await Promise.allSettled([
    getMemory(uid),
    getDayLog(uid, today),
    getNotes(uid, true),
    getReminders(uid)
  ]);
  if (results[0].status === "fulfilled") memory = results[0].value;
  if (results[1].status === "fulfilled") dayLog = results[1].value;
  if (results[2].status === "fulfilled") notes = results[2].value;
  if (results[3].status === "fulfilled") reminders = results[3].value;

  const systemPrompt = buildSystemPrompt({
    memory,
    todayLog: dayLog,
    notes,
    reminders,
    date: today
  });

  const allMessages = [
    { role: "system", content: systemPrompt },
    ...Object.values((await get(chatRef)).val() || {}).map(m => ({
      role: m.role === "bot" ? "assistant" : m.role,
      content: m.content
    }))
  ];

  const res = await fetch("/.netlify/functions/gpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: allMessages, uid })
  });

  const data = await res.json();
  const reply = data?.choices?.[0]?.message?.content?.trim() || "No reply.";

  await push(chatRef, {
    role: "assistant",
    content: reply,
    timestamp: Date.now()
  });

  // 🧠 Handle structured commands from GPT
  try {
    const match = reply.match(/{[\s\S]*?"action":\s*".+?"[\s\S]*?}/);
    if (match) {
      const command = JSON.parse(match[0]);
      const commandRes = await fetch("/.netlify/functions/gpt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid,
          action: command.action,
          data: command.data
        })
      });

      const result = await commandRes.json();
      const success = result.ok === true;

      await push(chatRef, {
        role: "debug",
        content: success
          ? `✅ ${command.action} saved.`
          : `❌ Failed to ${command.action}: ${result.error || "Unknown error"}`,
        timestamp: Date.now()
      });
    }
  } catch (err) {
    console.warn("🛑 Structured command failed:", err.message);
    await push(chatRef, {
      role: "debug",
      content: "🛑 Could not process structured update.",
      timestamp: Date.now()
    });
  }

  // 🔁 Expand on request
  if (/get calendar|get finances|get reminders|more notes|expand memory/i.test(reply)) {
    const expansions = [];

    if (/calendar/i.test(reply)) {
      const cal = await getCalendar(uid);
      expansions.push("📅 Calendar:\n" + JSON.stringify(cal, null, 2));
    }

    if (/finances/i.test(reply)) {
      const calc = await getCalcHistory(uid);
      expansions.push("💰 Finances:\n" + JSON.stringify(calc, null, 2));
    }

    if (/reminders/i.test(reply)) {
      const r = await getReminders(uid);
      expansions.push("🔔 Reminders:\n" + JSON.stringify(r, null, 2));
    }

    if (/more notes|full notes/i.test(reply)) {
      const fullNotes = await getNotes(uid, false);
      expansions.push("🗒️ Notes:\n" + JSON.stringify(fullNotes, null, 2));
    }

    for (const e of expansions) {
      await push(chatRef, {
        role: "assistant",
        content: e,
        timestamp: Date.now()
      });
    }
  }
});