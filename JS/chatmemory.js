// notesAPI.js

import { getDatabase, ref, get, push } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// Log helper for debugging (shows in browser console)
function logNotes(msg, data) {
  console.log(`[notesAPI] ${msg}`, data || "");
}

// Get all notes for a user, optionally just for today
export async function getNotes(uid, onlyToday = false) {
  if (!uid) {
    logNotes("getNotes called without uid!", uid);
    return {};
  }
  try {
    const db = getDatabase();
    const baseRef = ref(db, `notes/${uid}`);
    const snapshot = await get(baseRef);
    if (!snapshot.exists()) {
      logNotes("No notes for uid", uid);
      return {};
    }
    const data = snapshot.val() || {};
    if (onlyToday) {
      const today = new Date().toISOString().split('T')[0];
      logNotes("Returning today's notes", today);
      return data[today] || {};
    }
    logNotes("Returning all notes", Object.keys(data));
    return data; // all notes by day
  } catch (err) {
    logNotes("Error reading notes", err);
    return {};
  }
}

// Add a note for today
export async function addNote(uid, content) {
  if (!uid) {
    logNotes("addNote called without uid!", uid);
    return false;
  }
  if (!content) {
    logNotes("addNote called with empty content", content);
    return false;
  }
  try {
    const db = getDatabase();
    const today = new Date().toISOString().split('T')[0];
    const todayRef = ref(db, `notes/${uid}/${today}`);
    const out = await push(todayRef, { content, timestamp: Date.now() });
    logNotes("Note written", { uid, today, key: out.key, content });
    return true;
  } catch (err) {
    logNotes("Error writing note", err);
    return false;
  }
}

// Optional: flatten notes object to an array
export function flattenNotes(notesObj) {
  const out = [];
  Object.entries(notesObj || {}).forEach(([date, notes]) => {
    Object.entries(notes || {}).forEach(([id, note]) => {
      out.push({ date, id, ...note });
    });
  });
  logNotes("Flattened notes", out);
  return out;
}