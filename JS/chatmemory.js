import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getDatabase, ref, push, onChildAdded, set
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

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

// Init Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth();

// UI refs
const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const log = document.getElementById("chat-log");

// Handle auth
let uid = null;
signInAnonymously(auth).catch(console.error);
onAuthStateChanged(auth, user => {
  if (user) {
    uid = user.uid;
    listenToChatHistory(uid);
  }
});

// Load history from Firebase
function listenToChatHistory(uid) {
  const chatRef = ref(db, `chatMemory/${uid}`);
  onChildAdded(chatRef, snapshot => {
    const msg = snapshot.val();
    const line = document.createElement("div");
    line.textContent = `${msg.sender === "user" ? "🧑" : "🤖"} ${msg.sender}: ${msg.text}`;
    log.appendChild(line);
  });
}

// Handle form submit
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt || !uid) return;
  input.value = "";

  const userLine = { sender: "user", text: prompt };
  await push(ref(db, `chatMemory/${uid}`), userLine);

  const botLine = document.createElement("div");
  botLine.textContent = "🤖 GPT: ...thinking...";
  log.appendChild(botLine);

  try {
    const res = await fetch("/.netlify/functions/chatgpt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt })
    });

    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content?.trim() || "No response received.";
    const gptMsg = { sender: "bot", text: reply };
    await push(ref(db, `chatMemory/${uid}`), gptMsg);
  } catch (err) {
    botLine.textContent = `❌ Error: ${err.message}`;
  }
});