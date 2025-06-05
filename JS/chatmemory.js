import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase,
  ref,
  push,
  onValue
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  getMemory,
  getDayLog,
  getNotes,
  getCalendar,
  getCalcHistory,
  updateDayLog,
  buildSystemPrompt
} from "./memoryManager.js";

// Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyCf_se10RUg8i_u8pdowHlQvrFViJ4jh_Q",
  authDomain: "mishanikeyenko.firebaseapp.com",
  databaseURL: "https://mishanikeyenko-default-rtdb.firebaseio.com",
  projectId: "mishanikeyenko",
  storageBucket: "mishanikeyenko.firebasestorage.app",
  messagingSenderId: "1089190937368",
  appId: "1:1089190937368:web:959c825fc596a5e3ae946d"
};

// Init
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// DOM elements
const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const log = document.getElementById("chat-log");

let uid = null;
let chatRef = null;
let userHasScrolled = false;

// DEBUG FUNCTION: Shows a message in chat UI
function addDebugMessage(text) {
  const div = document.createElement("div");
  div.className = "msg debug-msg";
  div.textContent = `[DEBUG] ${text}`;
  log.appendChild(div);
  scrollToBottom(true);
}

// Scroll tracking
log.addEventListener("scroll", () => {
  const threshold = 100;
  userHasScrolled = (log.scrollTop + log.clientHeight + threshold < log.scrollHeight);
});

function scrollToBottom(force = false) {
  if (!userHasScrolled || force) {
    requestAnimationFrame(() => {
      log.scrollTop = log.scrollHeight;
    });
  }
}

// Renders messages from array (maps "bot" to "assistant")
function renderMessages(messages) {
  log.innerHTML = "";

  messages
    .sort((a, b) => a.timestamp - b.timestamp)
    .forEach((msg) => {
      const trueRole = msg.role === "bot" ? "assistant" : msg.role;
      const div = document.createElement("div");
      div.className = `msg ${trueRole === "user" ? "user-msg" : trueRole === "assistant" ? "bot-msg" : "debug-msg"}`;
      div.textContent = msg.content;
      log.appendChild(div);
    });

  const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 100;
  userHasScrolled = !nearBottom;
  scrollToBottom();
}

// Firebase Auth
onAuthStateChanged(auth, (user) => {
  if (!user) {
    signInAnonymously(auth);
    addDebugMessage("Signed in anonymously.");
    return;
  }

  uid = user.uid;
  chatRef = ref(db, `chatHistory/${uid}`);
  addDebugMessage("Auth ready. UID: " + uid);

  onValue(chatRef, (snapshot) => {
    const data = snapshot.val() || {};
    const messages = Object.entries(data).map(([id, msg]) => ({
      id,
      ...msg,
      role: msg.role === "bot" ? "assistant" : msg.role // map old data
    }));
    renderMessages(messages);
    addDebugMessage("Chat messages loaded from Firebase.");
  });
});

// FORM SUBMIT LOGIC – persistent memory fix, with debug
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const prompt = input.value.trim();
  if (!prompt || !chatRef || !uid) {
    addDebugMessage("Form submit: missing prompt, chatRef, or uid.");
    return;
  }

  // Push user message to Firebase
  const userMsg = {
    role: "user",
    content: prompt,
    timestamp: Date.now()
  };
  try {
    await push(chatRef, userMsg);
    addDebugMessage("User message written to Firebase.");
  } catch (err) {
    addDebugMessage("Failed to write user message to Firebase: " + err.message);
    return;
  }
  input.value = "";
  input.focus();
  scrollToBottom(true);

  // Load full chat history after update
  let allMessages = [];
  try {
    const snapshot = await new Promise(resolve => {
      onValue(chatRef, resolve, { onlyOnce: true });
    });
    addDebugMessage("Read messages from Firebase.");
    const data = snapshot.val() || {};
    allMessages = Object.entries(data)
      .sort((a, b) => a[1].timestamp - b[1].timestamp)
      .map(([id, msg]) => ({
        role: msg.role === "bot" ? "assistant" : msg.role, // ensure only valid roles
        content: msg.content
      }));
    addDebugMessage("Assembled all chat messages.");
  } catch (err) {
    addDebugMessage("Failed to read messages from Firebase: " + err.message);
    return;
  }

  // Build system prompt and prepend to history
  const today = new Date().toISOString().slice(0, 10);
  let messages = [];
  try {
    const [memory, dayLog, notes, calendar, calc] = await Promise.all([
      getMemory(uid),
      getDayLog(uid, today),
      getNotes(uid),
      getCalendar(uid),
      getCalcHistory(uid)
    ]);
    const systemPrompt = buildSystemPrompt({
      memory,
      todayLog: dayLog,
      notes,
      calendar,
      calc,
      date: today
    });

    messages = [
      { role: "system", content: systemPrompt },
      ...allMessages
    ];
    addDebugMessage("System prompt generated and prepended.");
  } catch (err) {
    addDebugMessage("Failed to build system prompt: " + err.message);
    return;
  }

  // Send full message history to GPT
  let reply = "No reply.";
  try {
    addDebugMessage("Sending messages to API: " + JSON.stringify(messages));
    const res = await fetch("/.netlify/functions/chatgpt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages,
        model: "gpt-4o",
        temperature: 0.4
      })
    });
    const dataRes = await res.json();
    addDebugMessage("Received API response: " + JSON.stringify(dataRes));
    if (dataRes?.choices?.[0]?.message?.content) {
      reply = dataRes.choices[0].message.content.trim();
    } else if (dataRes?.error) {
      reply = `[Error: ${dataRes.error}]`;
      addDebugMessage("API error: " + dataRes.error);
    } else {
      reply = `[Debug: ${JSON.stringify(dataRes)}]`;
      addDebugMessage("API unknown response shape.");
    }
  } catch (err) {
    reply = `[Error: ${err.message}]`;
    addDebugMessage("API fetch failed: " + err.message);
  }

  // Push assistant reply to Firebase (always as "assistant")
  try {
    await push(chatRef, {
      role: "assistant",
      content: reply,
      timestamp: Date.now()
    });
    addDebugMessage("Assistant reply written to Firebase.");
  } catch (err) {
    addDebugMessage("Failed to write assistant reply to Firebase: " + err.message);
  }

  scrollToBottom(true);

  // Optionally extract log for day/summary if detected
  if (/\/log|remember this|today|add to log/i.test(prompt)) {
    try {
      const logRes = await fetch("/.netlify/functions/chatgpt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content: "Extract a structured log. Return JSON with: highlights, mood, notes, questions."
            },
            { role: "user", content: prompt }
          ],
          model: "gpt-4o",
          temperature: 0.3
        })
      });

      const raw = await logRes.text();
      const parsed = JSON.parse(raw);
      const extracted = parsed?.choices?.[0]?.message?.content?.trim();
      const logData = JSON.parse(extracted);

      await updateDayLog(uid, today, logData);
      addDebugMessage("Day log updated.");
    } catch (err) {
      addDebugMessage("🛑 Log failed: " + err.message);
    }
  }
});

document.addEventListener("DOMContentLoaded", () => {
  scrollToBottom(true);
});