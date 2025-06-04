// Firebase Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, push, onValue, get
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

// Init
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);
signInAnonymously(auth);

const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const log = document.getElementById("chat-log");

let userRef = null;

// Render message bubble
function appendMessage(role, content) {
  const div = document.createElement("div");
  div.className = `chat-msg ${role}`;
  div.innerHTML = `${role === "user" ? "🧑" : "🤖"} ${content}`;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

// Typing animation
function typeText(elem, text, delay = 15) {
  let i = 0;
  function type() {
    if (i < text.length) {
      elem.textContent += text[i++];
      setTimeout(type, delay);
    }
  }
  type();
}

// Handle form submission
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt || !userRef) return;
  input.value = "";

  const userMsg = { role: "user", content: prompt, timestamp: Date.now() };
  push(userRef, userMsg);
  appendMessage("user", prompt);

  const gptLine = document.createElement("div");
  gptLine.className = "chat-msg assistant";
  gptLine.textContent = "🤖 ...thinking...";
  log.appendChild(gptLine);
  log.scrollTop = log.scrollHeight;

  try {
    const historySnap = await get(userRef);
    const history = historySnap.exists() ? Object.values(historySnap.val()) : [];
    const messages = [...history, userMsg];

    const res = await fetch("/.netlify/functions/chatgpt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages })
    });

    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content?.trim();

    if (reply) {
      gptLine.textContent = "";
      typeText(gptLine, `🤖 ${reply}`);
      push(userRef, { role: "assistant", content: reply, timestamp: Date.now() });
    } else {
      gptLine.textContent = "🤖 No response received.";
    }
  } catch (err) {
    gptLine.textContent = `❌ ${err.message}`;
  }
});

// Load history when signed in
onAuthStateChanged(auth, (user) => {
  if (!user) return;
  userRef = ref(db, `chatHistory/${user.uid}`);

  onValue(userRef, (snap) => {
    const data = snap.val();
    log.innerHTML = "";
    if (!data) return;
    Object.values(data).forEach(msg => {
      appendMessage(msg.role, msg.content);
    });
  });
});