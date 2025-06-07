// 🔹 gptMemory.js

import { ref, push, get, child } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

export async function askGPT(messages, model="gpt-4o", temp=0.8) {
  const res = await fetch("/.netlify/functions/chatgpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, temperature: temp, messages })
  });
  const json = await res.json();
  return json.choices?.[0]?.message?.content || "[No reply]";
}

export async function saveMemoryIfNeeded(uid, prompt, detectMemoryType, extractJson, today) {
  const { memoryType, rawPrompt } = detectMemoryType(prompt);
  if (!memoryType) return;
  try {
    const resp = await fetch("/.netlify/functions/chatgpt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0.3,
        messages: [
          { role: "system", content: `
You are a memory extraction engine. Return exactly one JSON object:
{ "type":"note"|"reminder"|"calendar"|"log", "content":"…", "date":"optional YYYY-MM-DD" }
` },
          { role: "user", content: memoryType.startsWith("/") ? rawPrompt : prompt }
        ]
      })
    });
    const data = await resp.json();
    const parsed = extractJson(data.choices[0].message.content);
    if (parsed?.type && parsed?.content) {
      const path = parsed.type==="calendar"
        ? `calendarEvents/${uid}`
        : parsed.type==="reminder"
        ? `reminders/${uid}`
        : parsed.type==="log"
        ? `dayLog/${uid}/${today}`
        : `notes/${uid}/${today}`;
      await push(ref(child(ref(null), path)), {
        content: parsed.content,
        timestamp: Date.now(),
        ...(parsed.date ? { date: parsed.date } : {})
      });
    }
  } catch (e) {
    console.error("Memory save failed:", e);
  }
}

export async function maybeSaveSummary(uid) {
  try {
    const snap = await get(child(ref(null), `chatHistory/${uid}`));
    const data = snap.exists() ? snap.val() : {};
    const count = Object.keys(data).length;
    if (count > 0 && count % 20 === 0) {
      const conv = Object.values(data)
        .map(m => `${m.role==="bot"?"Assistant":"User"}: ${m.content}`)
        .slice(-20)
        .join("\n");
      const summary = await askGPT(
        [
          { role: "system", content: "Summarize into one paragraph:" },
          { role: "user",   content: conv }
        ],
        "gpt-4o", 0.5
      );
      await push(ref(child(ref(null), `memory/${uid}`)), {
        summary,
        timestamp: Date.now()
      });
    }
  } catch (e) {
    console.error("Summary failed:", e);
  }
}