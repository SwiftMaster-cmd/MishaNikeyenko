import { get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// Helper for today's date key
function getTodayKey() {
  const d = new Date();
  return d.toISOString().split('T')[0];
}

document.getElementById('summarize-notes-btn').addEventListener('click', async () => {
  const user = auth.currentUser;
  if (!user) return;

  const notesRef = ref(db, `notes/${user.uid}/${getTodayKey()}`);
  document.getElementById('notes-summary').textContent = "Summarizing…";

  // Use get() for a one-time fetch
  const snapshot = await get(notesRef);
  const notesObj = snapshot.val();
  if (!notesObj) {
    document.getElementById('notes-summary').textContent = "No notes for today.";
    return;
  }

  // Gather notes into an array
  const notes = Object.values(notesObj);
  const notesText = notes.map(n => '- ' + n.content).join('\n');

  // Build GPT prompt
  const prompt = `
Here are my notes from today:
${notesText}

Summarize today’s notes into a concise overview.
  `;

  // Call your Netlify function
  const res = await fetch("/.netlify/functions/chatgpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt })
  });

  const data = await res.json();
  const summary = data?.choices?.[0]?.message?.content?.trim() || "No summary returned.";
  document.getElementById('notes-summary').innerHTML = `<strong>Summary:</strong><br>${summary}`;
});