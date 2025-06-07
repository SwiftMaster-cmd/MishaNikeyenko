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

// 🔹 1. Save message
export async function saveMessageToChat(role, content, uid) {
  const chatRef = ref(db, `chatHistory/${uid}`);
  await push(chatRef, {
    role,
    content,
    timestamp: Date.now()
  });
  window.debug(`[SAVE] ${role}: ${content}`);
}

// 🔹 2. Load last 20 messages
export async function fetchLast20Messages(uid) {
  const snap = await get(child(ref(db), `chatHistory/${uid}`));
  if (!snap.exists()) return [];
  const data = snap.val();
  return Object.entries(data)
    .map(([_, msg]) => ({
      role: msg.role === "bot" ? "assistant" : msg.role,
      content: msg.content,
      timestamp: msg.timestamp || 0
    }))
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-20);
}

// 🔹 3. Gather full context
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
  window.debug("[CONTEXT] Loaded all memory types");
  return { memory, dayLog, notes, calendar, reminders, calc };
}

// 🔹 4. GPT reply
export async function getAssistantReply(fullMessages) {
  window.debug("[GPT] Requesting reply...");
  const res = await fetch("/.netlify/functions/chatgpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: fullMessages, model: "gpt-4o", temperature: 0.8 })
  });

  const data = await res.json();
  const reply = data.choices?.[0]?.message?.content || "[No reply]";
  window.debug("[GPT] Reply received");
  return reply;
}

// 🔹 5. Memory extraction
export async function extractMemoryFromPrompt(prompt, uid) {
  const today = todayStr();
  const { memoryType, rawPrompt } = detectMemoryType(prompt);

  if (!memoryType) {
    window.debug("[MEMORY] No memory type detected");
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
You are a memory extraction engine. ALWAYS return one JSON object with these keys:
{
  "type": "note" | "reminder" | "calendar" | "log",
  "content": "string",
  "date": "optional YYYY-MM-DD"
}

Rules:
1. If starts with "/note", type = "note"
2. If starts with "/reminder" or "remind me", type = "reminder"
3. If mentions future date, type = "calendar"
4. If starts with "/log" or mentions journaling, type = "log"
5. Else default to "note"
Only return the JSON block.`
        },
        { role: "user", content: memoryType.startsWith("/") ? rawPrompt : prompt }
      ],
      model: "gpt-4o",
      temperature: 0.3
    })
  });

  const text = await res.text();
  const parsed = extractJson(text);
  if (!parsed?.type || !parsed?.content) {
    window.debug("[MEMORY] Extraction failed", text);
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

  window.debug(`[MEMORY] Saved ${parsed.type}: ${parsed.content}`);
  return parsed;
}

// 🔹 6. Periodic summarizer
export async function summarizeChatIfNeeded(uid) {
  const snap = await get(child(ref(db), `chatHistory/${uid}`));
  if (!snap.exists()) return;

  const data = snap.val();
  const allMessages = Object.entries(data)
    .map(([_, msg]) => ({
      role: msg.role === "bot" ? "assistant" : msg.role,
      content: msg.content,
      timestamp: msg.timestamp || 0
    }))
    .sort((a, b) => a.timestamp - b.timestamp);

  if (allMessages.length % 20 !== 0) return;

  const convoText = allMessages
    .slice(-20)
    .map(m => `${m.role === "assistant" ? "Assistant" : "User"}: ${m.content}`)
    .join("\n");

  const res = await fetch("/.netlify/functions/chatgpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [
        { role: "system", content: "You are a concise summarizer. Summarize the conversation:" },
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

  window.debug("[MEMORY] Summary saved");
}