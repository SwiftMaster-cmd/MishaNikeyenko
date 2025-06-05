form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const prompt = input.value.trim();
  if (!prompt || !chatRef || !uid) return;

  // 1. Push the user's new message to Firebase
  const userMsg = {
    role: "user",
    content: prompt,
    timestamp: Date.now()
  };
  await push(chatRef, userMsg);
  input.value = "";
  input.focus();
  scrollToBottom(true);

  // 2. Wait for Firebase to update and get full conversation history
  // (reload all messages for this chat)
  const snapshot = await new Promise(resolve => {
    onValue(chatRef, resolve, { onlyOnce: true });
  });
  const data = snapshot.val() || {};
  const allMessages = Object.entries(data)
    .sort((a, b) => a[1].timestamp - b[1].timestamp)
    .map(([id, msg]) => ({
      role: msg.role,
      content: msg.content
    }));

  // 3. Prepend the latest system prompt (regenerated for every call)
  const today = new Date().toISOString().slice(0, 10);
  const [memory, dayLog, notes, calendar, calc] = await Promise.all([
    getMemory(uid),
    getDayLog(uid, today),
    getNotes(uid),
    getCalendar(uid),
    getCalcHistory(uid)
  ]);
  const systemPrompt = buildSystemPrompt({
    memory,
    todayLog: dayLog,
    notes,
    calendar,
    calc,
    date: today
  });
  // Insert system prompt at the start
  const messages = [
    { role: "system", content: systemPrompt },
    ...allMessages
  ];

  // 4. Add the just-entered message if not in Firebase yet (can skip if always in)
  // (optional - usually already in Firebase)

  // 5. Send all messages to the API
  const res = await fetch("/.netlify/functions/chatgpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages,
      model: "gpt-4o",
      temperature: 0.4
    })
  });

  const dataRes = await res.json();
  const reply = dataRes?.choices?.[0]?.message?.content?.trim() || "No reply.";

  // 6. Push assistant reply to Firebase
  await push(chatRef, {
    role: "assistant",
    content: reply,
    timestamp: Date.now()
  });

  scrollToBottom(true);

  // 7. Optional: trigger day log logic if needed
  if (/\/log|remember this|today|add to log/i.test(prompt)) {
    try {
      const logRes = await fetch("/.netlify/functions/chatgpt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content: "Extract a structured log. Return JSON with: highlights, mood, notes, questions."
            },
            { role: "user", content: prompt }
          ],
          model: "gpt-4o",
          temperature: 0.3
        })
      });

      const raw = await logRes.text();
      const parsed = JSON.parse(raw);
      const extracted = parsed?.choices?.[0]?.message?.content?.trim();
      const logData = JSON.parse(extracted);

      await updateDayLog(uid, today, logData);
    } catch (err) {
      console.warn("🛑 Log failed:", err.message);
    }
  }
});