// 🔹 chat.js – intelligent chat system using memoryManager.js
import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, push, onValue
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  getMemory, getDayLog, getNotes, getCalendar,
  getReminders, getCalcHistory, updateDayLog,
  buildSystemPrompt
} from "./memoryManager.js";

// 🔐 Firebase Config
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

// 💬 DOM Elements
const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const log = document.getElementById("chat-log");

let uid = null;
let chatRef = null;

function scrollToBottom() {
  requestAnimationFrame(() => {
    log.scrollTop = log.scrollHeight;
  });
}

function addMessage(role, content) {
  const div = document.createElement("div");
  div.className = `msg ${role === "user" ? "user-msg" : "bot-msg"}`;
  div.textContent = content;
  log.appendChild(div);
  scrollToBottom();
}

function extractJson(raw) {
  if (!raw) return null;
  const cleaned = raw
    .replace(/```json\s*/gi, "")
    .replace(/```/g, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

// 👤 Firebase Auth
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    signInAnonymously(auth);
    return;
  }

  uid = user.uid;
  chatRef = ref(db, `chatHistory/${uid}`);

  onValue(chatRef, (snapshot) => {
    const data = snapshot.val() || {};
    const msgs = Object.values(data).sort((a, b) => a.timestamp - b.timestamp);
    log.innerHTML = "";
    msgs.slice(-20).forEach(msg => addMessage(msg.role, msg.content));
  });
});

// 📩 Message Submission
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt || !uid || !chatRef) return;

  input.value = "";
  await push(chatRef, { role: "user", content: prompt, timestamp: Date.now() });

  const today = new Date().toISOString().split('T')[0];
  const [memory, dayLog, notes, calendar, reminders, calc] = await Promise.all([
    getMemory(uid), getDayLog(uid, today), getNotes(uid),
    getCalendar(uid), getReminders(uid), getCalcHistory(uid)
  ]);

  const sysPrompt = buildSystemPrompt({
    memory, todayLog: dayLog, notes, calendar, reminders, calc, date: today
  });

  const historySnap = await new Promise(resolve => onValue(chatRef, resolve, { onlyOnce: true }));
  const messages = Object.values(historySnap.val() || {})
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-20)
    .map(msg => ({ role: msg.role, content: msg.content }));

  const fullMessages = [{ role: "system", content: sysPrompt }, ...messages];

  const cmd = prompt.toLowerCase().trim();
  const isCommand = cmd.startsWith("/note ") || cmd.startsWith("/calendar ") ||
                    cmd.startsWith("/reminder ") || cmd.startsWith("/log ");

  if (isCommand) {
    const raw = prompt.replace(/^\/(note|calendar|reminder|log)\s*/i, "").trim();

    const res = await fetch("/.netlify/functions/chatgpt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content: `Extract this memory command to JSON:
\`\`\`json
{
  "type": "note | calendar | reminder | log",
  "content": "string",
  "date": "optional YYYY-MM-DD"
}
\`\`\`
Only return JSON.`
          },
          { role: "user", content: raw }
        ],
        model: "gpt-4o", temperature: 0.2
      })
    });

    const text = await res.text();
    const json = extractJson(text);

    if (json?.type && json?.content) {
      const date = json.date || today;
      const path =
        json.type === "note" ? `notes/${uid}/${date}` :
        json.type === "calendar" ? `calendarEvents/${uid}` :
        json.type === "reminder" ? `reminders/${uid}` :
        json.type === "log" ? `dayLog/${uid}/${date}` :
        null;

      if (path) {
        await push(ref(db, path), {
          content: json.content,
          timestamp: Date.now(),
          ...(json.date ? { date: json.date } : {})
        });
        addMessage("bot", `✅ ${json.type} saved.`);
      } else {
        addMessage("bot", "❌ Unknown type.");
      }
    } else {
      addMessage("bot", "❌ Could not parse command.");
    }
  }

  // 🤖 Get assistant reply
  const reply = await fetch("/.netlify/functions/chatgpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: fullMessages,
      model: "gpt-4o",
      temperature: 0.7
    })
  });

  const data = await reply.json();
  const content = data?.choices?.[0]?.message?.content || "[No reply]";
  await push(chatRef, { role: "assistant", content, timestamp: Date.now() });
});