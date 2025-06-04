import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, set, push, get, onValue
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

// DOM Elements
const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const log = document.getElementById("chat-log");

let uid = null;
let chatRef = null;

signInAnonymously(auth);

onAuthStateChanged(auth, user => {
  if (!user) return;
  uid = user.uid;
  chatRef = ref(db, `chatHistory/${uid}`);

  onValue(chatRef, snapshot => {
    const data = snapshot.val();
    const messages = data ? Object.values(data) : [];
    log.innerHTML = "";
    messages.reverse().forEach(entry => appendMessage(entry.role, entry.content));
  });
});

function appendMessage(role, content) {
  const bubble = document.createElement("div");
  bubble.className = role === "user" ? "chat-bubble user" : "chat-bubble gpt";
  bubble.textContent = content;
  log.prepend(bubble);
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt || !chatRef) return;
  input.value = "";

  appendMessage("user", prompt);

  const snapshot = await get(chatRef);
  const history = snapshot.exists() ? Object.values(snapshot.val()) : [];

  const messages = [...history, { role: "user", content: prompt }];
  const thinking = document.createElement("div");
  thinking.className = "chat-bubble gpt";
  thinking.textContent = "🤖 GPT: ...thinking...";
  log.prepend(thinking);

  try {
    const res = await fetch("/.netlify/functions/chatgpt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages })
    });
    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content?.trim() || "No response";
    thinking.textContent = `🤖 GPT: ${reply}`;
    const newHistory = [...messages, { role: "assistant", content: reply }];
    await set(chatRef, newHistory);
  } catch (err) {
    thinking.textContent = `❌ ${err.message}`;
  }
});