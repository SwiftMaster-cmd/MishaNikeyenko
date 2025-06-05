import { get, ref } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// Make sure auth, db are already initialized!

document.getElementById('summarize-notes-btn').addEventListener('click', async () => {
  const summaryDiv = document.getElementById('notes-summary');
  const user = auth.currentUser;
  summaryDiv.textContent = "Summarizing all notes…";

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

    // Flatten all notes from all dates into one array
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

    const prompt = `
Here are all my notes:
${notesText}

Summarize these notes into a concise overview.
    `;

    const res = await fetch("/.netlify/functions/chatgpt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt })
    });
    const data = await res.json();
    const summary = data?.choices?.[0]?.message?.content?.trim() || "No summary returned.";
    summaryDiv.innerHTML = `<strong>Summary:</strong><br>${summary}`;

  } catch (err) {
    summaryDiv.textContent = "Error loading notes or summary.";
    console.error(err);
  }
});