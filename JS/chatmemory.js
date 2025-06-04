// /JS/chatgpt.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, push, onValue
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  getAuth, onAuthStateChanged, signInAnonymously
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const log = document.getElementById("chat-log");

let userRef = null;

// Typing effect
function typeText(target, text) {
  target.textContent = "";
  let i = 0;
  const interval = setInterval(() => {
    if (i < text.length) {
      target.textContent += text[i++];
    } else {
      clearInterval(interval);
    }
  }, 25);
}

// Append message
function appendMessage(role, content) {
  const div = document.createElement("div");
  div.className = `chat-msg ${role}`;
  if (role === "assistant") {
    typeText(div, `🤖 ${content}`);
  } else {
    div.textContent = `🧑 ${content}`;
  }
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

// Load chat history
function renderChat(messages) {
  log.innerHTML = "";
  messages.sort((a, b) => a.timestamp - b.timestamp);
  messages.forEach(msg => appendMessage(msg.role, msg.content));
}

// Submit chat
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt || !userRef) return;
  input.value = "";

  const userMsg = { role: "user", content: prompt, timestamp: Date.now() };
  push(userRef, userMsg);
  appendMessage("user", prompt);

  const gptLine = document.createElement("div");
  gptLine.className = "chat-msg assistant";
  gptLine.textContent = "🤖 ...thinking...";
  log.appendChild(gptLine);
  log.scrollTop = log.scrollHeight;

  try {
    const res = await fetch("/.netlify/functions/chatgpt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt })
    });

    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content?.trim();

    if (reply) {
      gptLine.textContent = "";
      typeText(gptLine, `🤖 ${reply}`);
      push(userRef, { role: "assistant", content: reply, timestamp: Date.now() });
    } else {
      gptLine.textContent = "🤖 No response received.";
    }
  } catch (err) {
    gptLine.textContent = `❌ ${err.message}`;
  }
});

// Start session
onAuthStateChanged(auth, (user) => {
  if (user) {
    userRef = ref(db, `chatHistory/${user.uid}`);
    onValue(userRef, snap => {
      const data = snap.val() || {};
      const messages = Object.entries(data).map(([id, val]) => ({ id, ...val }));
      renderChat(messages);
    });
  } else {
    signInAnonymously(auth);
  }
});