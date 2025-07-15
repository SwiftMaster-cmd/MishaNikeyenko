import { getDatabase, ref, set, push, update, remove, onValue } from "firebase/database";
import { getAuth } from "firebase/auth";
import { auth } from './firebaseConfig.js';
import { editNoteWithHistory, deleteNoteWithHistory } from './firebaseHelpers.js';

// Example usage:
const user = auth.currentUser;
if (user) {
  await editNoteWithHistory(user.uid, "note123", "Updated content here");
  await deleteNoteWithHistory(user.uid, "note456");
}
const db = getDatabase();
const auth = getAuth();

function addNote(content) {
  const user = auth.currentUser;
  if (!user) return alert("Not logged in");

  const noteRef = ref(db, `notes/${user.uid}`);
  const newNoteRef = push(noteRef);
  set(newNoteRef, {
    content,
    timestamp: Date.now()
  });
}

function editNote(noteId, newContent) {
  const user = auth.currentUser;
  if (!user) return;

  const notePath = `notes/${user.uid}/${noteId}`;
  const noteRef = ref(db, notePath);

  // Save old content to history before updating
  onValue(noteRef, (snapshot) => {
    const existing = snapshot.val();
    if (!existing) return;

    const historyRef = ref(db, `${notePath}/history`);
    const editEntry = {
      content: existing.content,
      editedAt: Date.now()
    };

    push(historyRef, editEntry); // Save edit to history

    update(noteRef, {
      content: newContent,
      lastEdited: Date.now()
    });
  }, { onlyOnce: true });
}

function deleteNote(noteId) {
  const user = auth.currentUser;
  if (!user) return;

  const notePath = `notes/${user.uid}/${noteId}`;
  const noteRef = ref(db, notePath);

  // Save to history before delete
  onValue(noteRef, (snapshot) => {
    const existing = snapshot.val();
    if (!existing) return;

    const historyRef = ref(db, `${notePath}/history`);
    const deleteEntry = {
      content: existing.content,
      deletedAt: Date.now()
    };

    push(historyRef, deleteEntry).then(() => {
      remove(noteRef);
    });
  }, { onlyOnce: true });
}