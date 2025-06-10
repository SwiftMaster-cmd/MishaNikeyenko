// 🔹 backgpt.js – Retrieval-augmented, context-pruning assistant

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

const ASSISTANT_MODEL  = "gpt-4o";
const CHEAP_MODEL      = "gpt-3.5-turbo";
const LOW_TEMP         = 0.3;
const LONG_MSG_THRESH  = 100;
const KEEP_COUNT       = 10;
const MAX_SAVE_LEN     = 2000;

// ─── Helpers ────────────────────────────────────────────

// Truncate overly long content before saving
function trimContent(s) {
  return s.length <= MAX_SAVE_LEN
    ? s
    : s.slice(0, MAX_SAVE_LEN) + "\n…[truncated]";
}

// Summarize a block of messages with the cheap model
async function summarizeBlock(block) {
  const res = await fetch("/.netlify/functions/chatgpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: CHEAP_MODEL,
      temperature: LOW_TEMP,
      messages: [
        { role: "system", content: "Summarize this conversation in one short paragraph:" },
        { role: "user", content: block.map(m => `${m.role}: ${m.content}`).join("\n") }
      ]
    })
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "[…summary failed]";
}

// One-sentence summary for a single long system message
async function summarizeText(text) {
  const res = await fetch("/.netlify/functions/chatgpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
  return data.choices?.[0]?.message?.content
    || text.slice(0, LONG_MSG_THRESH) + "…";
}

// ─── 1. Save inbound message ─────────────────────────────
export async function saveMessageToChat(role, content, uid) {
  await push(ref(db, `chatHistory/${uid}`), {
    role,
    content: trimContent(content),
    timestamp: Date.now()
  });
}

// ─── 2. Function definitions for OpenAI ─────────────────
const functions = [
  {
    name: "fetch_context",
    description: "Load only the user data fields needed for this query",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        types: {
          type: "array",
          items: { type: "string", enum: ["memory","dayLog","chatHistory","notes","calendarEvents","reminders","calcHistory"] }
        }
      },
      required: ["query","types"]
    }
  }
];

// ─── 3. Handler to fetch from Firebase ───────────────────
async function handleFetchContext(args, uid) {
  const out = {};
  const today = new Date().toISOString().slice(0, 10);
  for (let t of args.types) {
    switch (t) {
      case "memory":
        out.memory = await getMemory(uid);
        break;
      case "dayLog":
        out.dayLog = await getDayLog(uid, today);
        break;
      case "notes":
        out.notes = await getNotes(uid);
        break;
      case "calendarEvents":
        out.calendarEvents = await getCalendar(uid);
        break;
      case "reminders":
        out.reminders = await getReminders(uid);
        break;
      case "calcHistory":
        out.calcHistory = await getCalcHistory(uid);
        break;
      case "chatHistory":
        const snap = await get(child(ref(db), `chatHistory/${uid}`));
        if (!snap.exists()) {
          out.chatHistory = [];
        } else {
          const all = Object.values(snap.val())
            .sort((a,b) => (a.timestamp||0) - (b.timestamp||0))
            .slice(-KEEP_COUNT);
          out.chatHistory = all;
        }
        break;
    }
  }
  return out;
}

// ─── 4. Fetch pruned history with summarization ──────────
export async function fetchLast20Messages(uid) {
  const snap = await get(child(ref(db), `chatHistory/${uid}`));
  if (!snap.exists()) return [];
  const all = Object.values(snap.val())
    .map(m => ({
      role: m.role === "bot" ? "assistant" : m.role,
      content: m.content,
      timestamp: m.timestamp || 0
    }))
    .sort((a,b) => a.timestamp - b.timestamp);

  if (all.length <= KEEP_COUNT) return all;
  const older = all.slice(0, all.length - KEEP_COUNT);
  const recent = all.slice(-KEEP_COUNT);
  const summary = await summarizeBlock(older);

  return [
    { role: "system", content: `Conversation so far:\n${summary}` },
    ...recent
  ];
}

// ─── 5. Main GPT interaction ──────────────────────────────
export async function getAssistantReply(fullMessages, uid) {
  // 5a) Prune very long system messages
  const pruned = [];
  for (let m of fullMessages) {
    if (m.role === "system" && m.content.length > LONG_MSG_THRESH) {
      const short = await summarizeText(m.content);
      pruned.push({ role: "system", content: short });
    } else {
      pruned.push(m);
    }
  }

  // 5b) Ask GPT which context it needs
  let res = await fetch("/.netlify/functions/chatgpt", {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({
      model: ASSISTANT_MODEL,
      messages: [
        { role: "system", content: "You can call fetch_context to load any user data you need before replying." },
        ...pruned
      ],
      functions,
      function_call: { name: "fetch_context" }
    })
  });
  let payload = await res.json();
  const choice = payload.choices[0].message;

  // 5c) If GPT asked to fetch_context, execute it
  if (choice.function_call) {
    const args = JSON.parse(choice.function_call.arguments);
    const ctx  = await handleFetchContext(args, uid);

    // 5d) Send context back and get final answer
    res = await fetch("/.netlify/functions/chatgpt", {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({
        model: ASSISTANT_MODEL,
        messages: [
          choice,
          { role: "function", name: "fetch_context", content: JSON.stringify(ctx) }
        ]
      })
    });
    payload = await res.json();
  }

  return payload.choices[0].message.content || "[No reply]";
}

// ─── 6. Extract memory from prompt ───────────────────────
export async function extractMemoryFromPrompt(prompt, uid) {
  const today = new Date().toISOString().slice(0, 10);
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
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  const parsed = extractJson(
    JSON.stringify(data.choices?.[0]?.message?.content ?? data.choices?.[0])
  );
  if (!parsed?.type || !parsed?.content) return null;

  let path;
  switch (parsed.type) {
    case "calendar":      path = `calendarEvents/${uid}`; break;
    case "reminder":      path = `reminders/${uid}`;      break;
    case "log":           path = `dayLog/${uid}/${today}`;break;
    default:              path = `notes/${uid}/${today}`; break;
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

// ─── 7. Periodic summary every 20 messages ──────────────
export async function summarizeChatIfNeeded(uid) {
  const snap = await get(child(ref(db), `chatHistory/${uid}`));
  if (!snap.exists()) return;
  const all = Object.values(snap.val())
    .map(m => ({
      role: m.role === "bot" ? "assistant" : m.role,
      content: m.content,
      timestamp: m.timestamp || 0
    }))
    .sort((a,b) => a.timestamp - b.timestamp);

  if (all.length % 20 !== 0) return;
  const summary = await summarizeBlock(all.slice(-20));
  await push(ref(db, `memory/${uid}`), { summary, timestamp: Date.now() });
}