// /JS/chatgpt.js

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
  storageBucket: "mishanikeyenko.firebasestorage.app",
  messagingSenderId: "1089190937368",
  appId: "1:1089190937368:web:959c825fc596a5e3ae946d",
  measurementId: "G-L6CC27129C"
};

// Init Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// DOM
const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const log = document.getElementById("chat-log");

let chatRef = null;

// Auto-scroll to bottom
function scrollToBottom() {
  log.scrollTop = log.scrollHeight;
}

// Render one message
function renderMessage(msg) {
  const bubble = document.createElement("div");
  bubble.className = `chat-bubble ${msg.role}`;
  bubble.textContent = msg.content;
  log.appendChild(bubble);
  scrollToBottom();
}

// Listen for auth and bind chat
onAuthStateChanged(auth, user => {
  if (!user) return;
  chatRef = ref(db, `chatHistory/${user.uid}`);
  onValue(chatRef, snapshot => {
    const data = snapshot.val() || {};
    log.innerHTML = "";
    Object.values(data).forEach(renderMessage);
  });
});

// Submit handler
form.addEventListener("submit", async e => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt || !chatRef) return;

  // Add user message to Firebase
  const userMsg = { role: "user", content: prompt, timestamp: Date.now() };
  push(chatRef, userMsg);
  input.value = "";

  // Temporary thinking bubble
  const botBubble = document.createElement("div");
  botBubble.className = "chat-bubble assistant";
  botBubble.textContent = "…";
  log.appendChild(botBubble);
  scrollToBottom();

  try {
    const res = await fetch("/.netlify/functions/chatgpt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }) // Not sending history
    });

    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      botBubble.textContent = "[Empty response]";
      return;
    }

    // Update bot bubble
    botBubble.textContent = reply;

    // Save bot response to Firebase
    const botMsg = { role: "assistant", content: reply, timestamp: Date.now() };
    push(chatRef, botMsg);

  } catch (err) {
    botBubble.textContent = `❌ ${err.message}`;
  }
});