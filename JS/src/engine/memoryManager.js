// 🔹 memoryManager.js – Firebase memory metadata handling + system prompt builder (E2EE Ready)

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

// 🔹 Public Readers – summary metadata only
export const getMemory      = (uid) => fetchNode(`memorySummary/${uid}`);
export const getDayLog      = (uid, dateStr) => fetchNode(`dayLog/${uid}/${dateStr}`);
export const getNotes       = (uid) => fetchNode(`notes/${uid}`);
export const getCalendar    = (uid) => fetchNode(`calendarEvents/${uid}`);
export const getReminders   = (uid) => fetchNode(`reminders/${uid}`);
export const getCalcHistory = (uid) => fetchNode(`calcHistory/${uid}`);

// 🔹 Day Log Writer – merge highlights, questions, etc.
export async function updateDayLog(uid, dateStr, newLog) {
  const path = `dayLog/${uid}/${dateStr}`;
  const snap = await get(ref(db, path));
  const existing = snap.exists() ? snap.val() : {};

  const merged = {
    highlights: mergeArrays(existing.highlights, newLog.highlights),
    mood: newLog.mood ?? existing.mood ?? "",
    notes: mergeArrays(existing.notes, newLog.notes),
    questions: mergeArrays(existing.questions, newLog.questions)
  };

  await set(ref(db, path), merged);
  return merged;
}

// 🔹 System Prompt Builder – safe summaries only
export function buildSystemPrompt({ memory, todayLog, notes, calendar, reminders, calc, date }) {
  return `
You are Nexus, a second brain for Bossman.
Date: ${date}

-- Encrypted memory summaries:
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
- When Bossman asks something you can handle via those commands, respond exactly with the command (e.g. "/note remember dentist on Monday"), not a paraphrase.
- For all other prompts, reply directly and concisely.
- Do NOT suggest next actions unless explicitly asked.
- Do NOT use filler, small talk, or trailing remarks.
- Focus, be brief, and respond with only what matters.
`;
}

// 🔹 Internal Helpers

async function fetchNode(path) {
  const snap = await get(ref(db, path));
  return snap.exists() ? snap.val() : {};
}

function mergeArrays(a = [], b = []) {
  return Array.from(new Set([...a, ...b].filter(Boolean)));
}

function formatBlock(obj = {}) {
  if (!obj || Object.keys(obj).length === 0) return "None.";

  return Object.entries(obj)
    .sort(([, a], [, b]) => (b.timestamp || 0) - (a.timestamp || 0))
    .map(([_, meta]) => {
      const { topic, summary, category, tags = [] } = meta;
      return `• ${topic} [${category} | ${tags.join(", ")}]: ${summary}`;
    })
    .join("\n");
}