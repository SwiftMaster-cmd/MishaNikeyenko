// 🔹 chat.js – dual‐mode memory saving + persistent storage status
import {
  ref,
  push,
  set,
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
import {
  getMemory,
  getDayLog,
  getNotes,
  getCalendar,
  getReminders,
  getCalcHistory,
  buildSystemPrompt
} from "./memoryManager.js";
import {
  handleStaticCommand,
  listNotes,
  listReminders,
  listEvents
} from "./commandHandlers.js";
import { extractJson, detectMemoryType } from "./chatUtils.js";

const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const log = document.getElementById("chat-log");

let uid = null;
let chatRef = null;
let userHasScrolled = false;

function addDebugMessage(text) {
  const div = document.createElement("div");
  div.className = "msg debug-msg";
  div.textContent = `[DEBUG] ${text}`;
  log.appendChild(div);
  scrollToBottom(true);
}

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

function renderMessages(messages) {
  log.innerHTML = "";
  messages
    .sort((a, b) => a.timestamp - b.timestamp)
    .forEach((msg) => {
      const role = msg.role === "bot" ? "assistant" : msg.role;
      const div = document.createElement("div");
      div.className = `msg ${
        role === "user" ? "user-msg" :
        role === "assistant" ? "bot-msg" :
        "debug-msg"
      }`;
      div.textContent = msg.content;
      log.appendChild(div);
    });
  scrollToBottom();
}

onAuthStateChanged(auth, (user) => {
  if (!user) {
    signInAnonymously(auth);
    addDebugMessage("Signed in anonymously.");
    return;
  }
  uid = user.uid;
  chatRef = ref(db, `chatHistory/${uid}`);

  onValue(chatRef, (snapshot) => {
    const data = snapshot.val() || {};
    const allMessages = Object.entries(data).map(([id, msg]) => ({
      id,
      role: msg.role === "bot" ? "assistant" : msg.role,
      content: msg.content,
      timestamp: msg.timestamp || 0
    }));
    const messages = allMessages
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-20);
    renderMessages(messages);
  });
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt || !chatRef || !uid) return;
  const today = new Date().toISOString().slice(0, 10);
  input.value = "";

  // ── Static & Listing Commands ──
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

  // ── Default chat + memory logic ──
  await push(chatRef, { role: "user", content: prompt, timestamp: Date.now() });

  // 1) Fetch last 20 messages
  let messages = [];
  try {
    const snap = await get(child(ref(db), `chatHistory/${uid}`));
    const data = snap.exists() ? snap.val() : {};
    const allMessages = Object.entries(data).map(([id, msg]) => ({
      role: msg.role === "bot" ? "assistant" : msg.role,
      content: msg.content,
      timestamp: msg.timestamp || 0
    }));
    messages = allMessages
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-20);
  } catch (err) {
    addDebugMessage("❌ Error fetching chat history: " + err.message);
  }

  // 2) Fetch memory/context
  const [memory, dayLog, notes, calendar, reminders, calc] = await Promise.all([
    getMemory(uid),
    getDayLog(uid, today),
    getNotes(uid),
    getCalendar(uid),
    getReminders(uid),
    getCalcHistory(uid)
  ]);

  // 3) Build system prompt
  const sysPrompt = buildSystemPrompt({
    memory,
    todayLog: dayLog,
    notes,
    calendar,
    reminders,
    calc,
    date: today
  });
  const full = [{ role: "system", content: sysPrompt }, ...messages];

  // 4) Memory‐type detection & storage write
  const { memoryType, rawPrompt } = detectMemoryType(prompt);
  if (memoryType) {
    let extractedData = null;
    try {
      const res = await fetch("/.netlify/functions/chatgpt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content: `
You are a memory extraction engine. ALWAYS return exactly one JSON object with these keys:
{
  "type":   "note" | "reminder" | "calendar" | "log",
  "content": "string",
  "date":   "optional YYYY-MM-DD"
}

RULES:
1. If text begins with "/note", type="note".
2. If it begins with "/reminder" or "remind me", type="reminder".
3. If it mentions a specific date/time (e.g. "tomorrow", "Friday at 3pm", "on 2025-06-10"), type="calendar".
4. If it begins with "/log" or includes "journaled", "logged", type="log".
5. Otherwise, type="note" only as last resort.
6. Populate "date" only when user explicitly gives it.
7. Do NOT append any closing lines like "If you need more information or assistance...".
8. Return ONLY the JSON block.`
            },
            { role: "user", content: memoryType.startsWith("/") ? rawPrompt : prompt }
          ],
          model: "gpt-4o",
          temperature: 0.3
        })
      });
      const raw = await res.text();
      const parsed = JSON.parse(raw);
      const extracted = parsed.choices?.[0]?.message?.content || "";
      extractedData = extractJson(extracted);
    } catch (err) {
      console.warn("[PARSE FAIL]", err);
      addDebugMessage("❌ JSON parse error (memory).");
    }

    if (extractedData?.type && extractedData?.content) {
      try {
        const path =
          extractedData.type === "calendar"
            ? `calendarEvents/${uid}`
            : extractedData.type === "reminder"
            ? `reminders/${uid}`
            : extractedData.type === "log"
            ? `dayLog/${uid}/${today}`
            : `notes/${uid}/${today}`;
        const entry = {
          content: extractedData.content,
          timestamp: Date.now(),
          ...(extractedData.date ? { date: extractedData.date } : {})
        };
        await push(ref(db, path), entry);
        addDebugMessage(`✅ Memory added to /${extractedData.type}`);
      } catch (err) {
        addDebugMessage("❌ Firebase write failed: " + err.message);
      }
    } else {
      addDebugMessage("⚠️ GPT returned incomplete memory structure.");
    }
  } else {
    addDebugMessage("🔕 No valid memory trigger.");
  }

  // 5) Fetch storage counts and display status text
  try {
    // a) Notes (today)
    const notesSnap = await get(child(ref(db), `notes/${uid}/${today}`));
    const notesCount = notesSnap.exists() ? Object.keys(notesSnap.val()).length : 0;

    // b) Reminders (all)
    const remSnap = await get(child(ref(db), `reminders/${uid}`));
    const remCount = remSnap.exists() ? Object.keys(remSnap.val()).length : 0;

    // c) Events (all)
    const evSnap = await get(child(ref(db), `calendarEvents/${uid}`));
    const evCount = evSnap.exists() ? Object.keys(evSnap.val()).length : 0;

    // d) Memory entries (all)
    const memSnap = await get(child(ref(db), `memory/${uid}`));
    const memCount = memSnap.exists() ? Object.keys(memSnap.val()).length : 0;

    const statusText = `📦 Storage: Notes(today)=${notesCount} | Reminders=${remCount} | Events=${evCount} | Memory=${memCount}`;
    await push(chatRef, { role: "assistant", content: statusText, timestamp: Date.now() });
  } catch (err) {
    addDebugMessage("❌ Error fetching storage counts: " + err.message);
  }

  // 6) Assistant reply
  let reply = "[No reply]";
  try {
    const replyRes = await fetch("/.netlify/functions/chatgpt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: full, model: "gpt-4o", temperature: 0.8 })
    });
    const replyData = await replyRes.json();
    reply = replyData.choices?.[0]?.message?.content || reply;
  } catch (err) {
    addDebugMessage("❌ Error getting GPT reply: " + err.message);
  }

  await push(chatRef, { role: "assistant", content: reply, timestamp: Date.now() });
});