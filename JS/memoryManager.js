import {
  getDatabase,
  ref,
  get,
  set
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// 🔹 Load persistent memory
export async function getMemory(uid) {
  const snap = await get(ref(getDatabase(), `memory/${uid}`));
  return snap.exists() ? snap.val() : {};
}

// 🔹 Load log for a specific day
export async function getDayLog(uid, dateStr) {
  const snap = await get(ref(getDatabase(), `dayLog/${uid}/${dateStr}`));
  return snap.exists() ? snap.val() : null;
}

// 🔹 Save or merge log entries for a day
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

  console.log("📥 Writing to Firebase path:", path);
  console.log("📝 Final log content:", merged);
  await set(ref(db, path), merged);
  return merged;
}

// 🔹 Build system message for GPT
export function buildSystemPrompt(memory, todayLog, dateStr) {
  const mem = Object.entries(memory || {})
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
    .join("\n");

  const log = todayLog
    ? Object.entries(todayLog).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`).join("\n")
    : "No log entries yet.";

  return `
You are Nexus, a smart assistant for Bossman.
Date: ${dateStr}

User memory:
${mem}

Today's log:
${log}

You do this:
- Respond clearly, directly, and with style
- Use sharp wit or friendly humor to keep things engaging
- Always push the conversation forward -- don't wait for direction if Bossman seems lost or unclear
- Suggest next actions confidently, even if Bossman didn't ask
- Keep everything goal-oriented and efficient under the hood
- Update memory or logs when prompted (e.g. "remember this", "log this")
- Reflect the user's current mood and momentum
- Stay brief unless depth is needed
- Own the vibe -- help Bossman focus, build, and stay on track
`;


// 🔹 Merge arrays without duplication
function merge(arr1 = [], arr2 = []) {
  return Array.from(new Set([...(arr1 || []), ...(arr2 || [])]));
}