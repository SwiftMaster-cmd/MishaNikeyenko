// /JS/chatgpt.js
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
  appId: "1:1089190937368:web:959c825fc596a5e3ae946d"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const log = document.getElementById("chat-log");

let userRef = null;

// UI rendering
function addToChatLog(role, content) {
  const div = document.createElement("div");
  div.textContent = `${role === "user" ? "🧑" : "🤖"} ${role === "user" ? "You" : "GPT"}: ${content}`;
  log.prepend(div); // newest on top
}

// Auth and DB setup
onAuthStateChanged(auth, user => {
  if (!user) {
    signInAnonymously(auth);
    return;
  }

  userRef = ref(db, `chatHistory/${user.uid}`);
  onValue(userRef, snapshot => {
    const data = snapshot.val();
    log.innerHTML = "";
    if (!data) return;
    Object.values(data).forEach(msg => addToChatLog(msg.role, msg.content));
  });
});

// Submission
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt || !userRef) return;

  addToChatLog("user", prompt);
  push(userRef, { role: "user", content: prompt, timestamp: Date.now() });

  const replyDiv = document.createElement("div");
  replyDiv.textContent = `🤖 GPT: ...thinking...`;
  log.prepend(replyDiv);
  input.value = "";

  try {
    const res = await fetch("/.netlify/functions/chatgpt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }) // not sending history
    });

    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content?.trim();

    replyDiv.textContent = reply ? `🤖 GPT: ${reply}` : `🤖 GPT: No response`;
    if (reply) push(userRef, { role: "assistant", content: reply, timestamp: Date.now() });

  } catch (err) {
    replyDiv.textContent = `❌ Error: ${err.message}`;
  }
});