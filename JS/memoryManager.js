import {
  getDatabase,
  ref,
  get,
  set,
  push,
  update
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// 🔹 Helpers
function dbRef(path) {
  return ref(getDatabase(), path);
}
async function fetchNode(path) {
  const snap = await get(dbRef(path));
  return snap.exists() ? snap.val() : {};
}

// 🔹 READ FUNCTIONS
export const getMemory = (uid) => fetchNode(`memory/${uid}`);
export const getDayLog = (uid, dateStr) => fetchNode(`dayLog/${uid}/${dateStr}`);
export const getNotes = (uid) => fetchNode(`notes/${uid}`);
export const getCalendar = (uid) => fetchNode(`calendarEvents/${uid}`);
export const getCalcHistory = (uid) => fetchNode(`calcHistory/${uid}`);
export const getReminders = (uid) => fetchNode(`reminders/${uid}`);

// 🔹 WRITE FUNCTIONS
export async function setMemory(uid, obj) {
  await set(dbRef(`memory/${uid}`), obj);
}
export async function updateDayLog(uid, dateStr, newLog) {
  const path = `dayLog/${uid}/${dateStr}`;
  const existing = await fetchNode(path);

  const merged = {
    highlights: merge(existing.highlights, newLog.highlights),
    mood: newLog.mood || existing.mood || "",
    notes: merge(existing.notes, newLog.notes),
    questions: merge(existing.questions, newLog.questions)
  };

  await set(dbRef(path), merged);
  return merged;
}
export async function addNote(uid, content) {
  if (!content || !uid) return false;
  const today = new Date().toISOString().split('T')[0];
  const refPath = dbRef(`notes/${uid}/${today}`);
  await push(refPath, { content, timestamp: Date.now() });
  return true;
}
export async function addCalendarEvent(uid, dateStr, eventObj) {
  const path = `calendarEvents/${uid}/${dateStr}`;
  const events = await fetchNode(path);
  const updated = Array.isArray(events) ? [...events, eventObj] : [eventObj];
  await set(dbRef(path), updated);
}
export async function addReminder(uid, reminderObj) {
  const path = `reminders/${uid}`;
  await push(dbRef(path), reminderObj);
}
export async function addCalcHistory(uid, calcObj) {
  const path = `calcHistory/${uid}`;
  await push(dbRef(path), calcObj);
}

// 🔹 SYSTEM PROMPT BUILDER
export function buildSystemPrompt({ memory, todayLog, notes, calendar, calc, date }) {
  return `
You are Nexus, a smart, bold, and fun assistant for Bossman.
Date: ${date}

User memory:
${formatBlock(memory)}

Today's log:
${formatBlock(todayLog)}

Notes:
${formatBlock(notes)}

Calendar:
${formatBlock(calendar)}

Finances:
${formatBlock(calc)}

You do this:
- Respond clearly, directly, and with style
- Use sharp wit or friendly humor to keep things engaging
- Always push the conversation forward -- don't wait for direction if Bossman seems lost
- Suggest next actions confidently, even if Bossman didn't ask
- Keep everything goal-oriented and efficient under the hood
- Update memory or logs when prompted (e.g. "remember this", "log this")
- Reflect the user's current mood and momentum
- Stay brief unless depth is needed
- Own the vibe -- help Bossman focus, build, and stay on track
`;
}

// 🔹 HELPERS
function merge(arr1 = [], arr2 = []) {
  return Array.from(new Set([...(arr1 || []), ...(arr2 || [])]));
}
function formatBlock(obj = {}) {
  if (!obj || Object.keys(obj).length === 0) return "None.";
  return Object.entries(obj)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
    .join("\n");
}