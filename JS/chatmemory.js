import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase,
  ref,
  push,
  onValue,
  set
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  getMemory,
  getDayLog,
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
  appId: "1:1089190937368:web:959c825fc596a5e3ae946d",
  measurementId: "G-L6CC27129C"
};

// Init
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// DOM
const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const log = document.getElementById("chat-log");

let chatRef = null;
let userHasScrolled = false;
let uid = null;

// Detect scroll
log.addEventListener("scroll", () => {
  const threshold = 100;
  userHasScrolled = (log.scrollTop + log.clientHeight + threshold < log.scrollHeight);
});

// Scroll to bottom
function scrollToBottom(force = false) {
  if (!userHasScrolled || force) {
    requestAnimationFrame(() => {
      log.scrollTop = log.scrollHeight;
    });
  }
}

// Render chat messages
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

// Load chat history
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

// On submit
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
  const [memory, dayLogSnap] = await Promise.all([
    getMemory(uid),
    getDayLog(uid, today)
  ]);

  const systemPrompt = buildSystemPrompt(memory, dayLogSnap, today);

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: prompt }
  ];

  const res = await fetch("/.netlify/functions/chatgpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages,
      model: "gpt-4o",
      temperature: 0.4
    })
  });

  const data = await res.json();
  const reply = data?.choices?.[0]?.message?.content?.trim() || "No reply.";

  const botMsg = {
    role: "assistant",
    content: reply,
    timestamp: Date.now()
  };

  push(chatRef, botMsg);

  // Optional: extract log info from GPT (use a second GPT call or parsing)
  if (prompt.toLowerCase().includes("today") || prompt.includes("log this")) {
    const logRes = await fetch("/.netlify/functions/chatgpt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "system", content: "Extract a structured log from this message. Format with: highlights, mood, notes, questions." },
          { role: "user", content: prompt }
        ],
        model: "gpt-4o",
        temperature: 0.3
      })
    });

    const logData = await logRes.json();
    const logContent = logData?.choices?.[0]?.message?.content;

    try {
      const parsedLog = JSON.parse(logContent);
      await updateDayLog(uid, today, parsedLog);
    } catch (err) {
      console.warn("Could not parse day log:", err.message);
    }
  }
});

// On load, scroll to bottom
document.addEventListener("DOMContentLoaded", () => {
  scrollToBottom(true);
});