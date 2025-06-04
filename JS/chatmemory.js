// /JS/chatgpt.js – Full frontend chat with Firebase memory

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, push, onValue
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  getAuth, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyCf_se10RUg8i_u8pdowHlQvrFViJ4jh_Q",
  authDomain: "mishanikeyenko.firebaseapp.com",
  databaseURL: "https://mishanikeyenko-default-rtdb.firebaseio.com",
  projectId: "mishanikeyenko",
  storageBucket: "mishanikeyenko.appspot.com",
  messagingSenderId: "1089190937368",
  appId: "1:1089190937368:web:959c825fc596a5e3ae946d"
};

// Init
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const log = document.getElementById("chat-log");

let chatRef = null;

onAuthStateChanged(auth, user => {
  if (!user) return console.warn("🔒 Not signed in");
  chatRef = ref(db, `chatHistory/${user.uid}`);

  onValue(chatRef, snapshot => {
    const data = snapshot.val() || {};
    const sorted = Object.values(data).sort((a, b) => a.timestamp - b.timestamp);
    log.innerHTML = "";
    sorted.forEach(msg => addMessage(msg.role, msg.content));
    scrollToBottom();
  });
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt || !chatRef) return;

  input.value = "";
  addMessage("user", prompt);
  saveMessage("user", prompt);

  const botLine = addMessage("bot", "...");

  try {
    const res = await fetch("/.netlify/functions/chatgpt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt })
    });

    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content?.trim() || "No reply.";
    typeOut(botLine, reply);
    saveMessage("bot", reply);
  } catch (err) {
    typeOut(botLine, `❌ ${err.message}`);
  }
});

function addMessage(role, text) {
  const line = document.createElement("div");
  line.className = `chat-line chat-${role}`;
  line.textContent = text;
  log.appendChild(line);
  scrollToBottom();
  return line;
}

function saveMessage(role, content) {
  push(chatRef, {
    role,
    content,
    timestamp: Date.now()
  });
}

function typeOut(element, text, i = 0) {
  if (i >= text.length) return;
  element.textContent = text.slice(0, i + 1);
  setTimeout(() => typeOut(element, text, i + 1), 12);
}

function scrollToBottom() {
  log.scrollTop = log.scrollHeight;
}