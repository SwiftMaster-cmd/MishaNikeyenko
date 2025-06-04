// /JS/chatgpt.js -- Firebase-integrated ChatGPT chat log

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, push, onValue
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  getAuth, onAuthStateChanged
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

let userChatRef = null;

function appendLine(text, role) {
  const div = document.createElement("div");
  div.textContent = `${role === "user" ? "🧑" : "🤖"} ${role === "user" ? "You" : "GPT"}: ${text}`;
  log.appendChild(div);
}

// Submit handler
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt || !userChatRef) return;

  appendLine(prompt, "user");
  const gptPlaceholder = document.createElement("div");
  gptPlaceholder.textContent = "🤖 GPT: ...thinking...";
  log.appendChild(gptPlaceholder);
  input.value = "";

  try {
    const res = await fetch("/.netlify/functions/chatgpt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt })
    });

    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content?.trim();

    const answer = reply || "No response received.";
    gptPlaceholder.textContent = `🤖 GPT: ${answer}`;

    push(userChatRef, {
      prompt,
      reply: answer,
      timestamp: Date.now()
    });
  } catch (err) {
    gptPlaceholder.textContent = `❌ Error: ${err.message}`;
  }
});

// Auth + Chat History
onAuthStateChanged(auth, (user) => {
  if (!user) {
    console.warn("[ChatGPT] Not signed in");
    return;
  }

  userChatRef = ref(db, `chatMemory/${user.uid}`);

  onValue(userChatRef, (snapshot) => {
    const history = snapshot.val();
    if (!history) return;

    log.innerHTML = "";
    Object.values(history)
      .sort((a, b) => a.timestamp - b.timestamp)
      .forEach(entry => {
        appendLine(entry.prompt, "user");
        appendLine(entry.reply, "assistant");
      });
  });
});