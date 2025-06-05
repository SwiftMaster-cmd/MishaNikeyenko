// 🔹 chat.js – full memory command support with visual debugging
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

// Auth and Chat History
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
    const messages = Object.entries(data).map(([id, msg]) => ({
      id, ...msg,
      role: msg.role === "bot" ? "assistant" : msg.role
    }));
    renderMessages(messages);
  });
});

// Extract JSON from GPT
function extractJson(raw) {
  if (!raw) return null;
  const clean = raw.replace(/```json\s*([\s\S]*?)```/gi, '$1').replace(/```([\s\S]*?)```/gi, '$1').trim();
  try {
    return JSON.parse(clean);
  } catch {
    return null;
  }
}

// Submit
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt || !chatRef || !uid) return;

  await push(chatRef, { role: "user", content: prompt, timestamp: Date.now() });
  input.value = "";

  // Get chat history
  const snapshot = await new Promise(resolve => onValue(chatRef, resolve, { onlyOnce: true }));
  const messages = Object.entries(snapshot.val() || {}).map(([id, msg]) => ({
    role: msg.role === "bot" ? "assistant" : msg.role, content: msg.content
  }));

  // Add context
  const today = new Date().toISOString().slice(0, 10);
  const [memory, dayLog, notes, calendar, calc] = await Promise.all([
    getMemory(uid),
    getDayLog(uid, today),
    getNotes(uid),
    getCalendar(uid),
    getCalcHistory(uid)
  ]);
  const sysPrompt = buildSystemPrompt({
    memory, todayLog: dayLog, notes, calendar, calc, date: today
  });

  const full = [{ role: "system", content: sysPrompt }, ...messages];

  // Ask GPT to parse memory action
  const res = await fetch("/.netlify/functions/chatgpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [
        { role: "system", content: "Classify and extract memory: type (note/calendar/reminder/log), content, date(optional)." },
        { role: "user", content: prompt }
      ],
      model: "gpt-4o", temperature: 0.3
    })
  });

  const raw = await res.text();
  const parsed = JSON.parse(raw);
  const extracted = parsed?.choices?.[0]?.message?.content;
  const data = extractJson(extracted);

  if (!data || !data.type || !data.content) {
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

  // Response
  const replyRes = await fetch("/.netlify/functions/chatgpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: full, model: "gpt-4o", temperature: 0.4 })
  });
  const replyData = await replyRes.json();
  const reply = replyData?.choices?.[0]?.message?.content || "[No reply]";
  await push(chatRef, { role: "assistant", content: reply, timestamp: Date.now() });
});
