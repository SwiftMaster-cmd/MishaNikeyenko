import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, push, onValue
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  getAuth, onAuthStateChanged, signInAnonymously
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

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

// DOM
const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const log = document.getElementById("chat-log");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const prompt = input.value.trim();
  if (!prompt) return;

  // Add user message to DOM
  const userMsg = document.createElement("div");
  userMsg.className = "chat user";
  userMsg.textContent = `🧑 You: ${prompt}`;
  log.prepend(userMsg);

  // GPT thinking placeholder
  const botMsg = document.createElement("div");
  botMsg.className = "chat bot";
  botMsg.textContent = `🤖 GPT: ...thinking...`;
  log.prepend(botMsg);

  input.value = "";

  try {
    const res = await fetch("/.netlify/functions/chatgpt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt })
    });

    const data = await res.json();

    const reply = data?.choices?.[0]?.message?.content?.trim();
    botMsg.textContent = reply
      ? `🤖 GPT: ${reply}`
      : `🤖 GPT: No reply received.`;

  } catch (err) {
    botMsg.textContent = `❌ Error: ${err.message}`;
  }
});

function renderChat(messages) {
  log.innerHTML = "";
  messages.forEach((msg) => {
    const div = document.createElement("div");
    div.textContent = `${msg.role === "user" ? "🧑 You" : "🤖 GPT"}: ${msg.content}`;
    log.appendChild(div);
  });
  log.scrollTop = log.scrollHeight;
}