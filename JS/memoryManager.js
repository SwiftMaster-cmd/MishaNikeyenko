// memoryManager.js – handles memory read/write/prompt generation

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, get, push, set
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  getAuth
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// 🔧 Firebase Config
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

// 🔹 Universal fetcher
async function fetchNode(path) {
  const snap = await get(ref(db, path));
  return snap.exists() ? snap.val() : {};
}

// 🔹 Read functions
export const getMemory = (uid) => fetchNode(`memory/${uid}`);
export const getDayLog = (uid, dateStr) => fetchNode(`dayLog/${uid}/${dateStr}`);
export const getNotes = (uid) => fetchNode(`notes/${uid}`);
export const getCalendar = (uid) => fetchNode(`calendarEvents/${uid}`);
export const getReminders = (uid) => fetchNode(`reminders/${uid}`);
export const getCalcHistory = (uid) => fetchNode(`calcHistory/${uid}`);

// 🔹 Add Note
export async function addNote(uid, content) {
  if (!uid || !content) return false;
  const today = new Date().toISOString().split('T')[0];
  await push(ref(db, `notes/${uid}/${today}`), {
    content,
    timestamp: Date.now()
  });
  return true;
}

// 🔹 Update Daily Log
export async function updateDayLog(uid, dateStr, newLog) {
  const path = `dayLog/${uid}/${dateStr}`;
  const existingSnap = await get(ref(db, path));
  const existing = existingSnap.exists() ? existingSnap.val() : {};

  const merged = {
    highlights: merge(existing.highlights, newLog.highlights),
    mood: newLog.mood || existing.mood || "",
    notes: merge(existing.notes, newLog.notes),
    questions: merge(existing.questions, newLog.questions)
  };

  await set(ref(db, path), merged);
  return merged;
}

// 🔹 Prompt Builder
export function buildSystemPrompt({ memory, todayLog, notes, calendar, reminders, calc, date }) {
  return `
You are Nexus, a second brain for Bossman.
Date: ${date}

User memory:
${formatBlock(memory)}

Today's log:
${formatBlock(todayLog)}

Notes:
${formatBlock(notes)}

Calendar:
${formatBlock(calendar)}

Reminders:
${formatBlock(reminders)}

Finances:
${formatBlock(calc)}

Instructions:
- Respond clearly and only to what Bossman asks.
- Do not suggest actions unless Bossman asks.
- Do not ask if the user wants to chat more.
- Be brief, accurate, and task-focused.
- Reflect Bossman's intent. No filler or small talk.
`;
}

// 🔹 Helpers
function merge(arr1 = [], arr2 = []) {
  return Array.from(new Set([...(arr1 || []), ...(arr2 || [])]));
}

function formatBlock(obj = {}) {
  if (!obj || Object.keys(obj).length === 0) return "None.";
  return Object.entries(obj)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
    .join("\n");
}