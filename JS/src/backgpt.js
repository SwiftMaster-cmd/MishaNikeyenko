// 🔹 backgpt.js – Handles assistant replies, memory context, saving, summaries

import { ref, push, get, child } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { db } from "./firebaseConfig.js";
import {
  getMemory,
  getDayLog,
  getNotes,
  getCalendar,
  getReminders,
  getCalcHistory,
  buildSystemPrompt
} from "./memoryManager.js";
import { extractJson, detectMemoryType } from "./chatUtils.js";

const todayStr = () => new Date().toISOString().slice(0, 10);

// 🔹 1. Save a message to Firebase
export async function saveMessageToChat(role, content, uid) {
  window.debug(`[SUBMIT] ${role.toUpperCase()}: ${content}`);
  const chatRef = ref(db, `chatHistory/${uid}`);
  await push(chatRef, {
    role,
    content,
    timestamp: Date.now()
  });
}

// 🔹 2. Get last 20 messages from chatHistory
export async function fetchLast20Messages(uid) {
  const snap = await get(child(ref(db), `chatHistory/${uid}`));
  if (!snap.exists()) return [];
  const data = snap.val();
  return Object.entries(data)
    .map(([id, msg]) => ({
      role: msg.role === "bot" ? "assistant" : msg.role,
      content: msg.content,
      timestamp: msg.timestamp || 0
    }))
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-20);
}

// 🔹 3. Fetch all contextual memory
export async function getAllContext(uid) {
  const today = todayStr();
  const [memory, dayLog, notes, calendar, reminders, calc] = await Promise.all([
    getMemory(uid),
    getDayLog(uid, today),
    getNotes(uid),
    getCalendar(uid),
    getReminders(uid),
    getCalcHistory(uid)
  ]);
  window.debug("[INFO] Context loaded.");
  return { memory, dayLog, notes, calendar, reminders, calc };
}

// 🔹 4. Generate assistant reply via GPT
export async function getAssistantReply(fullMessages) {
  window.debug("[INFO] Sending prompt to GPT...");

  const res = await fetch("/.netlify/functions/chatgpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: fullMessages, model: "gpt-4o", temperature: 0.8 })
  });

  const data = await res.json();
  const reply = data.choices?.[0]?.message?.content || "[No reply]";

  window.debug("[REPLY]", reply);
  return reply;
}

// 🔹 5. Try to extract memory (note/reminder/calendar/log) from prompt
export async function extractMemoryFromPrompt(prompt, uid) {
  const today = todayStr();
  const { memoryType, rawPrompt } = detectMemoryType(prompt);
  if (!memoryType) {
    window.debug("[MEMORY] No memory type detected.");
    return null;
  }

  const res = await fetch("/.netlify/functions/chatgpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [
        {
          role: "system",
          content: `
You are a memory extraction engine. Return ONLY and EXACTLY one valid JSON object, nothing else.

{
  "type":   "note" | "reminder" | "calendar" | "log",
  "content": "string",
  "date":   "optional YYYY-MM-DD"
}

NO extra text, markdown, or explanation.

Rules:
1. If text begins with "/note", type="note".
2. If it begins with "/reminder" or "remind me", type="reminder".
3. If it mentions a date/time (e.g. "tomorrow", "Friday", "on 2025-06-10"), type="calendar".
4. If it begins with "/log" or includes "journal", type="log".
5. Otherwise, type="note" as a last resort.
6. Populate "date" only if given.
7. Output ONLY a valid JSON object, nothing else.
`
        },
        { role: "user", content: memoryType.startsWith("/") ? rawPrompt : prompt }
      ],
      model: "gpt-4o",
      temperature: 0
    })
  });

  const text = await res.text();
  window.debug("[MEMORY RAW RESPONSE]", text);

  const parsed = extractJson(text);
  if (!parsed?.type || !parsed?.content) {
    window.debug("[ERROR] Memory extraction failed.", { prompt, text, parsed });
    return null;
  }

  const path =
    parsed.type === "calendar"
      ? `calendarEvents/${uid}`
      : parsed.type === "reminder"
      ? `reminders/${uid}`
      : parsed.type === "log"
      ? `dayLog/${uid}/${today}`
      : `notes/${uid}/${today}`;

  await push(ref(db, path), {
    content: parsed.content,
    timestamp: Date.now(),
    ...(parsed.date ? { date: parsed.date } : {})
  });

  window.debug(`[MEMORY] Stored ${parsed.type}: ${parsed.content}`);
  return parsed;
}

// 🔹 6. Run summary if message count % 20 === 0
export async function summarizeChatIfNeeded(uid) {
  const snap = await get(child(ref(db), `chatHistory/${uid}`));
  if (!snap.exists()) return;

  const data = snap.val();
  const allMessages = Object.entries(data)
    .map(([id, msg]) => ({
      role: msg.role === "bot" ? "assistant" : msg.role,
      content: msg.content,
      timestamp: msg.timestamp || 0
    }))
    .sort((a, b) => a.timestamp - b.timestamp);

  const count = allMessages.length;
  if (count % 20 !== 0) return;

  const convoText = allMessages
    .slice(-20)
    .map(m => `${m.role === "assistant" ? "Assistant" : "User"}: ${m.content}`)
    .join("\n");

  const res = await fetch("/.netlify/functions/chatgpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [
        {
          role: "system",
          content: "You are a concise summarizer. Summarize the following conversation block into one paragraph:"
        },
        { role: "user", content: convoText }
      ],
      model: "gpt-4o",
      temperature: 0.5
    })
  });

  const dataJson = await res.json();
  const summary = dataJson.choices?.[0]?.message?.content || "[No summary]";
  await push(ref(db, `memory/${uid}`), {
    summary,
    timestamp: Date.now()
  });

  window.debug("[MEMORY] Summary added to memory.");
}