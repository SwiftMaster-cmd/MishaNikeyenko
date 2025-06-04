// JS/chatgpt.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, push, set, onValue
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
  appId: "1:1089190937368:web:959c825fc596a5e3ae946d",
  measurementId: "G-L6CC27129C"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const log = document.getElementById("chat-log");

let chatRef = null;
let history = [];

function appendMessage(role, content) {
  const div = document.createElement("div");
  div.textContent = `${role === "user" ? "🧑 You" : "🤖 GPT"}: ${content}`;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

// Sign in and load chat history
signInAnonymously(auth);
onAuthStateChanged(auth, user => {
  if (!user) return;
  chatRef = ref(db, `chatHistory/${user.uid}`);
  onValue(chatRef, snap => {
    history = [];
    log.innerHTML = "";
    const data = snap.val() || {};
    Object.values(data).forEach(entry => {
      appendMessage(entry.role, entry.content);
      history.push({ role: entry.role, content: entry.content });
    });
  });
});

form.addEventListener("submit", async e => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt || !chatRef) return;

  input.value = "";
  appendMessage("user", prompt);
  push(chatRef, { role: "user", content: prompt });

  const thinking = document.createElement("div");
  thinking.textContent = "🤖 GPT: ...thinking...";
  log.appendChild(thinking);

  try {
    const res = await fetch("/.netlify/functions/chatgpt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, history })
    });

    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content?.trim() || "No reply";
    thinking.textContent = `🤖 GPT: ${reply}`;
    push(chatRef, { role: "assistant", content: reply });
  } catch (err) {
    thinking.textContent = `❌ Error: ${err.message}`;
  }
});