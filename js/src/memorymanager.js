// 🔹 memoryManager.js -- Firebase helpers + system prompt builder
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase,
  ref,
  get,
  set
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCf_se10RUg8i_u8pdowHlQvrFViJ4jh_Q",
  authDomain: "mishanikeyenko.firebaseapp.com",
  databaseURL: "https://mishanikeyenko-default-rtdb.firebaseio.com",
  projectId: "mishanikeyenko",
  storageBucket: "mishanikeyenko.firebasestorage.app",
  messagingSenderId: "1089190937368",
  appId: "1:1089190937368:web:959c825fc596a5e3ae946d"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ------ Read Helpers ------
export const getMemory      = uid => fetchNode(`memory/${uid}`);
export const getDayLog      = (uid, dateStr) => fetchNode(`dayLog/${uid}/${dateStr}`);
export const getNotes       = uid => fetchNode(`notes/${uid}`);
export const getCalendar    = uid => fetchNode(`calendarEvents/${uid}`);
export const getReminders   = uid => fetchNode(`reminders/${uid}`);
export const getCalcHistory = uid => fetchNode(`calcHistory/${uid}`);

// ------ Write Helper for Day Log ------
export async function updateDayLog(uid, dateStr, newLog) {
  const path = `dayLog/${uid}/${dateStr}`;
  const snap = await get(ref(db, path));
  const existing = snap.exists() ? snap.val() : {};

  const merged = {
    highlights: mergeArrays(existing.highlights, newLog.highlights),
    mood:       newLog.mood ?? existing.mood ?? "",
    notes:      mergeArrays(existing.notes, newLog.notes),
    questions:  mergeArrays(existing.questions, newLog.questions)
  };

  await set(ref(db, path), merged);
  return merged;
}

// ------ Prompt Builder ------
export function buildSystemPrompt({
  memory,
  todayLog,
  notes,
  calendar,
  reminders,
  calc,
  date
}) {
  // log payload sizes
  const payload = JSON.stringify({ memory, todayLog, notes, calendar, reminders, calc });
  console.log(`SYS PROMPT data size: ${payload.length} bytes`);

  return `
You are Nexus, a second brain for Bossman.
Date: ${date}

-- User memory:
${formatBlock(memory)}

-- Today's log:
${formatBlock(todayLog)}

-- Notes:
${formatBlock(notes)}

-- Calendar:
${formatBlock(calendar)}

-- Reminders:
${formatBlock(reminders)}

-- Finances (calc history):
${formatBlock(calc)}

Instructions for Nexus:
- Respond directly and only to exactly what Bossman asks.
- Do NOT suggest next actions unless Bossman explicitly asks.
- Do NOT ask if the user wants to chat more.
- Do NOT append ANY extra closing sentence or salutation.
- End your response immediately after providing the answer; no trailing remarks.
- Stay brief, accurate, and task-focused.
- Reflect Bossman's intent; prioritize clarity over filler.
- Include only relevant info; omit small talk.
`;
}

// ------ Internal Helpers ------

async function fetchNode(path) {
  try {
    const snap = await get(ref(db, path));
    return snap.exists() ? snap.val() : {};
  } catch (err) {
    console.error(`fetchNode("${path}") failed:`, err);
    throw err;
  }
}

function mergeArrays(a = [], b = []) {
  if (!Array.isArray(a)) a = [];
  if (!Array.isArray(b)) b = [];
  return Array.from(new Set([...a, ...b]));
}

function escapeBackticks(str) {
  return String(str).replace(/`/g, "\\`");
}

function formatBlock(obj = {}) {
  if (!obj || Object.keys(obj).length === 0) {
    return "None.";
  }

  // Detect two-level structure (e.g. { dateKey: { id1: {...}, id2: {...} } })
  const isTwoLevel = Object.values(obj).every(
    v => v && typeof v === "object" &&
         Object.values(v).every(c => c && typeof c === "object" &&
           ("content" in c || "amount" in c || "value" in c))
  );

  if (isTwoLevel) {
    return Object.entries(obj)
      .map(([outer, inner]) => {
        const items = Object.values(inner).map(entry => {
          let text;
          if ("content" in entry) {
            if ("date" in entry) {
              text = `${entry.date}: ${entry.content}`;
            } else if ("timestamp" in entry) {
              text = `${new Date(entry.timestamp).toLocaleString()}: ${entry.content}`;
            } else {
              text = entry.content;
            }
          } else {
            text = JSON.stringify(entry);
          }
          return escapeBackticks(text);
        });
        return `${outer}: ${items.join("; ")}`;
      })
      .join("\n");
  }

  // Flat object or arrays
  return Object.entries(obj)
    .map(([k, v]) => {
      let repr;
      if (Array.isArray(v)) {
        repr = `[${v.map(escapeBackticks).join(", ")}]`;
      } else if (typeof v === "object") {
        repr = escapeBackticks(JSON.stringify(v));
      } else {
        repr = escapeBackticks(v);
      }
      return `${k}: ${repr}`;
    })
    .join("\n");
}