// 🔹 chatMemory.js -- command parsing and memory write
import { ref, push } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { addDebugMessage } from "./chatUI.js";

export function extractJson(raw) {
  if (!raw) return null;
  const clean = raw.replace(/```json\s*([\s\S]*?)```/gi, '$1').replace(/```([\s\S]*?)```/gi, '$1').trim();
  try {
    return JSON.parse(clean);
  } catch {
    return null;
  }
}

export async function handleMemoryCommand(prompt, uid, today, db) {
  const lower = prompt.toLowerCase();
  const isNote = lower.startsWith("/note ");
  const isReminder = lower.startsWith("/reminder ");
  const isCalendar = lower.startsWith("/calendar ");
  const isLog = lower.startsWith("/log ");

  const shouldSave = isNote || isReminder || isCalendar || isLog;
  const rawPrompt = shouldSave
    ? prompt.replace(/^\/(note|reminder|calendar|log)\s*/i, "").trim()
    : prompt;

  if (!shouldSave) {
    addDebugMessage("🔕 Memory not saved (no command trigger).");
    return null;
  }

  const res = await fetch("/.netlify/functions/chatgpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [
        {
          role: "system",
          content: `You are a memory parser. Extract structured memory from the user input in this exact JSON format:
\`\`\`json
{
  "type": "note",
  "content": "string",
  "date": "optional YYYY-MM-DD"
}
\`\`\`
Only return the JSON block. Supported types: note, calendar, reminder, log.`
        },
        { role: "user", content: rawPrompt }
      ],
      model: "gpt-4o", temperature: 0.3
    })
  });

  const raw = await res.text();
  let parsed, extracted, data;

  try {
    parsed = JSON.parse(raw);
    extracted = parsed?.choices?.[0]?.message?.content;
    data = extractJson(extracted);
  } catch (err) {
    console.warn("[PARSE FAIL]", raw);
    addDebugMessage("❌ JSON parse error.");
    return null;
  }

  if (!data || !data.type || !data.content) {
    console.warn("[MEMORY FAIL]", extracted);
    addDebugMessage("⚠️ GPT returned invalid or incomplete memory structure.");
    return null;
  }

  const path = data.type === "calendar" ? `calendarEvents/${uid}` :
               data.type === "reminder" ? `reminders/${uid}` :
               data.type === "log" ? `dayLog/${uid}/${today}` :
               `notes/${uid}/${today}`;
  const refNode = ref(db, path);
  const entry = {
    content: data.content,
    timestamp: Date.now(),
    ...(data.date ? { date: data.date } : {})
  };
  await push(refNode, entry);
  addDebugMessage(`✅ Memory added to /${data.type}`);
  return data;
}