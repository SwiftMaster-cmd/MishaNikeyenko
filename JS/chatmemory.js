// 🔹 chat.js – Command-based memory triggers with GPT classification

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
  addNote,
  addReminder,
  addCalendarEvent,
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

function scrollToBottom() {
  requestAnimationFrame(() => {
    log.scrollTop = log.scrollHeight;
  });
}

function renderMessages(messages) {
  log.innerHTML = "";
  messages.forEach(msg => {
    const div = document.createElement("div");
    div.className = `msg ${msg.role === "user" ? "user-msg" : "bot-msg"}`;
    div.textContent = msg.content;
    log.appendChild(div);
  });
  scrollToBottom();
}

// Auth
onAuthStateChanged(auth, (user) => {
  if (!user) {
    signInAnonymously(auth);
    return;
  }

  uid = user.uid;
  chatRef = ref(db, `chatHistory/${uid}`);
  onValue(chatRef, (snapshot) => {
    const data = snapshot.val() || {};
    const messages = Object.entries(data).map(([_, msg]) => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp
    })).sort((a, b) => a.timestamp - b.timestamp).slice(-20);
    renderMessages(messages);
  });
});

// JSON Cleaner
function extractJson(raw) {
  const clean = raw.replace(/```json\s*([\s\S]*?)```/gi, '$1').replace(/```([\s\S]*?)```/gi, '$1').trim();
  try { return JSON.parse(clean); } catch { return null; }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt || !uid || !chatRef) return;

  await push(chatRef, { role: "user", content: prompt, timestamp: Date.now() });
  input.value = "";

  const today = new Date().toISOString().slice(0, 10);
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

  const messages = [
    { role: "system", content: sysPrompt },
    { role: "user", content: prompt }
  ];

  const isTrigger = /^\/(note|calendar|reminder|log)\s+/i;
  const match = prompt.match(isTrigger);
  const type = match?.[1]?.toLowerCase();
  const rawContent = prompt.replace(isTrigger, "").trim();

  if (type && rawContent) {
    const parseRes = await fetch("/.netlify/functions/chatgpt", {
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
          { role: "user", content: rawContent }
        ],
        model: "gpt-4o",
        temperature: 0.2
      })
    });

    const raw = await parseRes.text();
    const parsed = extractJson(raw);

    if (parsed?.type && parsed?.content) {
      const date = parsed.date || null;
      try {
        if (parsed.type === "note") {
          await addNote(uid, parsed.content, date);
        } else if (parsed.type === "reminder") {
          await addReminder(uid, parsed.content, date);
        } else if (parsed.type === "calendar") {
          await addCalendarEvent(uid, parsed.content, date);
        } else if (parsed.type === "log") {
          await updateDayLog(uid, date || today, { notes: [parsed.content] });
        }
      } catch (err) {
        console.warn("❌ Memory write failed", err.message);
      }
    }
  }

  const replyRes = await fetch("/.netlify/functions/chatgpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages,
      model: "gpt-4o",
      temperature: 0.8
    })
  });

  const replyData = await replyRes.json();
  const reply = replyData?.choices?.[0]?.message?.content || "[No reply]";
  await push(chatRef, { role: "assistant", content: reply, timestamp: Date.now() });
});