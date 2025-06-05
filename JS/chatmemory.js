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
  getCalendar,
  getCalcHistory,
  updateDayLog,
  buildSystemPrompt
} from "./memoryManager.js";

// --- NOTES API BUILT IN ---
async function addNote(uid, content) {
  if (!uid) { console.error("addNote: No uid"); return false; }
  if (!content) { console.error("addNote: No content"); return false; }
  const db = getDatabase();
  const today = new Date().toISOString().split('T')[0];
  const todayRef = ref(db, `notes/${uid}/${today}`);
  await push(todayRef, { content, timestamp: Date.now() });
  console.log("Note written to Firebase:", { uid, today, content });
  return true;
}

async function getNotes(uid, onlyToday = false) {
  if (!uid) { console.error("getNotes: No uid"); return {}; }
  const db = getDatabase();
  const baseRef = ref(db, `notes/${uid}`);
  const snapshot = await get(baseRef);
  if (!snapshot.exists()) return {};
  const data = snapshot.val() || {};
  if (onlyToday) {
    const today = new Date().toISOString().split('T')[0];
    return data[today] || {};
  }
  return data;
}

// --- CONFIG ---
const firebaseConfig = {
  apiKey: "AIzaSyCf_se10RUg8i_u8pdowHlQvrFViJ4jh_Q",
  authDomain: "mishanikeyenko.firebaseapp.com",
  databaseURL: "https://mishanikeyenko-default-rtdb.firebaseio.com",
  projectId: "mishanikeyenko",
  storageBucket: "mishanikeyenko.firebasestorage.app",
  messagingSenderId: "1089190937368",
  appId: "1:1089190937368:web:959c825fc596a5e3ae946d"
};

// --- INIT ---
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// --- DOM ---
const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const log = document.getElementById("chat-log");

let uid = null;
let chatRef = null;
let userHasScrolled = false;

// --- DEBUG LOGGING ---
function addDebugMessage(text) {
  const div = document.createElement("div");
  div.className = "msg debug-msg";
  div.textContent = `[DEBUG] ${text}`;
  log.appendChild(div);
  scrollToBottom(true);
  console.log(text);
}

// --- SCROLL CONTROL ---
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

// --- RENDER MESSAGES ---
function renderMessages(messages) {
  log.innerHTML = "";
  messages
    .sort((a, b) => a.timestamp - b.timestamp)
    .forEach((msg) => {
      const role = msg.role === "bot" ? "assistant" : msg.role;
      const div = document.createElement("div");
      div.className = `msg ${role === "user" ? "user-msg" : role === "assistant" ? "bot-msg" : "debug-msg"}`;
      div.textContent = msg.content;
      log.appendChild(div);
    });
  const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 100;
  userHasScrolled = !nearBottom;
  scrollToBottom();
}

// --- FIREBASE AUTH + CHAT HISTORY ---
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
      role: msg.role === "bot" ? "assistant" : msg.role // normalize
    }));
    renderMessages(messages);
    addDebugMessage("Chat messages loaded from Firebase.");
  });
});

// --- EXTRACT JSON FROM GPT REPLY (with fence cleanup) ---
function extractJsonFromReply(raw) {
  if (!raw) return "";
  // Handles ```json ... ``` or ``` ... ```
  return raw
    .replace(/```json\s*([\s\S]*?)```/gi, '$1')
    .replace(/```\s*([\s\S]*?)```/gi, '$1')
    .trim();
}

// --- HANDLE CHAT FORM SUBMIT ---
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt || !chatRef || !uid) {
    addDebugMessage("Form submit: missing prompt, chatRef, or uid.");
    return;
  }

  // --- /note command ---
  if (prompt.startsWith("/note ")) {
    const noteText = prompt.replace("/note ", "").trim();
    if (noteText) {
      await addNote(uid, noteText);
      addDebugMessage("Note added: " + noteText);
      await push(chatRef, {
        role: "assistant",
        content: `Saved note: "${noteText}"`,
        timestamp: Date.now()
      });
      console.log("Note confirmed in chat");
    }
    input.value = "";
    return;
  }

  // --- NORMAL CHAT MESSAGE FLOW ---
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

  // Load all chat history
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
        role: msg.role === "bot" ? "assistant" : msg.role,
        content: msg.content
      }));
  } catch (err) {
    addDebugMessage("Failed to read messages from Firebase: " + err.message);
    return;
  }

  // Build system prompt, including notes
  const today = new Date().toISOString().slice(0, 10);
  let messages = [];
  try {
    // --- NOTE: Loads all notes, logs to console
    const notes = await getNotes(uid);
    console.log("Fetched notes for prompt context:", notes);
    const [memory, dayLog, calendar, calc] = await Promise.all([
      getMemory(uid),
      getDayLog(uid, today),
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

  // --- GPT API CALL ---
  let reply = "No reply.";
  try {
    addDebugMessage("Sending messages to API: " + JSON.stringify(messages));
    const res = await fetch("/.netlify/functions/gpt", {
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
    } else {
      reply = `[Debug: ${JSON.stringify(dataRes)}]`;
    }
  } catch (err) {
    reply = `[Error: ${err.message}]`;
    addDebugMessage("API fetch failed: " + err.message);
  }

  // Write assistant reply
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

  // --- Optional: extract log for day/summary if detected ---
  if (/\/log|remember this|today|add to log/i.test(prompt)) {
    try {
      const logRes = await fetch("/.netlify/functions/gpt", {
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
const cleanJson = extractJsonFromReply(extracted);
let logData = null;
if (/^\s*[\[{]/.test(cleanJson)) {
  try {
    logData = JSON.parse(cleanJson);
  } catch (err) {
    addDebugMessage("🛑 Log parse failed: " + err.message + " | Offending content: " + cleanJson);
    console.error("Log parse fail:", err, cleanJson);
    logData = null;
  }
} else {
  addDebugMessage("🛑 Log parse skipped: Assistant did not return JSON. Content: " + cleanJson);
}
if (logData) {
  await updateDayLog(uid, today, logData);
  addDebugMessage("Day log updated.");
  console.log("Day log written:", logData);
}
});

document.addEventListener("DOMContentLoaded", () => {
  scrollToBottom(true);
});