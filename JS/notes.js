// notes.js – per-user note system with Firebase Realtime DB + GPT enrichment

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, push, set, onValue, remove
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  getAuth, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

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
const auth = getAuth(app);

let userNotesRef = null;
let editingId = null;

const noteInput     = document.getElementById('noteInput');
const notesList     = document.getElementById('notesList');
const notesHistory  = document.getElementById('notesHistory');

// 🧠 Send note to GPT for enrichment
async function processWithLLM(noteId, content) {
  try {
    const res = await fetch("/.netlify/functions/gpt-handler", {
      method: "POST",
      body: JSON.stringify({
        prompt: `Organize this note:
"${content}"

Return JSON with:
- category
- tags
- action
- summary`
      }),
      headers: { "Content-Type": "application/json" }
    });

    const result = await res.json();
    const aiData = JSON.parse(result.choices[0].message.content);

    const enrichRef = ref(db, `enrichedNotes/${auth.currentUser.uid}/${noteId}`);
    await set(enrichRef, { ...aiData, original: content, timestamp: Date.now() });
  } catch (e) {
    console.error("[LLM Processing Error]", e);
  }
}

// 💾 Save new or edited note
window.saveNote = async () => {
  const content = noteInput.value.trim();
  if (!content || !userNotesRef) return;

  if (editingId) {
    const editRef = ref(db, `${userNotesRef.key}/${editingId}`);
    await set(editRef, { content, timestamp: Date.now() });
    await processWithLLM(editingId, content);
    editingId = null;
    console.log("[Notes] Updated");
  } else {
    const newRef = push(userNotesRef);
    await set(newRef, { content, timestamp: Date.now() });
    await processWithLLM(newRef.key, content);
    console.log("[Notes] Saved");
  }

  noteInput.value = '';
};

// 🧱 Render notes with enrichment
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
    summary.textContent = note.summary || (note.content.slice(0, 80) + (note.content.length > 80 ? "..." : ""));

    const time = document.createElement('small');
    time.textContent = new Date(note.timestamp).toLocaleString();

    const expand = document.createElement('div');
    expand.className = 'note-expand hidden';
    expand.textContent = note.content;

    const tags = document.createElement('div');
    tags.className = 'note-tags';
    if (note.tags) {
      tags.textContent = "Tags: " + note.tags.join(', ');
    }

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

    li.append(summary, time, tags, expand, actions);
    summary.onclick = () => expand.classList.toggle('hidden');

    (note.timestamp >= cutoff ? notesList : notesHistory).appendChild(li);
  });
}

// 🔄 Sync realtime data
onAuthStateChanged(auth, (user) => {
  if (!user) {
    console.warn('[Notes] Not signed in');
    return;
  }

  userNotesRef = ref(db, `notes/${user.uid}`);
  const enrichedRef = ref(db, `enrichedNotes/${user.uid}`);

  onValue(userNotesRef, noteSnap => {
    const raw = noteSnap.val() || {};
    const baseNotes = Object.entries(raw).map(([id, val]) => ({ id, ...val }));

    onValue(enrichedRef, enrichedSnap => {
      const enriched = enrichedSnap.val() || {};
      const mergedNotes = baseNotes.map(n => ({
        ...n,
        ...(enriched[n.id] || {})
      }));
      renderNotes(mergedNotes);
    });
  });
});