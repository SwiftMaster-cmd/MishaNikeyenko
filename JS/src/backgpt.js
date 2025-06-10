// backgpt.js – Handles assistant replies, memory context, saving, summaries

import { ref, push, get, child, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
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

// Models
const ASSISTANT_MODEL = "gpt-4o";
const CHEAP_MODEL     = "gpt-3.5-turbo";
const LOW_TEMP        = 0.3;

// ─── 1. Save a message to Firebase (batched) ─────────
export async function saveMessageToChat(role, content, uid) {
  const key = push(ref(db, `chatHistory/${uid}`)).key;
  await update(ref(db), {
    [`chatHistory/${uid}/${key}`]: { role, content, timestamp: Date.now() }
  });
}

// ─── 2. Get last 20 messages ───────────────────────────
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

// ─── 3. Fetch all contextual memory ────────────────────
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

// ─── 4. Generate assistant reply via GPT (tracked with logs) ───────────────
export async function getAssistantReply(fullMessages) {
  const data = await trackedChat(
    "/.netlify/functions/chatgpt",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: fullMessages,
        model: ASSISTANT_MODEL,
        temperature: 0.8
      })
    },
    true  // enable token logging
  );
  return data.choices?.[0]?.message?.content || "[No reply]";
}

// ─── Parsing helpers ───────────────────────────────────
const weekdayMap = {
  sunday: "SU", monday: "MO", tuesday: "TU", wednesday: "WE",
  thursday: "TH", friday: "FR", saturday: "SA"
};
function parseNaturalDate(text) { /* unchanged */ }
function parseTime(text)        { /* unchanged */ }
function parseRecurrence(text)  { /* unchanged */ }

// ─── 5. Extract memory from prompt (silent tokenTracker) ───────────────
export async function extractMemoryFromPrompt(prompt, uid) {
  const today = todayStr();

  // a) Calendar event
  const date = parseNaturalDate(prompt);
  const time = parseTime(prompt);
  const rec  = parseRecurrence(prompt);
  if (/\b(?:remember(?: to)?\s*)?i need\b/i.test(prompt) && date) {
    const content = prompt.replace(/.*?i need\s+/i, "").split(/\bon\b/i)[0].trim();
    const node = { content, ...(date&&{date}), ...(time&&{time}), ...(rec&&{recurrence:rec.rrule}), timestamp:Date.now() };
    const path = `calendarEvents/${uid}`;
    const key  = push(ref(db, path)).key;
    await update(ref(db), { [`${path}/${key}`]: node });
    return { type:"calendar", ...node };
  }

  // b) Reminder without date
  const remMatch = prompt.match(/\b(?:remember(?: to)?\s*)?i need\s+(.+?)(?:\s+on\b|\s*$)/i);
  if (remMatch && !date) {
    const content = remMatch[1].trim();
    const node = { content, ...(rec&&{recurrence:rec.rrule}), timestamp:Date.now() };
    const path = `reminders/${uid}`;
    const key  = push(ref(db, path)).key;
    await update(ref(db), { [`${path}/${key}`]: node });
    return { type:"reminder", ...node };
  }

  // c) Preferences
  const prefMatch = prompt.match(/\b(?:remember(?: that)?\s*)?i\s+(like|love|prefer|dislike|hate)\s+(.+)/i);
  if (prefMatch) {
    const verb  = prefMatch[1].toLowerCase();
    const value = prefMatch[2].trim();
    const node  = { content:`${verb} ${value}`, timestamp:Date.now() };
    const path = `memory/${uid}/preferences/${verb}s`;
    const key  = push(ref(db, path)).key;
    await update(ref(db), { [`${path}/${key}`]: node });
    return { type:"preference", ...node };
  }

  // d) Fallback via GPT extraction (silent, no logs)
  const { memoryType, rawPrompt } = detectMemoryType(prompt);
  if (!memoryType) return null;

  const res = await fetch("/.netlify/functions/chatgpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: CHEAP_MODEL,
      temperature: LOW_TEMP,
      messages: [
        { role:"system", content: `
You are a memory extraction engine. Return exactly one JSON object:
{ "type":"note"|"reminder"|"calendar"|"log", "content":"string",
  "date":"optional YYYY-MM-DD","time":"optional HH:MM","recurrence":"optional RRULE" }
Return ONLY JSON.` },
        { role:"user", content: memoryType.startsWith("/")? rawPrompt: prompt }
      ]
    })
  });
  const extractionData = await res.json();
  const parsed = extractJson(
    extractionData.choices?.[0]?.message?.content ||
    JSON.stringify(extractionData.choices?.[0])
  );
  if (!parsed?.type || !parsed?.content) return null;

  let path;
  switch(parsed.type) {
    case "calendar": path=`calendarEvents/${uid}`; break;
    case "reminder": path=`reminders/${uid}`;      break;
    case "log":      path=`dayLog/${uid}/${today}`;break;
    default:         path=`notes/${uid}/${today}`; break;
  }
  const key = push(ref(db, path)).key;
  const node = {
    content: parsed.content,
    ...(parsed.date&&{date:parsed.date}),
    ...(parsed.time&&{time:parsed.time}),
    ...(parsed.recurrence&&{recurrence:parsed.recurrence}),
    timestamp: Date.now()
  };
  await update(ref(db), { [`${path}/${key}`]: node });
  return { type: parsed.type, ...node };
}

// ─── 6. Summarize every 20 messages (silent) ─────────────
export async function summarizeChatIfNeeded(uid) {
  const snap = await get(child(ref(db), `chatHistory/${uid}`));
  if (!snap.exists()) return;
  const all = Object.entries(snap.val())
    .map(([_,m])=>({
      role:m.role==="bot"?"assistant":m.role,
      content:m.content,
      timestamp:m.timestamp||0
    }))
    .sort((a,b)=>a.timestamp-b.timestamp);

  if (all.length % 20 !== 0) return;
  const block = all.slice(-20).map(m=>`${m.role}: ${m.content}`).join("\n");

  const res = await fetch("/.netlify/functions/chatgpt", {
    method: "POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({
      model: CHEAP_MODEL,
      temperature: LOW_TEMP,
      messages: [
        { role:"system", content:"Summarize this block in one paragraph:" },
        { role:"user",   content:block }
      ]
    })
  });
  const summaryData = await res.json();
  const summary = summaryData.choices?.[0]?.message?.content || "[No summary]";

  const path = `memory/${uid}`;
  const key  = push(ref(db, path)).key;
  await update(ref(db), { [`${path}/${key}`]: { summary, timestamp:Date.now() } });
}