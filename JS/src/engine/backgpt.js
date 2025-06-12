import { ref, push, get, child, remove } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { db } from "../config/firebaseConfig.js";
import {
  getMemory,
  getDayLog,
  getNotes,
  getCalendar,
  getReminders,
  getCalcHistory
} from "./memoryManager.js";
import { extractJson } from "./chatUtils.js";

const todayStr = () => new Date().toISOString().slice(0, 10);
const ASSISTANT_MODEL = "gpt-4o";
const CHEAP_MODEL = "gpt-3.5-turbo";
const LOW_TEMP = 0.3;

// ✅ Log and save chat messages
export async function saveMessageToChat(role, content, uid) {
  console.log(`[CHAT][${role}]`, content);
  await push(ref(db, `chatHistory/${uid}`), {
    role,
    content,
    timestamp: Date.now()
  });
}

// ✅ Get recent messages
export async function fetchLast20Messages(uid) {
  const snap = await get(child(ref(db), `chatHistory/${uid}`));
  if (!snap.exists()) return [];
  return Object.entries(snap.val())
    .map(([_, m]) => ({
      role: m.role === "bot" ? "assistant" : m.role,
      content: m.content,
      timestamp: m.timestamp || 0
    }))
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-20);
}

// ✅ Full memory load
export async function getAllContext(uid) {
  const today = todayStr();
  const [memory, dayLog, notes, calendar, reminders, calc] = await Promise.all([
    getMemory(uid),
    getDayLog(uid, today),
    getNotes(uid),
    getCalendar(uid),
    getReminders(uid),
    getCalcHistory(uid)
  ]);
  return { memory, dayLog, notes, calendar, reminders, calc };
}

// ✅ Assistant GPT reply
export async function getAssistantReply(messages) {
  const res = await fetch("/.netlify/functions/chatgpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, model: ASSISTANT_MODEL, temperature: 0.8 })
  });
  const data = await res.json();
  console.log("[GPT][Assistant Reply]", data);
  return data.choices?.[0]?.message?.content || "[No reply]";
}

// ✅ Extract & Save memory
export async function extractMemoryFromPrompt(prompt, uid) {
  const today = todayStr();
  console.log("[Memory Extract][Input Prompt]:", prompt);

  // Step 1: Get GPT memory extraction
  const gptResponse = await fetch("/.netlify/functions/chatgpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: CHEAP_MODEL,
      temperature: LOW_TEMP,
      messages: [
        {
          role: "system",
          content: `
Extract all memory items from this message. Format:
[
  { "type": "note|reminder|calendar|log", "content": "string", "date": "optional", "time": "optional", "mood": "optional" }
]`
        },
        { role: "user", content: prompt }
      ]
    })
  });

  const raw = await gptResponse.json();
  const gptText = raw.choices?.[0]?.message?.content || "[]";
  console.log("[GPT][Raw Memory Extract]:", gptText);

  const memories = extractJson(gptText);
  if (!Array.isArray(memories)) {
    console.warn("[Memory Extract][Invalid JSON parsed]");
    await saveMessageToChat("assistant", `⚠️ Couldn't extract structured memory. Saving raw note.`, uid);
    await push(ref(db, `notes/${uid}/${today}`), {
      content: prompt,
      timestamp: Date.now()
    });
    return [];
  }

  console.log("[Memory Extract][Parsed Memories]:", memories);

  const promises = memories.map(entry => {
    const { type, content, date, time, recurrence, mood } = entry;
    const path =
      type === "calendar" ? `calendarEvents/${uid}` :
      type === "reminder" ? `reminders/${uid}` :
      type === "log" ? `dayLog/${uid}/${today}` :
      `notes/${uid}/${today}`;

    const data = {
      content,
      timestamp: Date.now(),
      ...(date ? { date } : {}),
      ...(time ? { time } : {}),
      ...(recurrence ? { recurrence } : {}),
      ...(mood ? { mood } : {})
    };

    return push(ref(db, path), data);
  });

  await Promise.all(promises);
  await saveMessageToChat("assistant", `✅ Saved ${memories.length} memory item(s).`, uid);
  return memories;
}

// ✅ Run summary logic
export async function summarizeChatIfNeeded(uid) {
  const snap = await get(child(ref(db), `chatHistory/${uid}`));
  if (!snap.exists()) return;
  const all = Object.entries(snap.val())
    .map(([_, m]) => ({
      role: m.role === "bot" ? "assistant" : m.role,
      content: m.content,
      timestamp: m.timestamp || 0
    }))
    .sort((a, b) => a.timestamp - b.timestamp);

  if (all.length % 20 !== 0) return;

  const block = all.slice(-20).map(m => `${m.role}: ${m.content}`).join("\n");
  const summaryRes = await fetch("/.netlify/functions/chatgpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: CHEAP_MODEL,
      temperature: LOW_TEMP,
      messages: [
        { role: "system", content: "Summarize this block:" },
        { role: "user", content: block }
      ]
    })
  });
  const data = await summaryRes.json();
  const summary = data.choices?.[0]?.message?.content || "[No summary]";
  await push(ref(db, `memory/${uid}`), { summary, timestamp: Date.now() });
}

// ✅ Detect destructive intent
export async function handleDestructiveCommand(prompt, uid) {
  const res = await fetch("/.netlify/functions/chatgpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: CHEAP_MODEL,
      temperature: LOW_TEMP,
      messages: [
        {
          role: "system",
          content: `Detect destructive intent.
Respond only with JSON: { "action": "delete", "target": "reminders" } or { "action": "none" }`
        },
        { role: "user", content: prompt }
      ]
    })
  });

  const raw = await res.json();
  const parsed = extractJson(raw.choices?.[0]?.message?.content || "{}");
  console.log("[Destructive Intent]:", parsed);

  if (parsed?.action === "delete" && parsed?.target) {
    await saveMessageToChat("assistant", `⚠️ Are you sure you want to delete /${parsed.target}? Reply: "Yes, delete ${parsed.target}" to confirm.`, uid);
    return "confirming";
  }

  return "no-action";
}

// ✅ Confirm destructive action
export async function confirmDestructiveAction(prompt, uid) {
  const match = prompt.match(/^yes, delete (\w+)/i);
  if (!match) return false;
  const node = match[1];
  await remove(ref(db, `${node}/${uid}`));
  await saveMessageToChat("assistant", `✅ Deleted everything under /${node}`, uid);
  return true;
}