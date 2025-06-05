import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase,
  ref,
  push,
  onValue,
  remove
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Firebase config (swap with your own config if needed)
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

// Init
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

let notesRef = null;

// DOM Elements
const noteInput = document.getElementById('noteInput');
const notesList = document.getElementById('notesList');
const notesHistory = document.getElementById('notesHistory');

// Sign in and load notes
onAuthStateChanged(auth, (user) => {
  if (!user) {
    signInAnonymously(auth);
    return;
  }
  // Store today's notes under notes/{uid}/{YYYY-MM-DD}
  const todayKey = new Date().toISOString().split('T')[0];
  notesRef = ref(db, `notes/${user.uid}/${todayKey}`);

  // Listen for today's notes
  onValue(notesRef, (snapshot) => {
    const data = snapshot.val() || {};
    renderNotes(Object.entries(data));
  });

  // Optional: Load history (all days except today)
  const allNotesRef = ref(db, `notes/${user.uid}`);
  onValue(allNotesRef, (snapshot) => {
    const data = snapshot.val() || {};
    const historyEntries = Object.entries(data)
      .filter(([key]) => key !== todayKey)
      .flatMap(([date, notes]) =>
        Object.entries(notes).map(([id, note]) => ({
          date, id, ...note
        }))
      );
    renderHistory(historyEntries);
  });
});

// Add note
window.saveNote = function () {
  const content = noteInput.value.trim();
  if (!content || !notesRef) return;
  push(notesRef, {
    content,
    timestamp: Date.now()
  });
  noteInput.value = "";
};

// Render today's notes
function renderNotes(notesArr) {
  notesList.innerHTML = "";
  notesArr
    .sort((a, b) => a[1].timestamp - b[1].timestamp)
    .forEach(([id, note]) => {
      const li = document.createElement('li');
      li.textContent = note.content;

      // Optionally: Add a delete button
      const delBtn = document.createElement('button');
      delBtn.textContent = "🗑️";
      delBtn.style.marginLeft = "1em";
      delBtn.onclick = () => remove(ref(notesRef, id));
      li.appendChild(delBtn);

      notesList.appendChild(li);
    });
}

// Render history notes
function renderHistory(historyArr) {
  notesHistory.innerHTML = "";
  // Sort by date, then timestamp
  historyArr
    .sort((a, b) => b.timestamp - a.timestamp)
    .forEach(note => {
      const li = document.createElement('li');
      li.textContent = `[${note.date}] ${note.content}`;
      notesHistory.appendChild(li);
    });
}