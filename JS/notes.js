/* /JS/profile.js  – unified profile / auth helper */
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js";
import { getDatabase, ref as dbRef, get, child } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-database.js";

/* -- Firebase Config -- */
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

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const notesRef = ref(db, 'notes');

const noteInput = document.getElementById('noteInput');
const notesList = document.getElementById('notesList');

let editingId = null;

window.saveNote = () => {
  const content = noteInput.value.trim();
  if (!content) return;

  if (editingId) {
    const editRef = ref(db, `notes/${editingId}`);
    set(editRef, { content, timestamp: Date.now() });
    editingId = null;
    console.log("Updated note.");
  } else {
    push(notesRef, { content, timestamp: Date.now() });
    console.log("Created new note.");
  }

  noteInput.value = '';
};

function renderNotes(notes) {
  const notesList = document.getElementById('notesList');
  const notesHistory = document.getElementById('notesHistory');

  notesList.innerHTML = '';
  notesHistory.innerHTML = '';

  notes.sort((a, b) => b.timestamp - a.timestamp);

  const cutoff = Date.now() - 1000 * 60 * 60 * 24 * 3; // 3 days ago

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
    delBtn.onclick = () => remove(ref(db, `notes/${note.id}`));

    const actions = document.createElement('div');
    actions.className = 'note-actions';
    actions.append(editBtn, delBtn);

    li.append(summary, time, expand, actions);
    summary.onclick = () => expand.classList.toggle('hidden');

    // Append to recent or history
    (note.timestamp >= cutoff ? notesList : notesHistory).appendChild(li);
  });
}
onValue(notesRef, snapshot => {
  const data = snapshot.val() || {};
  const notes = Object.entries(data).map(([id, val]) => ({ id, ...val }));
  renderNotes(notes);
});