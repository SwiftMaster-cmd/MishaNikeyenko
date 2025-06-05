import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase,
  ref,
  push,
  onValue
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
  updateDayLog,
  buildSystemPrompt
} from "./memoryManager.js";

// 🔹 Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyCf_se10RUg8i_u8pdowHlQvrFViJ4jh_Q",
  authDomain: "mishanikeyenko.firebaseapp.com",
  databaseURL: "https://mishanikeyenko-default-rtdb.firebaseio.com",
  projectId: "mishanikeyenko",
  storageBucket: "mishanikeyenko.firebasestorage.app",
  messagingSenderId: "1089190937368",
  appId: "1:1089190937368:web:959c825fc596a5e3ae946d"
};

// 🔹 Init
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// 🔹 DOM
const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const log = document.getElementById("chat-log");

let uid = null;
let chatRef = null;
let userHasScrolled = false;

// 🔹 Scroll tracking
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
      div.className = `msg ${msg.role === "user" ? "user-msg" : "bot-msg"}`;
      div.textContent = msg.content;
      log.appendChild(div);
    });

  const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 100;
  userHasScrolled = !nearBottom;
  scrollToBottom();
}

// 🔹 Auth listener
onAuthStateChanged(auth, (user) => {
  if (!user) {
    signInAnonymously(auth);
    return;
  }

  uid = user.uid;
  chatRef = ref(db, `chatHistory/${uid}`);

  onValue(chatRef, (snapshot) => {
    const data = snapshot.val() || {};
    const messages = Object.entries(data).map(([id, msg]) => ({ id, ...msg }));
    renderMessages(messages);
  });
});

// 🔹 On form submit
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const prompt = input.value.trim();
  if (!prompt || !chatRef || !uid) return;

  const userMsg = {
    role: "user",
    content: prompt,
    timestamp: Date.now()
  };

  push(chatRef, userMsg);
  input.value = "";
  input.focus();
  scrollToBottom(true);

  const today = new Date().toISOString().slice(0, 10);

  const [memory, dayLog, notes, calendar, calc] = await Promise.all([
    getMemory(uid),
    getDayLog(uid, today),
    getNotes(uid),
    getCalendar(uid),
    getCalcHistory(uid)
  ]);

  const systemPrompt = buildSystemPrompt({
    memory,
    todayLog: dayLog,
    notes,
    calendar,
    calc,
    date: today
  });

  const res = await fetch("/.netlify/functions/chatgpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ],
      model: "gpt-4o",
      temperature: 0.4
    })
  });

  const data = await res.json();
  const reply = data?.choices?.[0]?.message?.content?.trim() || "No reply.";

  push(chatRef, {
    role: "assistant",
    content: reply,
    timestamp: Date.now()
  });

  // 🔹 Auto-log trigger
  if (/\/log|remember this|today|add to log/i.test(prompt)) {
    try {
      const logRes = await fetch("/.netlify/functions/chatgpt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content: "Extract a structured log. Return JSON with: highlights, mood, notes, questions."
            },
            { role: "user", content: prompt }
          ],
          model: "gpt-4o",
          temperature: 0.3
        })
      });

      const raw = await logRes.text();
      const parsed = JSON.parse(raw);
      const extracted = parsed?.choices?.[0]?.message?.content?.trim();
      const logData = JSON.parse(extracted);

      await updateDayLog(uid, today, logData);
    } catch (err) {
      console.warn("🛑 Log failed:", err.message);
    }
  }
});

document.addEventListener("DOMContentLoaded", () => {
  scrollToBottom(true);
});