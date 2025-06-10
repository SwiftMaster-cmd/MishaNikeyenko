// backgpt.js

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
const CHEAP_MODEL      = "gpt-3.5-turbo";
const LOW_TEMP         = 0.3;
const KEEP_COUNT       = 10;
const MAX_SAVE_LEN     = 2000;
const LONG_MSG_THRESH  = 100;

// ─── Trimming ────────────────────────────────────────────

function trimContent(s) {
  return s.length <= MAX_SAVE_LEN ? s : s.slice(0, MAX_SAVE_LEN) + "\n…[truncated]";
}

// ─── Summarization ───────────────────────────────────────

async function summarizeBlock(block) {
  const res = await fetch("/.netlify/functions/chatgpt", {
    method: "POST", headers: { "Content-Type": "application/json" },
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

async function summarizeText(text) {
  const res = await fetch("/.netlify/functions/chatgpt", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: CHEAP_MODEL,
      temperature: LOW_TEMP,
      messages: [
        { role: "system", content: "In one sentence, summarize the following context:" },
        { role: "user",   content: text }
      ]
    })
  });
  const data = await res.json();
  if (data.usage && window.debugLog) {
    const { prompt_tokens, completion_tokens, total_tokens } = data.usage;
    window.debugLog(`[USAGE][SummarizeContext] prompt:${prompt_tokens} completion:${completion_tokens} total:${total_tokens}`);
  }
  return data.choices?.[0]?.message?.content || text.slice(0, LONG_MSG_THRESH) + "…";
}

async function getRelevanceMetadata(text) {
  const res = await fetch("/.netlify/functions/chatgpt", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: CHEAP_MODEL,
      temperature: LOW_TEMP,
      messages: [
        {
          role: "system",
          content: `For the following user memory or note, return a JSON object:
{
  "summary": "1-sentence summary",
  "tags": ["tag1", "tag2", ...] // like "goal", "habit", "preference", "task", "mood"
}`
        },
        { role: "user", content: text }
      ]
    })
  });
  const data = await res.json();
  return extractJson(data.choices?.[0]?.message?.content || "{}") || { summary: "", tags: [] };
}

// ─── Chat History ────────────────────────────────────────

export async function saveMessageToChat(role, content, uid) {
  await push(ref(db, `chatHistory/${uid}`), {
    role,
    content: trimContent(content),
    timestamp: Date.now()
  });
}

// ─── Context Selection ───────────────────────────────────

function filterByTags(entries = [], requiredTags = []) {
  return entries.filter(entry =>
    (entry.tags || []).some(tag => requiredTags.includes(tag))
  );
}

export async function getRelevantContext(prompt, uid) {
  const res = await fetch("/.netlify/functions/chatgpt", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: CHEAP_MODEL,
      temperature: LOW_TEMP,
      messages: [
        {
          role: "system",
          content: `You are a smart context router.
Return a JSON object with booleans for these keys:
{
  "memory": true | false,
  "dayLog": true | false,
  "notes": true | false,
  "calendar": true | false,
  "reminders": true | false,
  "calc": true | false
}
Always include "memory" if the prompt refers to:
- 'me', 'remember', 'what do you know', 'my preferences'
Return ONLY JSON.`
        },
        { role: "user", content: prompt }
      ]
    })
  });
  const data = await res.json();
  return extractJson(data.choices?.[0]?.message?.content || "{}") || {};
}

export async function getSelectedContext(prompt, uid) {
  const keys = await getRelevantContext(prompt, uid);
  const today = todayStr();
  const ctx = {};
  const sources = {
    memory:    async () => filterByTags(await getMemory(uid), ["preference", "goal", "habit"]),
    dayLog:    () => getDayLog(uid, today),
    notes:     async () => filterByTags(await getNotes(uid), ["important", "task", "project"]),
    calendar:  () => getCalendar(uid),
    reminders: async () => filterByTags(await getReminders(uid), ["task", "event"]),
    calc:      () => getCalcHistory(uid)
  };
  await Promise.all(Object.entries(keys).map(async ([key]) => {
    if (sources[key]) ctx[key] = await sources[key]();
  }));
  return ctx;
}

// ─── GPT Call ────────────────────────────────────────────

export async function getAssistantReply(fullMessages, prompt, uid) {
  const MAX_TOKENS = 1000;
  let total = 0;
  const finalMessages = [];

  const wantsDetail = /more detail|expand|show all|full (note|log|memory)|deep dive/i.test(prompt);

  // Layer 1: Recent messages
  const recent = fullMessages.slice(-5).reverse();
  for (const m of recent) {
    const size = Math.ceil((m.content || "").length / 4);
    if (total + size <= MAX_TOKENS) {
      finalMessages.unshift(m);
      total += size;
    }
  }

  // Layer 2: Context entries (summary or full depending on flag)
  const context = await getSelectedContext(prompt, uid);
  for (const [key, list] of Object.entries(context)) {
    for (const item of list.slice(-5)) {
      const text = wantsDetail ? item.content : (item.summary || item.content);
      const line = `${key.toUpperCase()}: ${text}`;
      const size = Math.ceil(line.length / 4);
      if (total + size <= MAX_TOKENS) {
        finalMessages.unshift({ role: "system", content: line });
        total += size;
      }
    }
  }

  const res = await fetch("/.netlify/functions/chatgpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: CHEAP_MODEL,
      temperature: 0.8,
      messages: finalMessages
    })
  });

  const data = await res.json();
  if (data.usage && window.debugLog) {
    const { prompt_tokens, completion_tokens, total_tokens } = data.usage;
    window.debugLog(`[USAGE][AssistantReply] prompt:${prompt_tokens} completion:${completion_tokens} total:${total_tokens}`);
  }

  return data.choices?.[0]?.message?.content || "[No reply]";
}

// ─── Memory Extraction ───────────────────────────────────

export async function extractMemoryFromPrompt(prompt, uid) {
  const today = todayStr();
  const { memoryType, rawPrompt } = detectMemoryType(prompt);
  if (!memoryType) return null;

  const res = await fetch("/.netlify/functions/chatgpt", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: CHEAP_MODEL,
      temperature: LOW_TEMP,
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

  const data = await res.json();
  const parsed = extractJson(
    JSON.stringify(data.choices?.[0]?.message?.content ?? data.choices?.[0])
  );
  if (!parsed?.type || !parsed?.content) return null;

  const relevance = await getRelevanceMetadata(parsed.content);

  let path;
  switch (parsed.type) {
    case "calendar": path = `calendarEvents/${uid}`; break;
    case "reminder": path = `reminders/${uid}`;      break;
    case "log":      path = `dayLog/${uid}/${today}`;break;
    default:         path = `notes/${uid}/${today}`; break;
  }

  await push(ref(db, path), {
    content: parsed.content,
    summary: relevance.summary,
    tags: relevance.tags,
    ...(parsed.date       ? { date: parsed.date }       : {}),
    ...(parsed.time       ? { time: parsed.time }       : {}),
    ...(parsed.recurrence ? { recurrence: parsed.recurrence } : {}),
    timestamp: Date.now()
  });

  return parsed;
}

// ─── Periodic Summarization ──────────────────────────────

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