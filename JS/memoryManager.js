// /JS/memoryManager.js

import { getDatabase, ref, get, set, update, child } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// 🔐 Load persistent memory
export async function getMemory(uid) {
  const snap = await get(ref(getDatabase(), `memory/${uid}`));
  return snap.exists() ? snap.val() : {};
}

// 📅 Load a specific day's log
export async function getDayLog(uid, dateStr) {
  const snap = await get(ref(getDatabase(), `dayLog/${uid}/${dateStr}`));
  return snap.exists() ? snap.val() : null;
}

// 📆 Load last N days
export async function getWeekLog(uid, days = 7) {
  const db = getDatabase();
  const today = new Date();
  const logs = {};

  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateKey = d.toISOString().slice(0, 10);
    const snap = await get(ref(db, `dayLog/${uid}/${dateKey}`));
    if (snap.exists()) logs[dateKey] = snap.val();
  }

  return logs;
}

// 🧠 Build system prompt with memory + today log
export function buildSystemPrompt(memory, todayLog, dateStr) {
  let memoryBlock = Object.entries(memory || {})
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
    .join("\n");

  let logBlock = todayLog
    ? Object.entries(todayLog).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`).join("\n")
    : "No activity yet today.";

  return `You are Nexus, Bossman's assistant. 
Today is ${dateStr}.
Bossman's persistent memory:
${memoryBlock}

Today's activity:
${logBlock}`;
}

// ✏️ Update or create today's log using GPT response
export async function updateDayLog(uid, dateStr, newLog) {
  const db = getDatabase();
  const path = `dayLog/${uid}/${dateStr}`;
  const currentSnap = await get(ref(db, path));
  const existingLog = currentSnap.exists() ? currentSnap.val() : {};

  const mergedLog = {
    highlights: mergeArrays(existingLog.highlights, newLog.highlights),
    mood: newLog.mood || existingLog.mood || "",
    notes: mergeArrays(existingLog.notes, newLog.notes),
    questions: mergeArrays(existingLog.questions, newLog.questions),
  };

  await set(ref(db, path), mergedLog);
  return mergedLog;
}

// 🔁 Utility: merge unique array values
function mergeArrays(arr1 = [], arr2 = []) {
  return Array.from(new Set([...arr1, ...arr2]));
}