// Import Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, push, onValue
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

// Init Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const log = document.getElementById("chat-log");

let userRef = null;

// Sign in anonymously
signInAnonymously(auth).catch(console.error);

onAuthStateChanged(auth, (user) => {
  if (!user) return;

  const uid = user.uid;
  userRef = ref(db, `chatHistory/${uid}`);

  // Load chat history
  onValue(userRef, (snapshot) => {
    const data = snapshot.val() || {};
    log.innerHTML = "";

    Object.values(data).forEach(msg => {
      const div = document.createElement("div");
      div.textContent = `${msg.role === "user" ? "🧑 You" : "🤖 GPT"}: ${msg.content}`;
      log.appendChild(div);
    });
  });
});

// Submit handler
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt || !userRef) return;

  // Add user message to DB
  push(userRef, { role: "user", content: prompt, timestamp: Date.now() });

  const placeholder = document.createElement("div");
  placeholder.textContent = "🤖 GPT: ...thinking...";
  log.appendChild(placeholder);
  input.value = "";

  try {
    const res = await fetch("/.netlify/functions/chatgpt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt })
    });

    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content?.trim();

    // Typing animation
    if (reply) {
      placeholder.textContent = "🤖 GPT: ";
      let i = 0;
      const interval = setInterval(() => {
        if (i < reply.length) {
          placeholder.textContent += reply[i++];
        } else {
          clearInterval(interval);
        }
      }, 20);

      // Save GPT reply
      push(userRef, { role: "assistant", content: reply, timestamp: Date.now() });
    } else {
      placeholder.textContent = "🤖 GPT: No response received.";
    }

  } catch (err) {
    placeholder.textContent = `❌ Error: ${err.message}`;
  }
});