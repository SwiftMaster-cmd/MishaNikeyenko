import {
  getDatabase,
  ref,
  get,
  set
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

export async function getMemory(uid) {
  const snap = await get(ref(getDatabase(), `memory/${uid}`));
  return snap.exists() ? snap.val() : {};
}

export async function getDayLog(uid, dateStr) {
  const snap = await get(ref(getDatabase(), `dayLog/${uid}/${dateStr}`));
  return snap.exists() ? snap.val() : null;
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

export function buildSystemPrompt(memory, todayLog, dateStr) {
  const mem = Object.entries(memory || {})
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
    .join("\n");

  const log = todayLog
    ? Object.entries(todayLog).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`).join("\n")
    : "No log entries yet.";

  return `You are Nexus, a direct and helpful assistant for Bossman.
Date: ${dateStr}

User memory:
${mem}

Today's activity log:
${log}`;
}

function merge(arr1 = [], arr2 = []) {
  return Array.from(new Set([...(arr1 || []), ...(arr2 || [])]));
}