// chatgpt.js -- ChatGPT + Firebase long-term memory

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, push, onValue, set
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
  appId: "1:1089190937368:web:959c825fc596a5e3ae946d",
  measurementId: "G-L6CC27129C"
};

const app  = initializeApp(firebaseConfig);
const db   = getDatabase(app);
const auth = getAuth(app);

// UI elements
const form  = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const log   = document.getElementById("chat-log");

let chatRef = null;
let uid     = null;
let isThinking = false;

// Typing animation
function typeLine(element, text, index = 0) {
  if (index < text.length) {
    element.textContent += text.charAt(index);
    setTimeout(() => typeLine(element, text, index + 1), 10);
  }
}

// Display message in log (prepend)
function addMessage(role, text) {
  const line = document.createElement("div");
  line.textContent = `${role === "user" ? "🧑 You" : "🤖 GPT"}: ${text}`;
  log.prepend(line);
}

// Handle form
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (isThinking || !chatRef) return;

  const prompt = input.value.trim();
  if (!prompt) return;

  isThinking = true;

  const userMsg = { role: "user", content: prompt, timestamp: Date.now() };
  push(chatRef, userMsg);
  addMessage("user", prompt);
  input.value = "";

  const placeholder = document.createElement("div");
  placeholder.textContent = "🤖 GPT: ...thinking...";
  log.prepend(placeholder);

  try {
    const res = await fetch("/.netlify/functions/chatgpt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt })
    });

    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content?.trim() || "No reply";

    const botMsg = { role: "assistant", content: reply, timestamp: Date.now() };
    push(chatRef, botMsg);

    placeholder.textContent = "🤖 GPT: ";
    typeLine(placeholder, reply);
  } catch (err) {
    placeholder.textContent = `❌ Error: ${err.message}`;
  }

  isThinking = false;
});

// Load chat history
function renderChat(messages) {
  log.innerHTML = '';
  messages.sort((a, b) => b.timestamp - a.timestamp); // newest first
  messages.forEach(msg => addMessage(msg.role, msg.content));
}

// Firebase auth & listener
onAuthStateChanged(auth, (user) => {
  if (!user) return signInAnonymously(auth);

  uid = user.uid;
  chatRef = ref(db, `chatHistory/${uid}`);

  onValue(chatRef, snap => {
    const data = snap.val() || {};
    const messages = Object.entries(data).map(([id, val]) => val);
    renderChat(messages);
  });
});