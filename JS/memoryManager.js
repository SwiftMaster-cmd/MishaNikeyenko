import {
  getDatabase,
  ref,
  get,
  set,
  push
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// Load
export const getMemory = (uid) => fetchNode(`memory/${uid}`);
export const getDayLog = (uid, dateStr) => fetchNode(`dayLog/${uid}/${dateStr}`);
export const getNotes = (uid) => fetchNode(`notes/${uid}`);
export const getCalendar = (uid) => fetchNode(`calendarEvents/${uid}`);
export const getReminders = (uid) => fetchNode(`reminders/${uid}`);
export const getCalcHistory = (uid) => fetchNode(`calcHistory/${uid}`);

async function fetchNode(path) {
  const snap = await get(ref(getDatabase(), path));
  return snap.exists() ? snap.val() : {};
}

// Write
export async function addNote(uid, content) {
  if (!uid || !content) return false;
  const today = new Date().toISOString().split('T')[0];
  await push(ref(getDatabase(), `notes/${uid}/${today}`), {
    content,
    timestamp: Date.now()
  });
  return true;
}

export async function updateDayLog(uid, dateStr, newLog) {
  const db = getDatabase();
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

// Prompt builder
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

You do this:
- Respond clearly and only to what Bossman asks
- Do not suggest next actions unless Bossman asks for them
- Do not ask if the user wants to chat more
- Stay brief, accurate, and task-focused
- Reflect Bossman's intent. Prioritize clarity over chatter
- Only include relevant info -- no small talk or filler
`;
}

function merge(arr1 = [], arr2 = []) {
  return Array.from(new Set([...(arr1 || []), ...(arr2 || [])]));
}

function formatBlock(obj = {}) {
  if (!obj || Object.keys(obj).length === 0) return "None.";
  return Object.entries(obj)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
    .join("\n");
}