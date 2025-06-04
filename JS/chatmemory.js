// /JS/chatgpt.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, push, onValue
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  getAuth, onAuthStateChanged, signInAnonymously
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

function addMessage(role, content) {
  const msg = document.createElement("div");
  msg.className = `chat-${role}`;
  msg.textContent = `${role === "user" ? "🧑 You" : "🤖 GPT"}: ${content}`;
  log.appendChild(msg);
  log.scrollTop = log.scrollHeight;
}

function typeReplyText(text) {
  const msg = document.createElement("div");
  msg.className = "chat-assistant";
  msg.textContent = "🤖 GPT: ";
  log.appendChild(msg);

  let i = 0;
  const interval = setInterval(() => {
    if (i < text.length) {
      msg.textContent += text.charAt(i);
      i++;
    } else {
      clearInterval(interval);
    }
    log.scrollTop = log.scrollHeight;
  }, 20);
}

// Realtime Sync
function setupRealtimeSync(uid) {
  chatRef = ref(db, `chatHistory/${uid}`);
  onValue(chatRef, (snapshot) => {
    const messages = snapshot.val();
    if (!messages) return;

    log.innerHTML = "";
    Object.values(messages).forEach((msg) => {
      addMessage(msg.role, msg.content);
    });
  });
}

// Auth
onAuthStateChanged(auth, (user) => {
  if (user) {
    setupRealtimeSync(user.uid);
  } else {
    signInAnonymously(auth).catch(console.error);
  }
});

// Form Submit
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt || !chatRef) return;

  // Save user message
  push(chatRef, {
    role: "user",
    content: prompt,
    timestamp: Date.now()
  });

  addMessage("user", prompt);
  input.value = "";

  // Send to Netlify backend
  try {
    const res = await fetch("/.netlify/functions/chatgpt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt })
    });

    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content?.trim();

    if (reply) {
      typeReplyText(reply);

      // Save assistant reply
      push(chatRef, {
        role: "assistant",
        content: reply,
        timestamp: Date.now()
      });
    } else {
      typeReplyText("No response received.");
    }

  } catch (err) {
    typeReplyText("❌ Error: " + err.message);
  }
});