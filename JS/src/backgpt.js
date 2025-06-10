// 🔹 backgpt.js – Full, efficient context summarization & GPT interface

import { ref, push, get, set, child } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
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

const ASSISTANT_MODEL = "gpt-4o";
const CHEAP_MODEL     = "gpt-3.5-turbo";
const LOW_TEMP        = 0.3;
const LONG_MSG_THRESH = 100;  // threshold for summary truncation

// ------------------------------------------------------------------------------------------
//  Helpers
// ------------------------------------------------------------------------------------------

// Summarize any text into one sentence via cheap model
async function summarizeText(text) {
  const res = await fetch("/.netlify/functions/chatgpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: CHEAP_MODEL,
      temperature: LOW_TEMP,
      messages: [
        { role: "system", content: "In one sentence, summarize this context:" },
        { role: "user",   content: text }
      ]
    })
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim()
      || text.slice(0, LONG_MSG_THRESH) + "…";
}

// Rebuild & summarize ALL context sections, then overwrite contextSummary/${uid}
async function updateContextSummary(uid) {
  const today = new Date().toISOString().slice(0,10);
  const [memory, dayLog, notes, calendar, reminders, calc] = await Promise.all([
    getMemory(uid),
    getDayLog(uid, today),
    getNotes(uid),
    getCalendar(uid),
    getReminders(uid),
    getCalcHistory(uid)
  ]);

  // flatten into labeled sections
  const sections = [];
  if (memory.length)   sections.push("Memory:\n" + memory.map(e=>e.summary||e.content).join("\n"));
  if (dayLog.length)   sections.push("DayLog:\n"   + dayLog.map(e=>e.content).join("\n"));
  if (notes.length)    sections.push("Notes:\n"    + notes.map(e=>e.content).join("\n"));
  if (calendar.length) sections.push("Calendar:\n" + calendar.map(e=>`${e.date||""} ${e.content}`).join("\n"));
  if (reminders.length)sections.push("Reminders:\n"+ reminders.map(e=>e.content).join("\n"));
  if (calc.length)     sections.push("Calc:\n"     + calc.map(e=>`${e.expression}=${e.result}`).join("\n"));

  const full = sections.join("\n\n");
  const short = full.length > LONG_MSG_THRESH
    ? await summarizeText(full)
    : full;

  await set(ref(db, `contextSummary/${uid}`), { summary: short, timestamp: Date.now() });
}

// ------------------------------------------------------------------------------------------
//  1. Save raw chat turn
// ------------------------------------------------------------------------------------------
export async function saveMessageToChat(role, content, uid) {
  // no change here--just push full content
  await push(ref(db, `chatHistory/${uid}`), {
    role,
    content,
    timestamp: Date.now()
  });
}

// ------------------------------------------------------------------------------------------
//  2. Periodic chat-summary trigger
// ------------------------------------------------------------------------------------------
export async function summarizeChatIfNeeded(uid) {
  const snap = await get(child(ref(db), `chatHistory/${uid}`));
  if (!snap.exists()) return;
  const entries = Object.values(snap.val()).map(m => ({
    role: m.role === "bot" ? "assistant" : m.role,
    content: m.content,
    timestamp: m.timestamp || 0
  })).sort((a,b)=>a.timestamp-b.timestamp);

  if (entries.length % 20 !== 0) return;
  const block = entries.slice(-20).map(m => `${m.role}: ${m.content}`).join("\n");
  
  // get one-block summary
  const res = await fetch("/.netlify/functions/chatgpt", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({
      model: CHEAP_MODEL,
      temperature: LOW_TEMP,
      messages: [
        { role:"system", content:"Summarize this block in one paragraph:" },
        { role:"user",   content:block }
      ]
    })
  });
  const data = await res.json();
  const summary = data.choices?.[0]?.message?.content || "[No summary]";
  await push(ref(db, `memory/${uid}`), { summary, timestamp: Date.now() });

  // rebuild the global context summary
  await updateContextSummary(uid);
}

// ------------------------------------------------------------------------------------------
//  3. Memory extraction (notes/reminders/calendar/log)
// ------------------------------------------------------------------------------------------
export async function extractMemoryFromPrompt(prompt, uid) {
  const today = new Date().toISOString().slice(0,10);
  const { memoryType, rawPrompt } = detectMemoryType(prompt);
  if (!memoryType) return null;

  const payload = {
    model: CHEAP_MODEL,
    temperature: LOW_TEMP,
    messages: [
      { role:"system", content: `
You are a memory extraction engine. Return exactly one JSON:
{ "type":"note"|"reminder"|"calendar"|"log", "content":"string",
  "date":"optional YYYY-MM-DD", "time":"optional HH:MM", "recurrence":"optional RRULE" }
Rules:
1. "/note" → note
2. "/reminder" or "remind me" → reminder
3. Date/time → calendar
4. "/log" or "journal" → log
5. Otherwise → note
Return ONLY JSON.`.trim() },
      { role:"user", content: memoryType.startsWith("/") ? rawPrompt : prompt }
    ]
  };

  const res = await fetch("/.netlify/functions/chatgpt", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  const parsed = extractJson(
    JSON.stringify(data.choices?.[0]?.message?.content ?? data.choices?.[0])
  );
  if (!parsed?.type || !parsed?.content) return null;

  // determine path
  let path;
  switch (parsed.type) {
    case "calendar": path = `calendarEvents/${uid}`; break;
    case "reminder": path = `reminders/${uid}`;      break;
    case "log":      path = `dayLog/${uid}/${today}`;break;
    default:         path = `notes/${uid}/${today}`; break;
  }
  await push(ref(db, path), {
    content: parsed.content,
    ...(parsed.date       && { date: parsed.date }),
    ...(parsed.time       && { time: parsed.time }),
    ...(parsed.recurrence && { recurrence: parsed.recurrence }),
    timestamp: Date.now()
  });

  // rebuild the global context summary
  await updateContextSummary(uid);
  return parsed;
}

// ------------------------------------------------------------------------------------------
//  4. GPT reply with only precomputed summary + dialogue
// ------------------------------------------------------------------------------------------
export async function getAssistantReply(fullMessages, uid) {
  // fetch the one summary blob
  const snap = await get(child(ref(db), `contextSummary/${uid}`));
  const contextMsg = snap.exists()
    ? { role:"system", content: snap.val().summary }
    : { role:"system", content: "" };

  // filter out any stale system messages in fullMessages
  const dialogue = fullMessages.filter(m => m.role !== "system");

  // send exactly two types of entries: our summary + raw turns
  const payload = {
    model: ASSISTANT_MODEL,
    temperature: 0.8,
    messages: [
      contextMsg,
      ...dialogue
    ]
  };

  const res = await fetch("/.netlify/functions/chatgpt", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "[No reply]";
}