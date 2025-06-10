// 🔹 backgpt.js – Token-savvy pruning and summarization before sending to GPT

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

const todayStr         = () => new Date().toISOString().slice(0, 10);
const ASSISTANT_MODEL  = "gpt-4o";          // for final replies
const CHEAP_MODEL      = "gpt-3.5-turbo";   // for extraction & summarization
const LOW_TEMP         = 0.3;
const KEEP_COUNT       = 10;                // how many raw messages to keep
const MAX_SAVE_LEN     = 2000;              // hard cap on saved text
const LONG_MSG_THRESH  = 100;               // threshold to trigger summarization

// ─── Helpers ────────────────────────────────────────────

// Truncate any message over MAX_SAVE_LEN
function trimContent(s) {
  if (s.length <= MAX_SAVE_LEN) return s;
  return s.slice(0, MAX_SAVE_LEN) + "\n…[truncated]";
}

// Summarize a block of messages (used for history pruning)
async function summarizeBlock(block) {
  const res = await fetch("/.netlify/functions/chatgpt", {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({
      model: CHEAP_MODEL,
      temperature: LOW_TEMP,
      messages: [
        { role: "system", content: "Summarize this conversation in one short paragraph:" },
        { role: "user",   content: block.map(m => `${m.role}: ${m.content}`).join("\n") }
      ]
    })
  });
  const data = await res.json();
  if (data.usage && window.debugLog) {
    const { prompt_tokens, completion_tokens, total_tokens } = data.usage;
    window.debugLog(`[USAGE][HistorySummary] prompt:${prompt_tokens} completion:${completion_tokens} total:${total_tokens}`);
  }
  return data.choices?.[0]?.message?.content || "[…summary failed]";
}

// Summarize a single long message into one sentence
async function summarizeText(text) {
  const res = await fetch("/.netlify/functions/chatgpt", {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({
      model: CHEAP_MODEL,
      temperature: LOW_TEMP,
      messages: [
        { role: "system", content: "In one sentence, summarize the following message:" },
        { role: "user",   content: text }
      ]
    })
  });
  const data = await res.json();
  if (data.usage && window.debugLog) {
    const { prompt_tokens, completion_tokens, total_tokens } = data.usage;
    window.debugLog(`[USAGE][SummarizeMsg] prompt:${prompt_tokens} completion:${completion_tokens} total:${total_tokens}`);
  }
  return data.choices?.[0]?.message?.content || text.slice(0, LONG_MSG_THRESH) + "…";
}

// ─── 1. Save a message to Firebase ───────────────────────
export async function saveMessageToChat(role, content, uid) {
  await push(ref(db, `chatHistory/${uid}`), {
    role,
    content: trimContent(content),
    timestamp: Date.now()
  });
}

// ─── 2. Fetch pruned history ─────────────────────────────
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

  const older = all.slice(0, all.length - KEEP_COUNT);
  const recent = all.slice(-KEEP_COUNT);
  const summary = await summarizeBlock(older);

  return [
    { role: "system", content: `Conversation so far:\n${summary}` },
    ...recent
  ];
}

// ─── 3. Fetch all contextual memory ───────────────────────
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

// ─── 4. Generate assistant reply via GPT ─────────────────
export async function getAssistantReply(fullMessages) {
  // 4a) Pre-summarize any message > LONG_MSG_THRESH
  const pruned = [];
  for (let m of fullMessages) {
    let content = m.content;
    if (content.length > LONG_MSG_THRESH) {
      content = await summarizeText(content);
    }
    pruned.push({ role: m.role, content });
  }

  // 4b) Call GPT with pruned history
  const res = await fetch("/.netlify/functions/chatgpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: pruned,
      model: ASSISTANT_MODEL,
      temperature: 0.8
    })
  });
  const data = await res.json();
  if (data.usage && window.debugLog) {
    const { prompt_tokens, completion_tokens, total_tokens } = data.usage;
    window.debugLog(`[USAGE][AssistantReply] prompt:${prompt_tokens} completion:${completion_tokens} total:${total_tokens}`);
  }
  return data.choices?.[0]?.message?.content || "[No reply]";
}

// ─── 5. Extract memory from prompt ───────────────────────
export async function extractMemoryFromPrompt(prompt, uid) {
  const today = todayStr();
  const { memoryType, rawPrompt } = detectMemoryType(prompt);
  if (!memoryType) return null;

  const payload = {
    model: CHEAP_MODEL,
    temperature: LOW_TEMP,
    messages: [
      { role: "system",
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
  };

  const res = await fetch("/.netlify/functions/chatgpt", {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (data.usage && window.debugLog) {
    const { prompt_tokens, completion_tokens, total_tokens } = data.usage;
    window.debugLog(`[USAGE][Extraction] prompt:${prompt_tokens} completion:${completion_tokens} total:${total_tokens}`);
  }

  const parsed = extractJson(
    JSON.stringify(data.choices?.[0]?.message?.content ?? data.choices?.[0])
  );
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

// ─── 6. Periodic summary every 20 messages ──────────────
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