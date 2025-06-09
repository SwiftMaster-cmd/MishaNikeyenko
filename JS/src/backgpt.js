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
  await push(chatRef, { role, content, timestamp: Date.now() });
}

// 🔹 2. Get last 20 messages from chatHistory
export async function fetchLast20Messages(uid) {
  const snap = await get(child(ref(db), `chatHistory/${uid}`));
  if (!snap.exists()) return [];
  return Object.entries(snap.val())
    .map(([_, m]) => ({
      role: m.role === "bot" ? "assistant" : m.role,
      content: m.content,
      timestamp: m.timestamp || 0
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

// 🔹 5. Extract memory from prompt (reminders, calendar, preferences, notes, logs)
export async function extractMemoryFromPrompt(prompt, uid) {
  const today = todayStr();

  // a) "I need X on DATE" or "Remember I need X on DATE" → calendar event
  const calMatch = prompt.match(
    /\b(?:remember(?: to)?\s*)?i need\s+(.+?)\s+on\s+(\d{4}-\d{2}-\d{2})\b/i
  );
  if (calMatch) {
    const content = calMatch[1].trim();
    const date = calMatch[2];
    await push(ref(db, `calendarEvents/${uid}`), { content, date, timestamp: Date.now() });
    return { type: "calendar", content, date };
  }

  // b) "I need X" or "Remember I need X" → reminder
  const remMatch = prompt.match(/\b(?:remember(?: to)?\s*)?i need\s+(.+)/i);
  if (remMatch) {
    const content = remMatch[1].trim();
    await push(ref(db, `reminders/${uid}`), { content, timestamp: Date.now() });
    return { type: "reminder", content };
  }

  // c) Preferences: like/love/prefer/dislike/hate
  const prefMatch = prompt.match(
    /\b(?:remember(?: that)?\s*)?i\s+(like|love|prefer|dislike|hate)\s+(.+)/i
  );
  if (prefMatch) {
    const verb = prefMatch[1].toLowerCase();
    const value = prefMatch[2].trim();
    const content = `${verb} ${value}`;
    await push(ref(db, `memory/${uid}/preferences/${verb}s`), {
      content,
      timestamp: Date.now()
    });
    return { type: "preference", key: `${verb}s`, content };
  }

  // d) Structured note/reminder/calendar/log via GPT
  const { memoryType, rawPrompt } = detectMemoryType(prompt);
  if (!memoryType) return null;

  const res = await fetch("/.netlify/functions/chatgpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [
        {
          role: "system",
          content: `
You are a memory extraction engine. RETURN exactly one JSON object:
{
  "type": "note" | "reminder" | "calendar" | "log",
  "content": "string",
  "date": "optional YYYY-MM-DD"
}
Rules:
1. "/note" → note
2. "/reminder" or "remind me" → reminder
3. Mentions of date/time → calendar
4. "/log" or "journal" → log
5. Otherwise → note
6. Include "date" only when explicit
Return ONLY the JSON object.`
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

  await push(ref(db, path), {
    content: parsed.content,
    timestamp: Date.now(),
    ...(parsed.date ? { date: parsed.date } : {})
  });
  return parsed;
}

// 🔹 6. Summarize every 20 messages
export async function summarizeChatIfNeeded(uid) {
  const snap = await get(child(ref(db), `chatHistory/${uid}`));
  if (!snap.exists()) return;

  const all = Object.entries(snap.val())
    .map(([_, m]) => ({
      role: m.role === "bot" ? "assistant" : m.role,
      content: m.content,
      timestamp: m.timestamp || 0
    }))
    .sort((a, b) => a.timestamp - b.timestamp);

  if (all.length % 20 !== 0) return;

  const block = all.slice(-20).map(m => `${m.role}: ${m.content}`).join("\n");
  const res = await fetch("/.netlify/functions/chatgpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [
        { role: "system", content: "Summarize this block in one paragraph:" },
        { role: "user", content: block }
      ],
      model: "gpt-4o",
      temperature: 0.5
    })
  });
  const data = await res.json();
  const summary = data.choices?.[0]?.message?.content || "[No summary]";
  await push(ref(db, `memory/${uid}`), { summary, timestamp: Date.now() });
}