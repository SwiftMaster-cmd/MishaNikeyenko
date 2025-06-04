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

let userChatRef = null;
const log = document.getElementById("chat-log");
const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");

function renderMessage(role, content) {
  const msg = document.createElement("div");
  msg.textContent = `${role === "user" ? "🧑" : "🤖"} ${content}`;
  msg.style.padding = "0.6rem 1rem";
  msg.style.borderRadius = "12px";
  msg.style.background = role === "user" ? "#3f2b96" : "#262940";
  log.prepend(msg);
}

onAuthStateChanged(auth, (user) => {
  if (!user) return console.warn("[Chat] Not signed in");
  userChatRef = ref(db, `chatHistory/${user.uid}`);

  onValue(userChatRef, (snapshot) => {
    const data = snapshot.val() || {};
    log.innerHTML = "";
    Object.values(data)
      .sort((a, b) => b.timestamp - a.timestamp)
      .forEach(entry => renderMessage(entry.role, entry.content));
  });
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt || !userChatRef) return;

  renderMessage("user", prompt);
  push(userChatRef, { role: "user", content: prompt, timestamp: Date.now() });

  input.value = "";

  try {
    const res = await fetch("/.netlify/functions/chatgpt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt })
    });

    const data = await res.json();
    const reply = data.reply || "No response.";
    renderMessage("assistant", reply);
    push(userChatRef, { role: "assistant", content: reply, timestamp: Date.now() });
  } catch (err) {
    renderMessage("error", "❌ " + err.message);
  }
});