import { auth } from "./firebaseConfig.js";
import {
  editNoteWithHistory,
  deleteNoteWithHistory,
  writeNode,
  appendNode,
} from "./firebaseHelpers.js";

// 📌 Add a new note
export async function addNoteUI(content) {
  const user = auth.currentUser;
  if (!user) return alert("You're not logged in.");

  if (!content || content.trim() === "") {
    return alert("Note content cannot be empty.");
  }

  try {
    const note = {
      content: content.trim(),
      timestamp: Date.now(),
    };
    await appendNode(`notes/${user.uid}`, note);
    alert("Note added successfully.");
  } catch (err) {
    console.error("Add note failed:", err);
    alert("Error adding note. Please try again.");
  }
}

// 📝 Edit an existing note with history
export async function editNoteUI(noteId, newContent) {
  const user = auth.currentUser;
  if (!user) return alert("You're not logged in.");

  if (!noteId || !newContent || newContent.trim() === "") {
    return alert("Invalid edit. Note ID and new content required.");
  }

  try {
    await editNoteWithHistory(user.uid, noteId, newContent.trim());
    alert("Note updated successfully.");
  } catch (err) {
    console.error("Edit failed:", err);
    alert("Failed to update note. Try again.");
  }
}

// 🗑️ Delete a note with history
export async function deleteNoteUI(noteId) {
  const user = auth.currentUser;
  if (!user) return alert("You're not logged in.");
  if (!noteId) return alert("Note ID is missing.");

  const confirmed = confirm("Are you sure you want to delete this note?");
  if (!confirmed) return;

  try {
    await deleteNoteWithHistory(user.uid, noteId);
    alert("Note deleted.");
  } catch (err) {
    console.error("Delete failed:", err);
    alert("Could not delete note. Please retry.");
  }
}