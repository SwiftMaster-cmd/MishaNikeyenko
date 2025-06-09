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
  return { memory, dayLog, notes, calendar, reminders, calc };
}

// 🔹 4. Generate assistant reply via GPT
export async function getAssistantReply(fullMessages) {
  const res = await fetch("/.netlify/functions/chatgpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: fullMessages, model: "gpt-4o", temperature: 0.8 })
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "[No reply]";
}

// 🔹 5. Try to extract memory (note/reminder/calendar/log) or preferences from prompt
export async function extractMemoryFromPrompt(prompt, uid) {
  const today = todayStr();

  // -- Preference capture: "remember I like X", "I dislike Y", "I hate Z", etc.
  const prefMatch = prompt.match(
    /\b(?:remember(?: that)?\s*)?i\s+(like|love|prefer|dislike|hate)\s+(.+)/i
  );
  if (prefMatch) {
    const verb = prefMatch[1].toLowerCase();
    const value = prefMatch[2].trim();
    const content = `${verb} ${value}`;

    // Save under memory/{uid}/preferences/{verb}s
    await push(ref(db, `memory/${uid}/preferences/${verb}s`), {
      content,
      timestamp: Date.now()
    });

    return { type: "preference", key: `${verb}s`, content };
  }

  // -- Existing typed-memory extraction
  const { memoryType, rawPrompt } = detectMemoryType(prompt);
  if (!memoryType) return null;

  // Ask GPT to parse into structured JSON
  const res = await fetch("/.netlify/functions/chatgpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [
        {
          role: "system",
          content: `
You are a memory extraction engine. ALWAYS return exactly one JSON object with keys:
{
  "type":   "note" | "reminder" | "calendar" | "log",
  "content": "string",
  "date":   "optional YYYY-MM-DD"
}
Rules:
1. "/note" → type="note"
2. "/reminder" or "remind me" → type="reminder"
3. Mentions of date/time → type="calendar"
4. "/log" or "journal" → type="log"
5. Otherwise → type="note"
6. Include "date" only when explicit
Return ONLY the JSON.`
        },
        { role: "user", content: memoryType.startsWith("/") ? rawPrompt : prompt }
      ],
      model: "gpt-4o",
      temperature: 0.3
    })
  });

  const text = await res.text();
  const parsed = extractJson(text);
  if (!parsed?.type || !parsed?.content) return null;

  // Determine path
  let path;
  switch (parsed.type) {
    case "calendar":
      path = `calendarEvents/${uid}`;
      break;
    case "reminder":
      path = `reminders/${uid}`;
      break;
    case "log":
      path = `dayLog/${uid}/${today}`;
      break;
    default:
      path = `notes/${uid}/${today}`;
  }

  // Save the memory entry
  await push(ref(db, path), {
    content: parsed.content,
    timestamp: Date.now(),
    ...(parsed.date ? { date: parsed.date } : {})
  });

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
        {
          role: "system",
          content: `You are a concise summarizer. Summarize the following conversation block into one paragraph:`
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
}