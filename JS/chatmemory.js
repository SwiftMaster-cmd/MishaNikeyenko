import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, push, onValue
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Firebase Configuration
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  databaseURL: "YOUR_DATABASE_URL",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// DOM Elements
const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const log = document.getElementById("chat-log");

let chatRef = null;

// Function to append messages to the chat log
function appendMessage(role, content) {
  const div = document.createElement("div");
  div.className = `chat-message ${role}`;
  div.textContent = content;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

// Authenticate and load chat history
signInAnonymously(auth);
onAuthStateChanged(auth, user => {
  if (!user) return;
  chatRef = ref(db, `chatHistory/${user.uid}`);
  onValue(chatRef, snapshot => {
    log.innerHTML = "";
    const data = snapshot.val() || {};
    Object.values(data).forEach(entry => {
      appendMessage(entry.role, entry.content);
    });
  });
});

// Handle form submission
form.addEventListener("submit", async e => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt || !chatRef) return;

  input.value = "";
  appendMessage("user", prompt);
  push(chatRef, { role: "user", content: prompt });

  const thinking = document.createElement("div");
  thinking.className = "chat-message assistant";
  thinking.textContent = "Thinking...";
  log.appendChild(thinking);
  log.scrollTop = log.scrollHeight;

  try {
    const res = await fetch("/.netlify/functions/chatgpt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt })
    });

    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content?.trim() || "No reply";
    thinking.textContent = reply;
    push(chatRef, { role: "assistant", content: reply });
  } catch (err) {
    thinking.textContent = `Error: ${err.message}`;
  }
});