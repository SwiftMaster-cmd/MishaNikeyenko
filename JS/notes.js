// notes.js – per-user note system with Firebase Realtime DB

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, push, set, onValue, remove
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  getAuth, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// ---------- 1. Firebase Config ----------
const firebaseConfig = {
  apiKey: "AIzaSyCf_se10RUg8i_u8pdowHlQvrFViJ4jh_Q",
  authDomain: "mishanikeyenko.firebaseapp.com",
  databaseURL: "https://mishanikeyenko-default-rtdb.firebaseio.com",
  projectId: "mishanikeyenko",
  storageBucket: "mishanikeyenko.firebasestorage.app",
  messagingSenderId: "1089190937368",
  appId: "1:1089190937368:web:959c825fc596a5e3ae946d",
  measurementId: "G-L6CC27129C"
};

// ---------- 2. Init Firebase ----------
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

let userNotesRef = null;
let editingId = null;

const noteInput     = document.getElementById('noteInput');
const notesList     = document.getElementById('notesList');
const notesHistory  = document.getElementById('notesHistory');

// ---------- 3. Save Note Handler ----------
window.saveNote = () => {
  const content = noteInput.value.trim();
  if (!content || !userNotesRef) return;

  if (editingId) {
    const editRef = ref(db, `${userNotesRef.key}/${editingId}`);
    set(editRef, { content, timestamp: Date.now() });
    editingId = null;
    console.log("[Notes] Updated");
  } else {
    push(userNotesRef, { content, timestamp: Date.now() });
    console.log("[Notes] Saved");
  }

  noteInput.value = '';
};

// ---------- 4. Render Notes ----------
function renderNotes(notes) {
  notesList.innerHTML = '';
  notesHistory.innerHTML = '';

  const cutoff = Date.now() - 3 * 24 * 60 * 60 * 1000;

  notes.sort((a, b) => b.timestamp - a.timestamp);

  notes.forEach(note => {
    const li = document.createElement('li');
    li.className = 'note-item';

    const summary = document.createElement('div');
    summary.className = 'note-summary';
    summary.textContent = note.content.slice(0, 80) + (note.content.length > 80 ? "..." : "");

    const time = document.createElement('small');
    time.textContent = new Date(note.timestamp).toLocaleString();

    const expand = document.createElement('div');
    expand.className = 'note-expand hidden';
    expand.textContent = note.content;

    const editBtn = document.createElement('button');
    editBtn.textContent = 'Edit';
    editBtn.onclick = () => {
      noteInput.value = note.content;
      editingId = note.id;
      noteInput.focus();
    };

    const delBtn = document.createElement('button');
    delBtn.textContent = 'Delete';
    delBtn.onclick = () => {
      const delRef = ref(db, `${userNotesRef.key}/${note.id}`);
      remove(delRef);
    };

    const actions = document.createElement('div');
    actions.className = 'note-actions';
    actions.append(editBtn, delBtn);

    li.append(summary, time, expand, actions);
    summary.onclick = () => expand.classList.toggle('hidden');

    (note.timestamp >= cutoff ? notesList : notesHistory).appendChild(li);
  });
}

// ---------- 5. Auth + Realtime DB Sync ----------
onAuthStateChanged(auth, (user) => {
  if (!user) {
    console.warn('[Notes] Not signed in');
    return;
  }

  userNotesRef = ref(db, `notes/${user.uid}`);

  onValue(userNotesRef, snapshot => {
    const data = snapshot.val() || {};
    const notes = Object.entries(data).map(([id, val]) => ({ id, ...val }));
    renderNotes(notes);
  });
});