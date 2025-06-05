// notesAPI.js

import { getDatabase, ref, get, push } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// Get all notes for a user, optionally just for today
export async function getNotes(uid, onlyToday = false) {
  if (!uid) return {};
  const db = getDatabase();
  const baseRef = ref(db, `notes/${uid}`);
  const snapshot = await get(baseRef);
  if (!snapshot.exists()) return {};

  const data = snapshot.val() || {};
  if (onlyToday) {
    const today = new Date().toISOString().split('T')[0];
    return data[today] || {};
  }
  return data; // all notes by day
}

// Add a note for today
export async function addNote(uid, content) {
  if (!content || !uid) return false;
  const db = getDatabase();
  const today = new Date().toISOString().split('T')[0];
  const todayRef = ref(db, `notes/${uid}/${today}`);
  await push(todayRef, { content, timestamp: Date.now() });
  return true;
}

// Optional: flatten notes object to an array
export function flattenNotes(notesObj) {
  const out = [];
  Object.entries(notesObj || {}).forEach(([date, notes]) => {
    Object.entries(notes || {}).forEach(([id, note]) => {
      out.push({ date, id, ...note });
    });
  });
  return out;
}