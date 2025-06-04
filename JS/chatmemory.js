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

// Init
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const log = document.getElementById("chat-log");

let chatRef = null;

onAuthStateChanged(auth, (user) => {
  if (!user) return;

  chatRef = ref(db, `chatHistory/${user.uid}`);
  onValue(chatRef, (snapshot) => {
    const data = snapshot.val() || {};
    const messages = Object.entries(data).map(([id, val]) => ({ id, ...val }));
    renderMessages(messages);
  });
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt || !chatRef) return;

  const userMsg = { role: "user", content: prompt, timestamp: Date.now() };
  push(chatRef, userMsg);

  appendMessage(userMsg);
  input.value = "";

  const res = await fetch("/.netlify/functions/chatgpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt })
  });

  const data = await res.json();
  const reply = data?.choices?.[0]?.message?.content?.trim();

  const botMsg = { role: "assistant", content: reply || "No response.", timestamp: Date.now() };
  push(chatRef, botMsg);

  appendMessage(botMsg);
});

// Render messages in chat log
function renderMessages(messages) {
  log.innerHTML = "";
  messages
    .sort((a, b) => a.timestamp - b.timestamp)
    .forEach(msg => appendMessage(msg));
}

// Animate typing-style text
function appendMessage({ role, content }) {
  const line = document.createElement("div");
  line.className = role === "user" ? "msg user-msg" : "msg bot-msg";
  line.textContent = "";

  log.appendChild(line);
  log.scrollTop = log.scrollHeight;

  let i = 0;
  const interval = setInterval(() => {
    if (i < content.length) {
      line.textContent += content[i++];
      log.scrollTop = log.scrollHeight;
    } else {
      clearInterval(interval);
    }
  }, 15);
}