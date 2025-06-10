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

// ─── Chat History ────────────────────────────────────────

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

  const older = all.slice(0, all.length - KEEP_COUNT);
  const recent = all.slice(-KEEP_COUNT);
  const summary = await summarizeBlock(older);

  return [
    { role: "system", content: `Conversation so far:\n${summary}` },
    ...recent
  ];
}

// ─── Context Selection ───────────────────────────────────

export async function getRelevantContext(prompt, uid) {
  const res = await fetch("/.netlify/functions/chatgpt", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: CHEAP_MODEL,
      temperature: LOW_TEMP,
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
  const data = await res.json();
  const parsed = extractJson(JSON.stringify(data.choices?.[0]?.message?.content || {}));
  return parsed || {};
}

export async function getSelectedContext(prompt, uid) {
  const keys = await getRelevantContext(prompt, uid);
  const today = todayStr();
  const ctx = {};
  const sources = {
    memory:    () => getMemory(uid),
    dayLog:    () => getDayLog(uid, today),
    notes:     () => getNotes(uid),
    calendar:  () => getCalendar(uid),
    reminders: () => getReminders(uid),
    calc:      () => getCalcHistory(uid)
  };
  await Promise.all(Object.entries(keys).map(async ([key]) => {
    if (sources[key]) ctx[key] = await sources[key]();
  }));
  return ctx;
}

// ─── Compression ─────────────────────────────────────────

async function compressMessages(messages, maxTokens = 1000) {
  const result = [];
  let total = 0;

  for (const m of messages.reverse()) {
    const content = m.content || "";
    const tokenEstimate = Math.ceil(content.length / 4);

    if (total + tokenEstimate > maxTokens) {
      if (m.role === "system" && content.length > LONG_MSG_THRESH) {
        const short = await summarizeText(content);
        const shortEstimate = Math.ceil(short.length / 4);
        if (total + shortEstimate <= maxTokens) {
          result.unshift({ role: m.role, content: short });
          total += shortEstimate;
        }
      }
      continue;
    }

    result.unshift(m);
    total += tokenEstimate;
  }

  return result;
}

// ─── GPT Call ────────────────────────────────────────────

export async function getAssistantReply(fullMessages) {
  const pruned = await compressMessages(fullMessages, 1000);

  const res = await fetch("/.netlify/functions/chatgpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: pruned,
      model: CHEAP_MODEL,
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

// ─── Memory Extraction ───────────────────────────────────

export async function extractMemoryFromPrompt(prompt, uid) {
  const today = todayStr();
  const { memoryType, rawPrompt } = detectMemoryType(prompt);
  if (!memoryType) return null;

  const payload = {
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
  };

  const res = await fetch("/.netlify/functions/chatgpt", {
    method: "POST", headers: { "Content-Type": "application/json" },
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