// JS/chatgpt.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, push, set, onValue
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  getAuth, onAuthStateChanged, signInAnonymously
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

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

let userId = null;
let userRef = null;
let history = [];

function appendMessage(role, content) {
  const msg = document.createElement("div");
  msg.textContent = `${role === "user" ? "🧑 You" : "🤖 GPT"}: ${content}`;
  log.appendChild(msg);
  log.scrollTop = log.scrollHeight;
}

function streamText(target, text) {
  target.textContent = "🤖 GPT: ";
  let i = 0;
  const interval = setInterval(() => {
    if (i >= text.length) return clearInterval(interval);
    target.textContent += text[i++];
    log.scrollTop = log.scrollHeight;
  }, 20);
}

onAuthStateChanged(auth, (user) => {
  if (!user) return signInAnonymously(auth);
  userId = user.uid;
  userRef = ref(db, `chatHistory/${userId}`);

  onValue(userRef, (snap) => {
    const data = snap.val();
    history = [];
    log.innerHTML = "";

    if (data) {
      Object.values(data).forEach(entry => {
        history.push({ role: entry.role, content: entry.content });
        appendMessage(entry.role, entry.content);
      });
    }
  });
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt || !userRef) return;

  const userMsg = { role: "user", content: prompt };
  appendMessage("user", prompt);
  input.value = "";
  const gptLine = document.createElement("div");
  gptLine.textContent = "🤖 GPT: ...thinking...";
  log.appendChild(gptLine);

  try {
    const res = await fetch("/.netlify/functions/chatgpt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, history })
    });

    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content?.trim();
    const botMsg = { role: "assistant", content: reply || "No response" };

    streamText(gptLine, botMsg.content);

    push(userRef, userMsg);
    push(userRef, botMsg);

    history.push(userMsg, botMsg);
  } catch (err) {
    gptLine.textContent = `❌ Error: ${err.message}`;
  }
});