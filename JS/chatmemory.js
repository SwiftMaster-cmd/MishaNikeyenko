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

// Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyCf_se10RUg8i_u8pdowHlQvrFViJ4jh_Q",
  authDomain: "mishanikeyenko.firebaseapp.com",
  databaseURL: "https://mishanikeyenko-default-rtdb.firebaseio.com",
  projectId: "mishanikeyenko",
  storageBucket: "mishanikeyenko.appspot.com",
  messagingSenderId: "1089190937368",
  appId: "1:1089190937368:web:959c825fc596a5e3ae946d"
};

// Init Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// DOM Elements
const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const log = document.getElementById("chat-log");

let chatRef = null;

// Auth and chat init
onAuthStateChanged(auth, (user) => {
  if (!user) {
    signInAnonymously(auth);
    return;
  }

  chatRef = ref(db, `chatHistory/${user.uid}`);

  onValue(chatRef, (snapshot) => {
    const data = snapshot.val() || {};
    const messages = Object.entries(data).map(([id, msg]) => ({ id, ...msg }));
    renderMessages(messages);
  });
});

// Submit
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt || !chatRef) return;

  const userMsg = {
    role: "user",
    content: prompt,
    timestamp: Date.now()
  };

  push(chatRef, userMsg);
  input.value = "";
  input.focus();
  scrollToBottom();

  const res = await fetch("/.netlify/functions/chatgpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt })
  });

  const data = await res.json();
  const reply = data?.choices?.[0]?.message?.content?.trim() || "No reply.";

  const botMsg = {
    role: "assistant",
    content: reply,
    timestamp: Date.now()
  };

  push(chatRef, botMsg);
});

// Render + scroll
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

  scrollToBottom();
}

function scrollToBottom() {
  setTimeout(() => {
    requestAnimationFrame(() => {
      log.scrollTop = log.scrollHeight;
    });
  }, 30);
}

// Initial scroll to bottom
document.addEventListener("DOMContentLoaded", () => {
  scrollToBottom();
});