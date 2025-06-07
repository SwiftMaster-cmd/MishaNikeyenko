// 🔹 backgpt.js – Assistant reply engine, memory context, Firebase logic

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

// 🔹 1. Save message to Firebase chat history
export async function saveMessageToChat(role, content, uid) {
  const chatRef = ref(db, `chatHistory/${uid}`);
  await push(chatRef, {
    role,
    content,
    timestamp: Date.now()
  });
}

// 🔹 2. Fetch last 20 messages
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

// 🔹 3. Gather full memory context
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

// 🔹 4. Send GPT request
export async function getAssistantReply(fullMessages) {
  const res = await fetch("/.netlify/functions/chatgpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: fullMessages,
      model: "gpt-4o",
      temperature: 0.7
    })
  });
  const data = await res.json();
  return data.reply || "[No reply]";
}

// 🔹 5. Extract memory (note, reminder, calendar, log)
export async function extractMemoryFromPrompt(prompt, uid) {
  const today = todayStr();
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
You are a memory extraction engine. Output one JSON object like this:
{
  "type":   "note" | "reminder" | "calendar" | "log",
  "content": "string",
  "date":   "optional YYYY-MM-DD"
}

RULES:
- /note → note
- /reminder, "remind me" → reminder
- Mentions of dates (e.g. tomorrow, on June 10) → calendar
- /log or "journal" → log
- Otherwise default to note.
Return ONLY the JSON block.
          `.trim()
        },
        { role: "user", content: rawPrompt }
      ],
      model: "gpt-4o",
      temperature: 0.3
    })
  });

  const rawText = await res.text();
  const parsed = extractJson(rawText);
  if (!parsed?.type || !parsed?.content) return null;

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

  return parsed;
}

// 🔹 6. Auto-summarize every 20 messages
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
      temperature: 0.4
    })
  });

  const dataJson = await res.json();
  const summary = dataJson.reply || "[No summary]";
  await push(ref(db, `memory/${uid}`), {
    summary,
    timestamp: Date.now()
  });
}

// 🔹 7. Summarize all node types (optional for debug panel)
export async function generateMemorySummaries(uid) {
  const today = todayStr();
  const paths = {
    Notes: `notes/${uid}/${today}`,
    Reminders: `reminders/${uid}`,
    Calendar: `calendarEvents/${uid}`,
    Logs: `dayLog/${uid}/${today}`,
    Memory: `memory/${uid}`
  };

  const summaries = [];

  for (const [label, path] of Object.entries(paths)) {
    try {
      const snap = await get(ref(db, path));
      if (!snap.exists()) {
        summaries.push(`[${label}] Empty`);
        continue;
      }

      const content = JSON.stringify(snap.val(), null, 2);
      const res = await fetch("/.netlify/functions/chatgpt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content: `Summarize this ${label} data in one sentence.`
            },
            {
              role: "user",
              content: content.slice(0, 2000) // Limit token size
            }
          ],
          model: "gpt-4o",
          temperature: 0.4
        })
      });

      const data = await res.json();
      summaries.push(`[${label}] ${data.reply || "No summary"}`);
    } catch (err) {
      summaries.push(`[${label}] Failed to summarize`);
    }
  }

  return summaries;
}