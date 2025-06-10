// backgpt.js – Handles memory, chat history, and GPT calls with explicit models

import { ref, push, get, child } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { db } from "./firebaseConfig.js";
import {
  getMemory,
  getDayLog,
  getNotes,
  getCalendar,
  getReminders,
  getCalcHistory
} from "./memoryManager.js";
import { extractJson, detectMemoryType } from "./chatUtils.js";
import { trackedChat } from "./tokenTracker.js";

const todayStr = () => new Date().toISOString().slice(0, 10);
const KEEP_COUNT = 10;
const MAX_SAVE_LEN = 2000;
const LONG_MSG_THRESH = 100;

// ─── Trimming ───────────────────────

function trimContent(s) {
  return s.length <= MAX_SAVE_LEN ? s : s.slice(0, MAX_SAVE_LEN) + "\n…[truncated]";
}

// ─── History Save / Fetch ───────────

export async function saveMessageToChat(role, content, uid) {
  await push(ref(db, `chatHistory/${uid}`), {
    role,
    content: trimContent(content),
    timestamp: Date.now()
  });
}

export async function fetchLast20Messages(uid) {
  const snap = await get(child(ref(db), `chatHistory/${uid}`));
  if (!snap.exists()) return [];

  const all = Object.entries(snap.val())
    .map(([_, m]) => ({
      role: m.role === "bot" ? "assistant" : m.role,
      content: m.content,
      timestamp: m.timestamp || 0
    }))
    .sort((a, b) => a.timestamp - b.timestamp);

  if (all.length <= KEEP_COUNT) return all;

  const older = all.slice(0, -KEEP_COUNT);
  const recent = all.slice(-KEEP_COUNT);
  const summary = await summarizeBlock(older);

  return [
    { role: "system", content: `Conversation so far:\n${summary}` },
    ...recent
  ];
}

// ─── Smart Context Fetch ────────────

export async function getRelevantContext(prompt, uid) {
  const res = await trackedChat("/.netlify/functions/chatgpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-3.5-turbo",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: `Given a user's prompt, return a JSON object with keys from this list if needed:
["memory", "dayLog", "notes", "calendar", "reminders", "calc"]
Return only what's relevant. Return only valid JSON.`
        },
        { role: "user", content: prompt }
      ]
    })
  });

  const parsed = extractJson(JSON.stringify(res.choices?.[0]?.message?.content || {}));
  return parsed || {};
}

export async function getSelectedContext(prompt, uid) {
  const keys = await getRelevantContext(prompt, uid);
  const today = todayStr();
  const ctx = {};

  const fetchers = {
    memory:    async () => (await getMemory(uid)).slice(-1),
    dayLog:    async () => (await getDayLog(uid, today)).slice?.(-1) || [],
    notes:     async () => (await getNotes(uid)).slice(-1),
    calendar:  async () => (await getCalendar(uid)).slice(-1),
    reminders: async () => (await getReminders(uid)).slice(-1),
    calc:      async () => (await getCalcHistory(uid)).slice(-1)
  };

  await Promise.all(Object.entries(keys).map(async ([key]) => {
    if (fetchers[key]) ctx[key] = await fetchers[key]();
  }));

  return ctx;
}

// ─── Final Assistant Reply ──────────

export async function getAssistantReply(messages) {
  const pruned = [];
  for (let m of messages) {
    if (m.role === "system" && m.content.length > LONG_MSG_THRESH) {
      const short = await summarizeText(m.content);
      pruned.push({ role: "system", content: short });
    } else {
      pruned.push(m);
    }
  }

  const res = await trackedChat("/.netlify/functions/chatgpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o",
      temperature: 0.8,
      messages: pruned
    })
  });

  return res.choices?.[0]?.message?.content || "[No reply]";
}

// ─── Summarization ─────────────────

async function summarizeBlock(block) {
  const res = await trackedChat("/.netlify/functions/chatgpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-3.5-turbo",
      temperature: 0.3,
      messages: [
        { role: "system", content: "Summarize this conversation in one short paragraph:" },
        { role: "user", content: block.map(m => `${m.role}: ${m.content}`).join("\n") }
      ]
    })
  });

  return res.choices?.[0]?.message?.content || "[summary failed]";
}

async function summarizeText(text) {
  const res = await trackedChat("/.netlify/functions/chatgpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-3.5-turbo",
      temperature: 0.3,
      messages: [
        { role: "system", content: "In one sentence, summarize the following context:" },
        { role: "user", content: text }
      ]
    })
  });

  return res.choices?.[0]?.message?.content || text.slice(0, LONG_MSG_THRESH) + "…";
}

// ─── Memory Extraction ─────────────

export async function extractMemoryFromPrompt(prompt, uid) {
  const today = todayStr();
  const { memoryType, rawPrompt } = detectMemoryType(prompt);
  if (!memoryType) return null;

  const res = await trackedChat("/.netlify/functions/chatgpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-3.5-turbo",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: `
You are a memory extraction engine. Return exactly one JSON object:
{ "type":"note"|"reminder"|"calendar"|"log", "content":"string",
  "date":"optional YYYY-MM-DD", "time":"optional HH:MM", "recurrence":"optional RRULE" }
Rules:
1. "/note" → note
2. "/reminder" or "remind me" → reminder
3. Date/time → calendar
4. "/log" or "journal" → log
5. Otherwise → note
Return ONLY JSON.`
        },
        { role: "user", content: memoryType.startsWith("/") ? rawPrompt : prompt }
      ]
    })
  });

  const parsed = extractJson(JSON.stringify(res.choices?.[0]?.message?.content ?? res.choices?.[0]));
  if (!parsed?.type || !parsed?.content) return null;

  let path;
  switch (parsed.type) {
    case "calendar": path = `calendarEvents/${uid}`; break;
    case "reminder": path = `reminders/${uid}`;      break;
    case "log":      path = `dayLog/${uid}/${today}`;break;
    default:         path = `notes/${uid}/${today}`; break;
  }

  await push(ref(db, path), {
    content: parsed.content,
    ...(parsed.date       ? { date: parsed.date }       : {}),
    ...(parsed.time       ? { time: parsed.time }       : {}),
    ...(parsed.recurrence ? { recurrence: parsed.recurrence } : {}),
    timestamp: Date.now()
  });

  return parsed;
}

// ─── Periodic Summary Save ─────────

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
  const summary = await summarizeBlock(all.slice(-20));
  await push(ref(db, `memory/${uid}`), { summary, timestamp: Date.now() });
}