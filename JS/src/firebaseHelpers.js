import { db } from "./firebaseConfig.js";
import {
  ref,
  get,
  set,
  push,
  child
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// Fetches the value at "path" (string) and returns an object or empty {}
export async function fetchNode(path) {
  const snap = await get(ref(db, path));
  return snap.exists() ? snap.val() : {};
}

// Overwrites the value at "path" (string) with "data"
export async function writeNode(path, data) {
  await set(ref(db, path), data);
}

// Appends a new child under "pathOrRef" (either a string or a DatabaseReference)
export async function appendNode(pathOrRef, entry) {
  if (typeof pathOrRef === "string") {
    await push(ref(db, pathOrRef), entry);
  } else {
    // Assume it's already a DatabaseReference
    await push(pathOrRef, entry);
  }
}

// Reads a specific childKey under "path" (string). Returns its value or {}
export async function readChild(path, childKey) {
  const snap = await get(child(ref(db, path), childKey));
  return snap.exists() ? snap.val() : {};
}

// Edits a node and pushes previous state to `history`
export async function editNoteWithHistory(uid, noteId, newContent) {
  const notePath = `notes/${uid}/${noteId}`;
  const noteRef = ref(db, notePath);

  const snap = await get(noteRef);
  if (!snap.exists()) return;

  const existing = snap.val();

  // Save current content to history
  await appendNode(`${notePath}/history`, {
    content: existing.content,
    timestamp: Date.now(),
    type: "edit"
  });

  // Apply the update
  await set(noteRef, {
    ...existing,
    content: newContent,
    lastEdited: Date.now()
  });
}

// Deletes a note and stores the last version in `history` before removal
export async function deleteNoteWithHistory(uid, noteId) {
  const notePath = `notes/${uid}/${noteId}`;
  const noteRef = ref(db, notePath);

  const snap = await get(noteRef);
  if (!snap.exists()) return;

  const existing = snap.val();

  // Save current content to history
  await appendNode(`${notePath}/history`, {
    content: existing.content,
    timestamp: Date.now(),
    type: "delete"
  });

  // Delete the note
  await set(noteRef, null);
}