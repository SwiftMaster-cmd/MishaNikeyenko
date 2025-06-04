import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, push, onValue
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  getAuth, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

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
  input.value = "";

  const res = await fetch("/.netlify/functions/chatgpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt })
  });

  const data = await res.json();
  const reply = data?.choices?.[0]?.message?.content?.trim() || "No reply.";

  const botMsg = { role: "assistant", content: reply, timestamp: Date.now() };
  push(chatRef, botMsg);
});

// Append and animate
function renderMessages(messages) {
  log.innerHTML = "";
  messages
    .sort((a, b) => a.timestamp - b.timestamp)
    .forEach(msg => {
      const div = document.createElement("div");
      div.className = msg.role === "user" ? "msg user-msg" : "msg bot-msg";
      log.appendChild(div);
      animateText(div, msg.content);
    });
}

function animateText(elem, text) {
  elem.textContent = "";
  let i = 0;
  const typing = setInterval(() => {
    if (i < text.length) {
      elem.textContent += text[i++];
      log.scrollTop = log.scrollHeight;
    } else {
      clearInterval(typing);
    }
  }, 15);
}