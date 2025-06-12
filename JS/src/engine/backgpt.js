// Ã°Å¸"Â¹ backgpt.js Ã¢â‚¬" Handles assistant replies, memory context, saving, summaries

import { ref, push, get, child } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { db, auth } from "../config/firebaseConfig.js";
import {
  getMemory,
  getDayLog,
  getNotes,
  getCalendar,
  getReminders,
  getCalcHistory
} from "./memoryManager.js";
import { extractJson, detectMemoryType } from "./chatUtils.js";

const todayStr = () => new Date().toISOString().slice(0, 10);

// choose models for cost vs. quality
const ASSISTANT_MODEL = "gpt-4o";        // high-value chats
const CHEAP_MODEL     = "gpt-3.5-turbo"; // cheaper extraction & summaries
const LOW_TEMP        = 0.3;

// Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬ 1. Save a message to Firebase Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬
export async function saveMessageToChat(role, content, uid) {
  await push(ref(db, `chatHistory/${uid}`), {
    role,
    content,
    timestamp: Date.now()
  });
}

// Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬ 2. Get last 20 messages Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬
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

// Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬ 3. Fetch all contextual memory Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬
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

// Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬ 4. Generate assistant reply via GPT Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬
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

  // log usage for assistant reply
  if (data.usage && window.debugLog) {
    const { prompt_tokens, completion_tokens, total_tokens } = data.usage;
    window.debugLog(
      `[USAGE][AssistantReply] prompt:${prompt_tokens}` +
      ` completion:${completion_tokens}` +
      ` total:${total_tokens}`
    );
  }

  return data.choices?.[0]?.message?.content || "[No reply]";
}

// Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬ New parsing helpers (unchanged) Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬
const weekdayMap = {
  sunday: "SU", monday: "MO", tuesday: "TU", wednesday: "WE",
  thursday: "TH", friday: "FR", saturday: "SA"
};
function parseNaturalDate(text) { /* Ã¢â‚¬Â¦same as beforeÃ¢â‚¬Â¦ */ }
function parseTime(text)        { /* Ã¢â‚¬Â¦same as beforeÃ¢â‚¬Â¦ */ }
function parseRecurrence(text)  { /* Ã¢â‚¬Â¦same as beforeÃ¢â‚¬Â¦ */ }

// Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬ 5. Extract memory from prompt Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬
//    uses cheap model for fallback extraction
export async function extractMemoryFromPrompt(prompt, uid) {
  const today = todayStr();
  // (a) explicit calendar & reminders, (b) preferencesÃ¢â‚¬Â¦ omitted for brevity

  // (d) Fallback: use cheap model for extraction
  const { memoryType, rawPrompt } = detectMemoryType(prompt);
  if (!memoryType) return null;

  const extractionRes = await fetch("/.netlify/functions/chatgpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
1. "/note" Ã¢â€ â€™ note
2. "/reminder"/"remind me" Ã¢â€ â€™ reminder
3. Date/time Ã¢â€ â€™ calendar
4. "/log"/"journal" Ã¢â€ â€™ log
5. Otherwise Ã¢â€ â€™ note
Return ONLY JSON.`
        },
        { role: "user", content: memoryType.startsWith("/") ? rawPrompt : prompt }
      ]
    })
  });
  const extractionData = await extractionRes.json();

  // log usage for memory extraction
  if (extractionData.usage && window.debugLog) {
    const { prompt_tokens, completion_tokens, total_tokens } = extractionData.usage;
    window.debugLog(
      `[USAGE][Extraction] prompt:${prompt_tokens}` +
      ` completion:${completion_tokens}` +
      ` total:${total_tokens}`
    );
  }

  const parsed = extractJson(JSON.stringify(extractionData.choices?.[0]?.message?.content ?? extractionData.choices?.[0]));
  if (!parsed?.type || !parsed?.content) return null;

  // determine path and save
  let path;
  switch (parsed.type) {
    case "calendar": path = `calendarEvents/${uid}`; break;
    case "reminder": path = `reminders/${uid}`;      break;
    case "log":      path = `dayLog/${uid}/${today}`;break;
    default:         path = `notes/${uid}/${today}`; break;
  }
  await push(ref(db, path), {
    content: parsed.content,
    ...(parsed.date ? { date: parsed.date } : {}),
    ...(parsed.time ? { time: parsed.time } : {}),
    ...(parsed.recurrence ? { recurrence: parsed.recurrence } : {}),
    timestamp: Date.now()
  });
  return parsed;
}

// Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬ 6. Run summary every 20 messages Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬Ã¢"â‚¬
//    uses cheap model for summarization
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
  const block = all.slice(-20).map(m => `${m.role}: ${m.content}`).join("\n");

  const summaryRes = await fetch("/.netlify/functions/chatgpt", {
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
  const summaryData = await summaryRes.json();

  // log usage for summarization
  if (summaryData.usage && window.debugLog) {
    const { prompt_tokens, completion_tokens, total_tokens } = summaryData.usage;
    window.debugLog(
      `[USAGE][Summary] prompt:${prompt_tokens}` +
      ` completion:${completion_tokens}` +
      ` total:${total_tokens}`
    );
  }

  const summary = summaryData.choices?.[0]?.message?.content || "[No summary]";
  await push(ref(db, `memory/${uid}`), { summary, timestamp: Date.now() });
}