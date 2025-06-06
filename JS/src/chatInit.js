// chat.js
import {
  ref,
  push,
  onValue,
  get,
  child
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import { db, auth } from "./firebaseConfig.js";
import { createDebugOverlay, showDebugOverlay, addDebugMessage } from "./debugOverlay.js";
import { renderMessages, scrollToBottom, attachScrollListener } from "./messageRenderer.js";
import { fetchAllContext, writeMemoryIfNeeded } from "./memoryService.js";
import { getLast20Messages, sendGPTReply, maybeSummarize } from "./assistantService.js";
import {
  handleStaticCommand,
  listNotes,
  listReminders,
  listEvents
} from "./commandHandlers.js";

const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const log = document.getElementById("chat-log");

let uid = null;
let chatRef = null;

// Initialize debug overlay
createDebugOverlay();
document.getElementById("debug-toggle")?.addEventListener("click", showDebugOverlay);

// Attach scroll listener to log container
attachScrollListener(log);

onAuthStateChanged(auth, (user) => {
  if (!user) {
    signInAnonymously(auth);
    addDebugMessage("Auth: Signed in anonymously.");
    return;
  }
  uid = user.uid;
  chatRef = ref(db, `chatHistory/${uid}`);

  // Listen to chatHistory changes and re-render last 20 messages
  onValue(chatRef, (snapshot) => {
    const data = snapshot.val() || {};
    const allMessages = Object.entries(data).map(([id, msg]) => ({
      id,
      role: msg.role === "bot" ? "assistant" : msg.role,
      content: msg.content,
      timestamp: msg.timestamp || 0
    }));
    const last20 = allMessages
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-20);
    renderMessages(log, last20);
  });
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt || !chatRef || !uid) return;
  input.value = "";

  // Handle static & listing commands first
  const staticCommands = ["/time", "/date", "/uid", "/clearchat", "/summary", "/commands"];
  if (staticCommands.includes(prompt)) {
    await handleStaticCommand(prompt, chatRef, uid);
    return;
  }
  if (prompt === "/notes") {
    await listNotes(chatRef);
    return;
  }
  if (prompt === "/reminders") {
    await listReminders(chatRef);
    return;
  }
  if (prompt === "/events") {
    await listEvents(chatRef);
    return;
  }

  // 1) Push user message
  const now = Date.now();
  await push(chatRef, { role: "user", content: prompt, timestamp: now });

  // 2) In parallel: assistant reply + memory write
  (async () => {
    const today = new Date().toISOString().slice(0, 10);

    // a) Fetch last 20 messages for context
    let last20 = [];
    try {
      last20 = await getLast20Messages(uid);
    } catch (err) {
      addDebugMessage("Error fetching last 20 for reply: " + err.message);
    }

    // b) Fetch all memory/context nodes
    const { memory, dayLog, notes, calendar, reminders, calc } = await fetchAllContext(uid, today);

    // c) Build the system prompt
    const sysPrompt = buildSystemPrompt({
      memory,
      todayLog: dayLog,
      notes,
      calendar,
      reminders,
      calc,
      date: today
    });
    const fullContext = [{ role: "system", content: sysPrompt }, ...last20];

    // d) Write memory if needed
    await writeMemoryIfNeeded(prompt, uid, today);

    // e) Get GPT reply
    let assistantReply = "[No reply]";
    try {
      assistantReply = await sendGPTReply(fullContext);
    } catch (err) {
      // Already logged inside sendGPTReply
    }

    // f) Push assistant’s reply to chatHistory
    await push(chatRef, { role: "assistant", content: assistantReply, timestamp: Date.now() });
  })();

  // 3) In parallel: summarization every 20 messages
  (async () => {
    let allCount = 0;
    let last20ForSummary = [];
    try {
      const snap = await get(child(ref(db), `chatHistory/${uid}`));
      const data = snap.exists() ? snap.val() : {};
      allCount = Object.keys(data).length;
      last20ForSummary = Object.entries(data)
        .map(([id, msg]) => ({
          role: msg.role === "bot" ? "assistant" : msg.role,
          content: msg.content,
          timestamp: msg.timestamp || 0
        }))
        .sort((a, b) => a.timestamp - b.timestamp)
        .slice(-20);
    } catch (err) {
      addDebugMessage("Error fetching chatHistory for summary: " + err.message);
      return;
    }
    await maybeSummarize(uid, last20ForSummary, allCount);
  })();
});