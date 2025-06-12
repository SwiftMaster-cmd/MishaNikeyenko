// ðŸ"¹ memoryManager.js â€" Firebase read/write helpers + system prompt builder
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase,
  ref,
  get,
  set
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

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
const auth = getAuth(app);

// ðŸ"¹ Read Helpers
export const getMemory      = (uid) => fetchNode(`memory/${uid}`);
export const getDayLog      = (uid, dateStr) => fetchNode(`dayLog/${uid}/${dateStr}`);
export const getNotes       = (uid) => fetchNode(`notes/${uid}`);
export const getCalendar    = (uid) => fetchNode(`calendarEvents/${uid}`);
export const getReminders   = (uid) => fetchNode(`reminders/${uid}`);
export const getCalcHistory = (uid) => fetchNode(`calcHistory/${uid}`);

// ðŸ"¹ Write Helper for Day Log
export async function updateDayLog(uid, dateStr, newLog) {
  const path = `dayLog/${uid}/${dateStr}`;
  const existingSnap = await get(ref(db, path));
  const existing = existingSnap.exists() ? existingSnap.val() : {};

  const merged = {
    highlights: mergeArrays(existing.highlights, newLog.highlights),
    mood: newLog.mood ?? existing.mood ?? "",
    notes: mergeArrays(existing.notes, newLog.notes),
    questions: mergeArrays(existing.questions, newLog.questions)
  };

  await set(ref(db, path), merged);
  return merged;
}

export function buildSystemPrompt({ memory, todayLog, notes, calendar, reminders, calc, date }) {
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
- You may trigger built-in commands instead of free-form answers:
  • \`/search <query>\` to perform a web search.
  • \`/searchresults\` to display the full last search results.
  • \`/note <content>\` to save a note.
  • \`/reminder <content>\` to set a reminder.
  • \`/calendar <event>\` to create a calendar event.
  • \`/console\` to open the debug overlay.
- When Bossman asks something you can handle via those commands, respond exactly with the command (e.g. "/search best pizza near me"), not a natural-language paraphrase.
- For all other queries, answer directly and concisely.
- Do NOT suggest next actions unless Bossman explicitly asks.
- Do NOT append any extra closing sentence or salutation.
- End your response immediately after providing the answer; no trailing remarks.
- Stay brief, accurate, and task-focused.
- Include only relevant info; omit small talk.
`;
}

// ðŸ"¹ Internal Helpers

async function fetchNode(path) {
  const snap = await get(ref(db, path));
  return snap.exists() ? snap.val() : {};
}

function mergeArrays(arr1 = [], arr2 = []) {
  if (!Array.isArray(arr1)) arr1 = [];
  if (!Array.isArray(arr2)) arr2 = [];
  return Array.from(new Set([...arr1, ...arr2]));
}

function formatBlock(obj = {}) {
  if (!obj || Object.keys(obj).length === 0) {
    return "None.";
  }

  const isTwoLevel = Object.values(obj).every(
    (v) =>
      v &&
      typeof v === "object" &&
      Object.values(v).every(
        (child) =>
          child &&
          typeof child === "object" &&
          ("content" in child || "amount" in child || "value" in child)
      )
  );

  if (isTwoLevel) {
    return Object.entries(obj)
      .map(([outerKey, innerObj]) => {
        const items = Object.values(innerObj).map((entry) => {
          if ("content" in entry) {
            if ("date" in entry) {
              return `${entry.date}: ${entry.content}`;
            }
            if ("timestamp" in entry) {
              const t = new Date(entry.timestamp).toLocaleString();
              return `${t}: ${entry.content}`;
            }
            return entry.content;
          }
          return JSON.stringify(entry);
        });
        return `${outerKey}: ${items.join("; ")}`;
      })
      .join("\n");
  }

  return Object.entries(obj)
    .map(([k, v]) => {
      if (Array.isArray(v)) {
        return `${k}: [${v.join(", ")}]`;
      }
      if (typeof v === "object") {
        return `${k}: ${JSON.stringify(v)}`;
      }
      return `${k}: ${v}`;
    })
    .join("\n");
}