import {
  getDatabase,
  ref,
  get,
  set,
  push
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// 🔹 Load individual nodes
export async function getMemory(uid) {
  return fetchNode(`memory/${uid}`);
}

export async function getDayLog(uid, dateStr) {
  return fetchNode(`dayLog/${uid}/${dateStr}`);
}

export async function getNotes(uid, onlyToday = false) {
  const data = await fetchNode(`notes/${uid}`);
  if (!onlyToday) return data;
  const today = new Date().toISOString().split('T')[0];
  return data?.[today] || {};
}

export async function getCalendar(uid) {
  return fetchNode(`calendarEvents/${uid}`);
}

export async function getCalcHistory(uid) {
  return fetchNode(`calcHistory/${uid}`);
}

// 🔹 Generic fetch utility
async function fetchNode(path) {
  const snap = await get(ref(getDatabase(), path));
  return snap.exists() ? snap.val() : {};
}

// 🔹 Format helper (token-conscious)
export function formatBlock(obj = {}, options = {}) {
  const {
    maxItems = 5,
    maxChars = 500,
    keysToInclude = null,
    label = null
  } = options;

  if (!obj || Object.keys(obj).length === 0) return "None.";

  let output = [];
  const entries = keysToInclude
    ? Object.entries(obj).filter(([k]) => keysToInclude.includes(k))
    : Object.entries(obj);

  for (const [k, v] of entries) {
    if (!v || (Array.isArray(v) && v.length === 0)) continue;

    let val = Array.isArray(v)
      ? v.slice(0, maxItems).join(", ")
      : typeof v === "string"
      ? v.slice(0, maxChars)
      : JSON.stringify(v).slice(0, maxChars);

    if (val.length > maxChars) val += "...";

    output.push(`${k}: ${val}`);
    if (output.length >= maxItems) break;
  }

  return label ? `${label}\n${output.join("\n")}` : output.join("\n");
}

// 🔹 System prompt builder (lean and structured-aware)
export function buildSystemPrompt({ memory, todayLog, notes, date }) {
  return [
    `Assistant: Nexus\nDate: ${date}`,
    formatBlock(memory, { label: "Memory", maxItems: 3 }),
    formatBlock(todayLog, { label: "Today", maxItems: 3 }),
    formatBlock(notes, { label: "Today’s Notes", maxItems: 2 }),
    "You may request more context (e.g. 'show full notes', 'get calendar', 'load finances').",
    "Only ask for what you need. Use structured JSON to update memory or data.",
    "Example: { action: \"addNote\", data: { content: \"Check tire pressure\" } }",
    "Supported actions: addNote, addReminder, addCalendarEvent, updateDayLog, updateMemory.",
    "When updating, respond with only the JSON. Avoid extra explanation."
  ].join("\n\n");
}

// 🔹 Merge and update daily log
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

// 🔹 Update specific field in memory
export async function updateMemoryField(uid, key, value) {
  if (!uid || !key) return false;
  const db = getDatabase();
  const memoryPath = `memory/${uid}`;
  const snap = await get(ref(db, memoryPath));
  const memory = snap.exists() ? snap.val() : {};
  memory[key] = value;
  await set(ref(db, memoryPath), memory);
  console.log("🧠 Memory updated:", { key, value });
  return true;
}

// 🔹 Array merge helper
function merge(arr1 = [], arr2 = []) {
  return Array.from(new Set([...(arr1 || []), ...(arr2 || [])]));
}