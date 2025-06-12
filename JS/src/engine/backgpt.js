// backgpt.js – Full E2EE + GPT Context System

import { ref, push, get, child } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { db } from "../config/firebaseConfig.js";
import {
  getMemory,
  getDayLog,
  getNotes,
  getCalendar,
  getReminders,
  getCalcHistory
} from "./memoryManager.js";
import { extractJson, detectMemoryType } from "./chatUtils.js";
import {
  generateEntryId,
  summarizeForContext,
  categorizeMemory,
  extractTopic,
  autoTagMemory
} from "./chatUtils.js";
import { encryptText } from "./encrypt.js";

const todayStr = () => new Date().toISOString().slice(0, 10);
const ASSISTANT_MODEL = "gpt-4o";
const CHEAP_MODEL = "gpt-3.5-turbo";
const LOW_TEMP = 0.3;

// Save chat message
export async function saveMessageToChat(role, content, uid) {
  await push(ref(db, `chatHistory/${uid}`), {
    role,
    content,
    timestamp: Date.now()
  });
}

// Get last 20 messages
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

// Context: Summaries only
export async function getAllContext(uid) {
  const snap = await get(child(ref(db), `memorySummary/${uid}`));
  if (!snap.exists()) return {};
  return Object.values(snap.val())
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
    .map(entry => `(${entry.type}) ${entry.summary}`);
}

// GPT call
export async function getAssistantReply(fullMessages) {
  const res = await fetch("/.netlify/functions/chatgpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: fullMessages,
      model: ASSISTANT_MODEL,
      temperature: 0.8
    })
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "[No reply]";
}

// Memory extraction from prompt
export async function extractMemoryFromPrompt(prompt, uid) {
  const { memoryType, rawPrompt } = detectMemoryType(prompt);
  if (!memoryType) return null;

  const res = await fetch("/.netlify/functions/chatgpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: CHEAP_MODEL,
      temperature: LOW_TEMP,
      messages: [
        {
          role: "system",
          content: "Extract a single JSON: { type, content, date?, time?, recurrence? }"
        },
        { role: "user", content: memoryType.startsWith("/") ? rawPrompt : prompt }
      ]
    })
  });
  const parsed = extractJson(JSON.stringify(res));
  if (!parsed?.type || !parsed?.content) return null;

  const nodeMap = {
    calendar: `calendarEvents/${uid}`,
    reminder: `reminders/${uid}`,
    log: `dayLog/${uid}/${todayStr()}`,
    note: `notes/${uid}/${todayStr()}`
  };
  const path = nodeMap[parsed.type] || nodeMap.note;
  const entryId = generateEntryId();

  const fullObj = {
    content: parsed.content,
    ...(parsed.date && { date: parsed.date }),
    ...(parsed.time && { time: parsed.time }),
    ...(parsed.recurrence && { recurrence: parsed.recurrence })
  };

  const encrypted = await encryptText(JSON.stringify(fullObj));

  await push(ref(db, path), {
    id: entryId,
    encrypted,
    timestamp: Date.now()
  });

  await push(ref(db, `memorySummary/${uid}`), {
    id: entryId,
    type: parsed.type,
    summary: await summarizeForContext(parsed.content),
    category: categorizeMemory(parsed.content),
    topic: extractTopic(parsed.content),
    tags: autoTagMemory(parsed.content),
    linkedNode: path,
    timestamp: Date.now()
  });

  return parsed;
}

// Summarize chat every 20 messages
export async function summarizeChatIfNeeded(uid) {
  const snap = await get(child(ref(db), `chatHistory/${uid}`));
  if (!snap.exists()) return;

  const messages = Object.entries(snap.val())
    .map(([_, m]) => ({
      role: m.role === "bot" ? "assistant" : m.role,
      content: m.content,
      timestamp: m.timestamp || 0
    }))
    .sort((a, b) => a.timestamp - b.timestamp);

  if (messages.length % 20 !== 0) return;

  const block = messages.slice(-20).map(m => `${m.role}: ${m.content}`).join("\n");

  const res = await fetch("/.netlify/functions/chatgpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: CHEAP_MODEL,
      temperature: LOW_TEMP,
      messages: [
        { role: "system", content: "Summarize this block in one paragraph:" },
        { role: "user", content: block }
      ]
    })
  });
  const summaryData = await res.json();
  const summary = summaryData.choices?.[0]?.message?.content || "[No summary]";

  await push(ref(db, `memorySummary/${uid}`), {
    id: generateEntryId(),
    type: "chat",
    summary,
    category: "ai",
    topic: "conversation",
    tags: ["chat", "summary"],
    linkedNode: `chatHistory/${uid}`,
    timestamp: Date.now()
  });
}