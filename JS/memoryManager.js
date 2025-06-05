import {
  getDatabase,
  ref,
  get,
  set
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// 🔹 Load individual nodes
export async function getMemory(uid) {
  return fetchNode(`memory/${uid}`);
}

export async function getDayLog(uid, dateStr) {
  return fetchNode(`dayLog/${uid}/${dateStr}`);
}

export async function getNotes(uid) {
  return fetchNode(`notes/${uid}`);
}

export async function getCalendar(uid) {
  return fetchNode(`calendarEvents/${uid}`);
}

export async function getCalcHistory(uid) {
  return fetchNode(`calcHistory/${uid}`);
}

async function fetchNode(path) {
  const snap = await get(ref(getDatabase(), path));
  return snap.exists() ? snap.val() : {};
}

// 🔹 Update day log with merge logic
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

  console.log("📥 Writing merged log to:", path);
  await set(ref(db, path), merged);
  return merged;
}

// 🔹 Build system prompt using all user context
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

// 🔹 Format helper
function formatBlock(obj = {}) {
  if (Object.keys(obj).length === 0) return "None.";
  return Object.entries(obj)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
    .join("\n");
}

function merge(arr1 = [], arr2 = []) {
  return Array.from(new Set([...(arr1 || []), ...(arr2 || [])]));
}