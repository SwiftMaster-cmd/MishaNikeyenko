// 🔹 memoryManager.js -- Minimal stub to isolate memory issues
// No Firebase, no formatting--everything returns empty.

export const getMemory      = async uid => ({});
export const getDayLog      = async (uid, dateStr) => ({});
export const getNotes       = async uid => ({});
export const getCalendar    = async uid => ({});
export const getReminders   = async uid => ({});
export const getCalcHistory = async uid => ({});

export async function updateDayLog(uid, dateStr, newLog) {
  // no-op
  return newLog;
}

export function buildSystemPrompt({ date }) {
  // only the bare minimum system prompt
  return `You are Nexus, a concise assistant for Bossman.
Date: ${date}

Answer exactly what Bossman asks--no small talk.`;
}