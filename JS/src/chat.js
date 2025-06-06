// 🔹 chat.js – auto-summarize last 20 messages into memory (non-blocking)
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

  // Whenever chatHistory changes, re-render last 20 for the UI
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
    renderMessages(last20);
  });
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt || !chatRef || !uid) return;
  input.value = "";

  // ── Handle static or list commands immediately ──
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

  // ── 1) Push the user message ──
  const now = Date.now();
  await push(chatRef, { role: "user", content: prompt, timestamp: now });

  // ── 2) Immediately fire off assistant reply & memory logic in parallel ──
  //    (so the UI doesn’t wait for summarization)

  // 2a) Build the "assistant reply" flow (unaffected by summary)
  (async () => {
    const today = new Date().toISOString().slice(0, 10);

    // Fetch last 20 messages for context
    let last20 = [];
    try {
      const snap = await get(child(ref(db), `chatHistory/${uid}`));
      const data = snap.exists() ? snap.val() : {};
      const allMessages = Object.entries(data).map(([id, msg]) => ({
        role: msg.role === "bot" ? "assistant" : msg.role,
        content: msg.content,
        timestamp: msg.timestamp || 0
      }));
      last20 = allMessages
        .sort((a, b) => a.timestamp - b.timestamp)
        .slice(-20);
    } catch (err) {
      addDebugMessage("❌ Error fetching last 20 for reply: " + err.message);
    }

    // Fetch memory/context slices
    const [memory, dayLog, notes, calendar, reminders, calc] = await Promise.all([
      getMemory(uid),
      getDayLog(uid, today),
      getNotes(uid),
      getCalendar(uid),
      getReminders(uid),
      getCalcHistory(uid)
    ]);

    // Build system + conversation for assistant reply
    const sysPrompt = buildSystemPrompt({
      memory,
      todayLog: dayLog,
      notes,
      calendar,
      reminders,
      calc,
      date: today
    });
    const full = [{ role: "system", content: sysPrompt }, ...last20];

    // Check for any "memory‐type" (notes, reminders, etc.), write to those nodes
    const { memoryType, rawPrompt } = detectMemoryType(prompt);
    if (memoryType) {
      try {
        const parsed = await fetch("/.netlify/functions/chatgpt", {
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
3. If it mentions a date/time (e.g. "tomorrow", "Friday", "on 2025-06-10"), type="calendar".
4. If it begins with "/log" or includes "journal", type="log".
5. Otherwise, type="note" as a last resort.
6. Populate "date" only when explicitly given.
7. Return ONLY the JSON block.`
              },
              { role: "user", content: memoryType.startsWith("/") ? rawPrompt : prompt }
            ],
            model: "gpt-4o",
            temperature: 0.3
          })
        });
        const text = await parsed.text();
        const parsedJSON = JSON.parse(text);
        const extracted = extractJson(parsedJSON.choices?.[0]?.message?.content || "");
        if (extracted?.type && extracted?.content) {
          const path =
            extracted.type === "calendar"
              ? `calendarEvents/${uid}`
              : extracted.type === "reminder"
              ? `reminders/${uid}`
              : extracted.type === "log"
              ? `dayLog/${uid}/${today}`
              : `notes/${uid}/${today}`;
          await push(ref(db, path), {
            content: extracted.content,
            timestamp: Date.now(),
            ...(extracted.date ? { date: extracted.date } : {})
          });
          addDebugMessage(`✅ Memory ${extracted.type} saved`);
        } else {
          addDebugMessage("⚠️ Incomplete memory structure");
        }
      } catch (err) {
        addDebugMessage("❌ Memory parse/write failed: " + err.message);
      }
    }

    // 2b) Now ask GPT for the assistant's response
    let assistantReply = "[No reply]";
    try {
      const replyRes = await fetch("/.netlify/functions/chatgpt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: full, model: "gpt-4o", temperature: 0.8 })
      });
      const replyData = await replyRes.json();
      assistantReply = replyData.choices?.[0]?.message?.content || assistantReply;
    } catch (err) {
      addDebugMessage("❌ GPT reply error: " + err.message);
    }

    // Finally push the assistant’s actual reply to chatHistory
    await push(chatRef, { role: "assistant", content: assistantReply, timestamp: Date.now() });
  })();

  // ── 3) In parallel: if this is the Nth (20th, 40th, etc.) message, create & save a summary ──
  (async () => {
    // Fetch total number of chatHistory entries
    let allCount = 0;
    let last20ForSummary = [];
    try {
      const snap = await get(child(ref(db), `chatHistory/${uid}`));
      const data = snap.exists() ? snap.val() : {};
      allCount = Object.keys(data).length;
      const allMessages = Object.entries(data).map(([id, msg]) => ({
        role: msg.role === "bot" ? "assistant" : msg.role,
        content: msg.content,
        timestamp: msg.timestamp || 0
      }));
      last20ForSummary = allMessages
        .sort((a, b) => a.timestamp - b.timestamp)
        .slice(-20);
    } catch (err) {
      addDebugMessage("❌ Error fetching chatHistory for summary: " + err.message);
      return;
    }

    // Only trigger when total count is a multiple of 20
    if (allCount > 0 && allCount % 20 === 0) {
      // Construct a simple "conversation text" of those 20 messages
      const convoText = last20ForSummary
        .map(m => `${m.role === "assistant" ? "Assistant" : "User"}: ${m.content}`)
        .join("\n");

      try {
        // Ask GPT to summarize those 20 lines
        const summaryRes = await fetch("/.netlify/functions/chatgpt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [
              {
                role: "system",
                content: `You are a concise summarizer. Summarize the next conversation block into one paragraph:`
              },
              { role: "user", content: convoText }
            ],
            model: "gpt-4o",
            temperature: 0.5
          })
        });
        const summaryJson = await summaryRes.json();
        const summary = summaryJson.choices?.[0]?.message?.content || "[No summary]";
        // Save that summary under memory/{uid}
        await push(ref(db, `memory/${uid}`), {
          summary,
          timestamp: Date.now()
        });
        addDebugMessage(`🗄️ 20-msg summary saved to memory`);
      } catch (err) {
        addDebugMessage("❌ Summary generation failed: " + err.message);
      }
    }
  })();
});