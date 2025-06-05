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

// --- CONFIG ---
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

// --- INIT ---
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// --- DOM ---
const noteInput = document.getElementById('noteInput');
const notesList = document.getElementById('notesList');
const notesHistory = document.getElementById('notesHistory');

// --- HELPERS ---
function todayKey() {
  return new Date().toISOString().split('T')[0];
}

let userId = null;
let todayNotesRef = null;

// --- AUTH FLOW ---
onAuthStateChanged(auth, (user) => {
  if (!user) {
    signInAnonymously(auth);
    return;
  }
  userId = user.uid;
  todayNotesRef = ref(db, `notes/${userId}/${todayKey()}`);

  // Listen for today's notes
  onValue(todayNotesRef, (snapshot) => {
    const data = snapshot.val() || {};
    renderNotes(Object.entries(data));
  });

  // Listen for note history (all previous days)
  const userNotesRef = ref(db, `notes/${userId}`);
  onValue(userNotesRef, (snapshot) => {
    const data = snapshot.val() || {};
    const historyArr = [];
    Object.entries(data).forEach(([date, notes]) => {
      if (date !== todayKey()) {
        Object.entries(notes || {}).forEach(([id, note]) => {
          historyArr.push({ date, id, ...note });
        });
      }
    });
    renderHistory(historyArr);
  });
});

// --- ADD NOTE ---
window.saveNote = function () {
  const content = (noteInput.value || "").trim();
  if (!content || !todayNotesRef) return;
  push(todayNotesRef, {
    content,
    timestamp: Date.now()
  });
  noteInput.value = "";
};

// --- RENDER TODAY'S NOTES ---
function renderNotes(notesArr) {
  notesList.innerHTML = "";
  notesArr
    .sort((a, b) => (a[1]?.timestamp ?? 0) - (b[1]?.timestamp ?? 0))
    .forEach(([id, note]) => {
      if (!note || !note.content) return; // Robust null-check
      const li = document.createElement('li');
      li.textContent = note.content;

      // Delete button
      const delBtn = document.createElement('button');
      delBtn.textContent = "🗑️";
      delBtn.style.marginLeft = "0.7em";
      delBtn.onclick = () => remove(ref(todayNotesRef, id));
      li.appendChild(delBtn);

      notesList.appendChild(li);
    });
}

// --- RENDER HISTORY ---
function renderHistory(historyArr) {
  notesHistory.innerHTML = "";
  historyArr
    .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
    .forEach(note => {
      if (!note || !note.content) return;
      const li = document.createElement('li');
      li.textContent = `[${note.date}] ${note.content}`;
      notesHistory.appendChild(li);
    });
}