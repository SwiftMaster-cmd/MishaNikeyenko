import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, push, onValue
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  getMemory, getDayLog, getNotes, getCalendar, getReminders,
  getCalcHistory, updateDayLog, buildSystemPrompt
} from "../JS/memoryManager.js"; // ✅ Ensure correct relative path

console.log("✅ chat.js loaded and memoryManager.js imported");

// Firebase config
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

const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const log = document.getElementById("chat-log");

let uid = null;
let chatRef = null;
let userHasScrolled = false;

function addDebugMessage(text) {
  const div = document.createElement("div");
  div.className = "msg debug-msg";
  div.textContent = "[DEBUG] " + text;
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
      const div = document.createElement("div");
      div.className = "msg " + (msg.role === "user" ? "user-msg" : "bot-msg");
      div.textContent = msg.content;
      log.appendChild(div);
    });
  scrollToBottom();
}

onAuthStateChanged(auth, (user) => {
  if (!user) {
    signInAnonymously(auth);
    addDebugMessage("Signed in anonymously.");
    return;
  }

  uid = user.uid;
  chatRef = ref(db, "chatHistory/" + uid);
  onValue(chatRef, (snapshot) => {
    const data = snapshot.val() || {};
    const messages = Object.entries(data).map(([id, msg]) => ({
      id,
      ...msg,
      role: msg.role === "bot" ? "assistant" : msg.role
    }));
    renderMessages(messages);
  });
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt || !chatRef || !uid) return;

  await push(chatRef, {
    role: "user",
    content: prompt,
    timestamp: Date.now()
  });

  input.value = "";

  const snapshot = await new Promise(resolve => onValue(chatRef, resolve, { onlyOnce: true }));
  const data = snapshot.val() || {};
  const allMessages = Object.entries(data)
    .sort((a, b) => a[1].timestamp - b[1].timestamp)
    .map(([_, msg]) => ({
      role: msg.role === "bot" ? "assistant" : msg.role,
      content: msg.content
    }));

  const today = new Date().toISOString().slice(0, 10);

  console.log("🧠 Fetching memory-related context...");
  const [memory, dayLog, notes, calendar, reminders, calc] = await Promise.all([
    getMemory(uid),
    getDayLog(uid, today),
    getNotes(uid),
    getCalendar(uid),
    getReminders(uid),
    getCalcHistory(uid)
  ]);

  const systemPrompt = buildSystemPrompt({
    memory,
    todayLog: dayLog,
    notes,
    calendar,
    reminders,
    calc,
    date: today
  });

  console.log("🧠 System prompt generated:
" + systemPrompt);

  const fullMessages = [
    { role: "system", content: systemPrompt },
    ...allMessages
  ];

  const res = await fetch("/.netlify/functions/chatgpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: fullMessages, model: "gpt-4o", temperature: 0.4 })
  });

  const replyData = await res.json();
  const reply = replyData?.choices?.[0]?.message?.content || "[No reply]";
  await push(chatRef, {
    role: "assistant",
    content: reply,
    timestamp: Date.now()
  });
});