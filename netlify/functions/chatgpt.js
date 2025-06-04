// /JS/chatgpt.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, push, onValue, set
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

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

const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const log = document.getElementById("chat-log");

let uid = null;
let chatRef = null;
let history = [];

function renderChatLog() {
  log.innerHTML = "";
  history.slice().reverse().forEach(({ role, content }) => {
    const line = document.createElement("div");
    line.textContent = role === "user" ? `🧑 You: ${content}` : `🤖 GPT: ${content}`;
    log.appendChild(line);
  });
}

function addMessage(role, content) {
  const msg = { role, content, timestamp: Date.now() };
  history.push(msg);
  if (chatRef) push(chatRef, msg);
  renderChatLog();
}

function typeEffect(target, text) {
  let i = 0;
  const interval = setInterval(() => {
    target.textContent += text.charAt(i++);
    if (i >= text.length) clearInterval(interval);
  }, 20);
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt) return;

  addMessage("user", prompt);
  input.value = "";

  const gptLine = document.createElement("div");
  gptLine.textContent = "🤖 GPT: ";
  log.prepend(gptLine);

  try {
    const res = await fetch("/.netlify/functions/chatgpt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, history })
    });

    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content?.trim();

    if (reply) {
      typeEffect(gptLine, reply);
      history.push({ role: "assistant", content: reply, timestamp: Date.now() });
      if (chatRef) push(chatRef, { role: "assistant", content: reply, timestamp: Date.now() });
    } else {
      gptLine.textContent += "⚠️ No response";
    }
  } catch (err) {
    gptLine.textContent += `❌ ${err.message}`;
  }
});

onAuthStateChanged(auth, (user) => {
  if (user) {
    uid = user.uid;
    chatRef = ref(db, `chatHistory/${uid}`);
    onValue(chatRef, (snap) => {
      const val = snap.val() || {};
      history = Object.values(val).sort((a, b) => a.timestamp - b.timestamp);
      renderChatLog();
    });
  }
});

signInAnonymously(auth);