
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

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

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);


// 🔹 chatLogic.js -- handles chat submission and logic
import { getDatabase, ref, push, onValue } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getMemory, getDayLog, getNotes, getCalendar, getReminders, getCalcHistory, buildSystemPrompt
} from "./memoryManager.js";
import { form, input, renderMessages, addDebugMessage, setupScrollListener } from "./chatUI.js";
import { handleMemoryCommand } from "./chatMemory.js";

export function setupChatLogic() {
  const app = getDatabase();
  const auth = getAuth();
  let uid = null;
  let chatRef = null;

  setupScrollListener();

  onAuthStateChanged(auth, (user) => {
    if (!user) {
      signInAnonymously(auth);
      addDebugMessage("Signed in anonymously.");
      return;
    }

    uid = user.uid;
    chatRef = ref(app, `chatHistory/${uid}`);
    onValue(chatRef, (snapshot) => {
      const data = snapshot.val() || {};
      const allMessages = Object.entries(data).map(([id, msg]) => ({
        id,
        role: msg.role === "bot" ? "assistant" : msg.role,
        content: msg.content,
        timestamp: msg.timestamp || 0
      }));
      const messages = allMessages.sort((a, b) => a.timestamp - b.timestamp).slice(-20);
      renderMessages(messages);
    });
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const prompt = input.value.trim();
    if (!prompt || !chatRef || !uid) return;

    await push(chatRef, { role: "user", content: prompt, timestamp: Date.now() });
    input.value = "";

    const snapshot = await new Promise(resolve => onValue(chatRef, resolve, { onlyOnce: true }));
    const allMessages = Object.entries(snapshot.val() || {}).map(([id, msg]) => ({
      role: msg.role === "bot" ? "assistant" : msg.role,
      content: msg.content,
      timestamp: msg.timestamp || 0
    }));
    const messages = allMessages.sort((a, b) => a.timestamp - b.timestamp).slice(-20);

    const today = new Date().toISOString().slice(0, 10);
    const [memory, dayLog, notes, calendar, reminders, calc] = await Promise.all([
      getMemory(uid),
      getDayLog(uid, today),
      getNotes(uid),
      getCalendar(uid),
      getReminders(uid),
      getCalcHistory(uid)
    ]);

    const sysPrompt = buildSystemPrompt({
      memory, todayLog: dayLog, notes, calendar, reminders, calc, date: today
    });

    const full = [{ role: "system", content: sysPrompt }, ...messages];

    await handleMemoryCommand(prompt, uid, today, app);

    const replyRes = await fetch("/.netlify/functions/chatgpt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: full, model: "gpt-4o", temperature: 0.8 })
    });

    const replyData = await replyRes.json();
    const reply = replyData?.choices?.[0]?.message?.content || "[No reply]";
    await push(chatRef, { role: "assistant", content: reply, timestamp: Date.now() });
  });
}