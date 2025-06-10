// 🔹 backgpt.js – Handles assistant replies, memory context, saving, summaries

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

// ═══════════════════════════════════════════════════════
// 1. Save a message to Firebase
export async function saveMessageToChat(role, content, uid) {
  const chatRef = ref(db, `chatHistory/${uid}`);
  await push(chatRef, { role, content, timestamp: Date.now() });
}

// 2. Get last 20 messages from chatHistory
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

// 3. Fetch all contextual memory
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

// 4. Generate assistant reply via GPT
export async function getAssistantReply(fullMessages) {
  const res = await fetch("/.netlify/functions/chatgpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: fullMessages, model: "gpt-4o", temperature: 0.8 })
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "[No reply]";
}

// ─── New parsing helpers ─────────────────────────────────

const weekdayMap = {
  sunday: "SU", monday: "MO", tuesday: "TU", wednesday: "WE",
  thursday: "TH", friday: "FR", saturday: "SA"
};

function parseNaturalDate(text) {
  const today = new Date();
  if (/\btoday\b/i.test(text)) {
    return today.toISOString().slice(0,10);
  }
  if (/\btomorrow\b/i.test(text)) {
    const t = new Date(today);
    t.setDate(t.getDate()+1);
    return t.toISOString().slice(0,10);
  }
  const wd = Object.keys(weekdayMap).find(d => new RegExp(`\\b${d}\\b`, "i").test(text));
  if (wd) {
    const t = new Date(today);
    const diff = ((Object.keys(weekdayMap).indexOf(wd) + 7) - t.getDay()) % 7 || 7;
    t.setDate(t.getDate() + diff);
    return t.toISOString().slice(0,10);
  }
  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  return iso ? iso[1] : null;
}

function parseTime(text) {
  const m = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (!m) return null;
  let h = parseInt(m[1],10), min = m[2]?parseInt(m[2],10):0;
  const ampm = m[3]?.toLowerCase();
  if (ampm==="pm" && h<12) h+=12;
  if (ampm==="am" && h===12) h=0;
  return `${h.toString().padStart(2,"0")}:${min.toString().padStart(2,"0")}`;
}

function parseRecurrence(text) {
  const every = text.match(/\bevery\s+(day|week|month|(\w+day))\b/i);
  if (!every) return null;
  const freq = every[1].toLowerCase();
  if (freq==="day") return { rrule:"FREQ=DAILY" };
  if (freq==="week") return { rrule:"FREQ=WEEKLY" };
  if (freq==="month") return { rrule:"FREQ=MONTHLY" };
  if (weekdayMap[freq]) return { rrule:`FREQ=WEEKLY;BYDAY=${weekdayMap[freq]}` };
  return null;
}

// 5. Extract memory from prompt (reminders, calendar, preferences, notes, logs)
export async function extractMemoryFromPrompt(prompt, uid) {
  const today = todayStr();

  // a) Calendar event with explicit/natural date, time, or recurrence
  const date = parseNaturalDate(prompt);
  const time = parseTime(prompt);
  const rec = parseRecurrence(prompt);
  if (/\b(?:remember(?: to)?\s*)?i need\b/i.test(prompt) && date) {
    const content = prompt.replace(/.*?i need\s+/i, "").split(/\bon\b/i)[0].trim();
    const node = { content, ...(date?{date}:{}), ...(time?{time}:{}), ...(rec?{recurrence:rec.rrule}:{}), timestamp:Date.now() };
    await push(ref(db, `calendarEvents/${uid}`), node);
    return { type:"calendar", ...node };
  }

  // b) Reminder without date
  const remMatch = prompt.match(/\b(?:remember(?: to)?\s*)?i need\s+(.+?)(?:\s+on\b|\s*$)/i);
  if (remMatch && !date) {
    const content = remMatch[1].trim();
    const node = { content, ...(rec?{recurrence:rec.rrule}:{}), timestamp:Date.now() };
    await push(ref(db, `reminders/${uid}`), node);
    return { type:"reminder", ...node };
  }

  // c) Preferences
  const prefMatch = prompt.match(/\b(?:remember(?: that)?\s*)?i\s+(like|love|prefer|dislike|hate)\s+(.+)/i);
  if (prefMatch) {
    const verb = prefMatch[1].toLowerCase();
    const value = prefMatch[2].trim();
    const node = { content:`${verb} ${value}`, timestamp:Date.now() };
    await push(ref(db, `memory/${uid}/preferences/${verb}s`), node);
    return { type:"preference", key:`${verb}s`, ...node };
  }

  // d) Fallback to detectMemoryType + GPT
  const { memoryType, rawPrompt } = detectMemoryType(prompt);
  if (!memoryType) return null;

  const resp = await fetch("/.netlify/functions/chatgpt", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
      messages:[
        { role:"system", content:`
You are a memory extraction engine. RETURN exactly one JSON object:
{ "type":"note"|"reminder"|"calendar"|"log", "content":"string",
  "date":"optional YYYY-MM-DD", "time":"optional HH:MM", "recurrence":"optional RRULE" }
Rules:
1. "/note" → note
2. "/reminder"/"remind me" → reminder
3. Date/time → calendar
4. "/log"/"journal" → log
5. Otherwise → note
Return ONLY JSON.`},
        { role:"user", content: memoryType.startsWith("/")?rawPrompt:prompt }
      ],
      model:"gpt-4o", temperature:0.3
    })
  });
  const text = await resp.text();
  const parsed = extractJson(text);
  if (!parsed?.type || !parsed?.content) return null;

  // choose path
  let path;
  switch(parsed.type){
    case "calendar": path=`calendarEvents/${uid}`; break;
    case "reminder": path=`reminders/${uid}`; break;
    case "log": path=`dayLog/${uid}/${today}`; break;
    default: path=`notes/${uid}/${today}`;
  }

  await push(ref(db,path), {
    content:parsed.content,
    ...(parsed.date?{date:parsed.date}:{}),
    ...(parsed.time?{time:parsed.time}:{}),
    ...(parsed.recurrence?{recurrence:parsed.recurrence}:{}),
    timestamp:Date.now()
  });
  return parsed;
}

// 6. Run summary every 20 messages
export async function summarizeChatIfNeeded(uid){
  const snap = await get(child(ref(db),`chatHistory/${uid}`));
  if(!snap.exists()) return;
  const all = Object.entries(snap.val())
    .map(([_,m])=>({role:m.role==="bot"?"assistant":m.role,content:m.content,timestamp:m.timestamp||0}))
    .sort((a,b)=>a.timestamp-b.timestamp);
  if(all.length%20!==0) return;
  const block = all.slice(-20).map(m=>`${m.role}: ${m.content}`).join("\n");
  const res = await fetch("/.netlify/functions/chatgpt",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
    messages:[{role:"system",content:"Summarize this block in one paragraph:"},{role:"user",content:block}],
    model:"gpt-4o",temperature:0.5
  })});
  const js = await res.json();
  const summary = js.choices?.[0]?.message?.content || "[No summary]";
  await push(ref(db,`memory/${uid}`),{summary,timestamp:Date.now()});
}