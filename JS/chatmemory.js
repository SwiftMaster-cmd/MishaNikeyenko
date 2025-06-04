// chatgpt.js – Full ChatGPT Frontend with Firebase Memory

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, push, onValue
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  getAuth, onAuthStateChanged, signInAnonymously
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// --- Firebase Config ---
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

// --- Init ---
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const log = document.getElementById("chat-log");

let chatRef = null;

// --- Scroll to Bottom ---
function scrollToBottom() {
  log.scrollTop = log.scrollHeight;
}

// --- Render Message ---
function renderMessage(role, text) {
  const div = document.createElement("div");
  div.className = role === "user" ? "user-msg" : "gpt-msg";
  div.textContent = `${role === "user" ? "🧑 You" : "🤖 GPT"}: ${text}`;
  log.appendChild(div);
  scrollToBottom();
}

// --- Load Chat History ---
function loadHistory(uid) {
  chatRef = ref(db, `chatHistory/${uid}`);
  onValue(chatRef, (snapshot) => {
    log.innerHTML = "";
    const history = snapshot.val();
    if (history) {
      Object.values(history).forEach(msg => {
        renderMessage(msg.role, msg.content);
      });
    }
  });
}

// --- Save to Firebase ---
function saveMessage(role, content) {
  if (chatRef) {
    push(chatRef, {
      role,
      content,
      timestamp: Date.now()
    });
  }
}

// --- Submit Chat ---
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt) return;

  renderMessage("user", prompt);
  saveMessage("user", prompt);
  input.value = "";

  const thinking = document.createElement("div");
  thinking.className = "gpt-msg";
  thinking.textContent = "🤖 GPT: ...thinking...";
  log.appendChild(thinking);
  scrollToBottom();

  try {
    const res = await fetch("/.netlify/functions/chatgpt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt })
    });

    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content?.trim() || "No reply.";
    thinking.remove();
    renderMessage("assistant", reply);
    saveMessage("assistant", reply);
  } catch (err) {
    thinking.remove();
    renderMessage("assistant", `❌ Error: ${err.message}`);
  }
});

// --- Auth ---
onAuthStateChanged(auth, (user) => {
  if (user) {
    loadHistory(user.uid);
  } else {
    signInAnonymously(auth);
  }
});