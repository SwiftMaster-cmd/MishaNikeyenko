import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase,
  ref,
  get
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Firebase config...
const firebaseConfig = {
  // ... your config
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

const summaryBtn = document.getElementById('summarize-notes-btn');
const summaryDiv = document.getElementById('notes-summary');

let user = null;

onAuthStateChanged(auth, (_user) => {
  if (!_user) {
    signInAnonymously(auth);
    return;
  }
  user = _user;
  // You can enable your button/UI here if you want
});

// --- Summarize All Notes ---
summaryBtn.addEventListener('click', async () => {
  summaryDiv.textContent = "Summarizing all notes...";
  if (!user) {
    summaryDiv.textContent = "User not authenticated.";
    return;
  }

  const allNotesRef = ref(db, `notes/${user.uid}`);
  try {
    const snapshot = await get(allNotesRef);
    const allNotesObj = snapshot.val();
    if (!allNotesObj) {
      summaryDiv.textContent = "No notes found.";
      return;
    }

    // Flatten all notes
    const notes = [];
    Object.values(allNotesObj).forEach(dateNotesObj => {
      Object.values(dateNotesObj || {}).forEach(note => {
        if (note && note.content) notes.push(note.content);
      });
    });

    if (!notes.length) {
      summaryDiv.textContent = "No notes found.";
      return;
    }

    const notesText = notes.map(n => '- ' + n).join('\n');
    const prompt = `Here are all my notes:\n${notesText}\n\nSummarize these notes into a concise overview.`;

    const res = await fetch("/.netlify/functions/chatgpt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt })
    });
    const data = await res.json();
    const summary = data?.choices?.[0]?.message?.content?.trim() || "No summary returned.";
    summaryDiv.innerHTML = `<strong>Summary:</strong><br>${summary}`;

  } catch (err) {
    summaryDiv.textContent = "Failed to summarize notes.";
    console.error(err);
  }
});