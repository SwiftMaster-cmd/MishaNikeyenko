// 🔹 backgpt.js – Assistant replies, context fetching, GPT summaries, and Firebase log writes

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

// 🔹 Firebase Debug Logger
async function debugLogToFirebase(uid, tag, content) {
  if (!uid || !content) return;
  await push(ref(db, `debugLogs/${uid}`), {
    tag,
    content,
    timestamp: Date.now()
  });
}

// 🔹 1. Save a message to chat
export async function saveMessageToChat(role, content, uid) {
  const chatRef = ref(db, `chatHistory/${uid}`);
  await push(chatRef, { role, content, timestamp: Date.now() });
}

// 🔹 2. Get last 20 messages
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

// 🔹 3. Get all context + summary logging
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

  const contextNodes = {
    memory,
    dayLog,
    notes,
    calendar,
    reminders,
    calc
  };

  for (const [key, data] of Object.entries(contextNodes)) {
    const summary = await summarizeOneNode(uid, key, data);
    if (summary) await debugLogToFirebase(uid, "MEMORY", `[${key}] ${summary}`);
  }

  return contextNodes;
}

// 🔹 4. Summarize one context node
async function summarizeOneNode(uid, label, data) {
  try {
    const response = await fetch("/.netlify/functions/chatgpt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content: `You are a summarizer. Summarize the following JSON into a single line that describes its overall content.`
          },
          {
            role: "user",
            content: JSON.stringify(data).slice(0, 6000) // truncate large objects
          }
        ]
      })
    });

    const result = await response.json();
    return result.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.error("Summary error:", err);
    return null;
  }
}

// 🔹 5. Get assistant reply from GPT
export async function getAssistantReply(fullMessages) {
  const res = await fetch("/.netlify/functions/chatgpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: fullMessages, model: "gpt-4o", temperature: 0.8 })
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "[No reply]";
}

// 🔹 6. Extract structured memory
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
You are a memory extraction engine. ALWAYS return exactly one JSON object:
{
  "type": "note" | "reminder" | "calendar" | "log",
  "content": "string",
  "date": "optional YYYY-MM-DD"
}`
        },
        {
          role: "user",
          content: memoryType.startsWith("/") ? rawPrompt : prompt
        }
      ],
      model: "gpt-4o",
      temperature: 0.3
    })
  });

  const text = await res.text();
  const parsed = extractJson(text);
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

  await debugLogToFirebase(uid, "MEMORY", `[EXTRACTED ${parsed.type.toUpperCase()}] ${parsed.content}`);
  return parsed;
}

// 🔹 7. Auto-summarize chat every 20 messages
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
          content: "Summarize this conversation block into a concise paragraph."
        },
        { role: "user", content: convoText }
      ],
      model: "gpt-4o",
      temperature: 0.5
    })
  });

  const result = await res.json();
  const summary = result.choices?.[0]?.message?.content || "[No summary]";
  await push(ref(db, `memory/${uid}`), {
    summary,
    timestamp: Date.now()
  });

  await debugLogToFirebase(uid, "SUMMARY", summary);
}