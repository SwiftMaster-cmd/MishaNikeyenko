import { get, ref } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

document.getElementById('summarize-notes-btn').addEventListener('click', async () => {
  const summaryDiv = document.getElementById('notes-summary');
  summaryDiv.textContent = "Starting summary…";
  console.log("Button clicked.");

  const user = auth.currentUser;
  if (!user) {
    summaryDiv.textContent = "User not authenticated.";
    console.log("No user signed in.");
    return;
  }
  console.log("User UID:", user.uid);

  const allNotesRef = ref(db, `notes/${user.uid}`);
  let allNotesObj;
  try {
    const snapshot = await get(allNotesRef);
    allNotesObj = snapshot.val();
    console.log("allNotesObj:", allNotesObj);
    if (!allNotesObj) {
      summaryDiv.textContent = "No notes found.";
      return;
    }
  } catch (err) {
    summaryDiv.textContent = "Firebase error.";
    console.error("Firebase get() error:", err);
    return;
  }

  // Flatten notes
  const notes = [];
  Object.values(allNotesObj).forEach(dateNotesObj => {
    Object.values(dateNotesObj || {}).forEach(note => {
      if (note && note.content) notes.push(note.content);
    });
  });
  console.log("Flattened notes:", notes);

  if (!notes.length) {
    summaryDiv.textContent = "No notes found.";
    return;
  }

  const notesText = notes.map(n => '- ' + n).join('\n');
  const prompt = `Here are all my notes:\n${notesText}\n\nSummarize these notes into a concise overview.`;
  console.log("Prompt sent to GPT:", prompt);

  // Call Netlify
  let res, data;
  try {
    res = await fetch("/.netlify/functions/chatgpt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt })
    });
    data = await res.json();
    console.log("GPT API response:", data);
  } catch (err) {
    summaryDiv.textContent = "Failed to fetch summary.";
    console.error("Fetch/Netlify error:", err);
    return;
  }

  const summary = data?.choices?.[0]?.message?.content?.trim() || "No summary returned.";
  summaryDiv.innerHTML = `<strong>Summary:</strong><br>${summary}`;
});