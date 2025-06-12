import { ref, push, get, child, remove } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { db, auth } from "../config/firebaseConfig.js";
import {
  getMemory,
  getDayLog,
  getNotes,
  getCalendar,
  getReminders,
  getCalcHistory
} from "./memoryManager.js";
import { extractJson, detectMemoryType } from "./chatUtils.js";

const todayStr = () => new Date().toISOString().slice(0, 10);
const ASSISTANT_MODEL = "gpt-4o";
const CHEAP_MODEL     = "gpt-3.5-turbo";
const LOW_TEMP        = 0.3;

// ✅ Save chat messages
export async function saveMessageToChat(role, content, uid) {
  await push(ref(db, `chatHistory/${uid}`), {
    role,
    content,
    timestamp: Date.now()
  });
}

// ✅ Get last 20 chat messages
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

// ✅ Get all context data
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

// ✅ Call GPT for replies
export async function getAssistantReply(fullMessages) {
  const res = await fetch("/.netlify/functions/chatgpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: fullMessages,
      model: ASSISTANT_MODEL,
      temperature: 0.8
    })
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "[No reply]";
}

// ✅ Extract + save multiple memory items from input
export async function extractMemoryFromPrompt(prompt, uid) {
  const today = todayStr();

  const extractionRes = await fetch("/.netlify/functions/chatgpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: CHEAP_MODEL,
      temperature: LOW_TEMP,
      messages: [
        {
          role: "system",
          content: `
You're a memory extractor. Convert this user input into an array of memory entries.

Each must include:
- "type": "note" | "reminder" | "calendar" | "log"
- "content": string

Optional: "date", "time", "recurrence", "mood"

Respond only with JSON:
[
  { "type": "reminder", "content": "Cancel Prime", "date": "2025-06-14" },
  { "type": "log", "content": "Felt burnt out", "mood": "tired" }
]`
        },
        { role: "user", content: prompt }
      ]
    })
  });

  const raw = await extractionRes.json();
  const gptReply = raw.choices?.[0]?.message?.content || "[]";
  console.log("[extractMemoryFromPrompt] GPT reply:", gptReply);

  const memories = extractJson(gptReply);
  if (!Array.isArray(memories) || !memories.length) {
    await saveMessageToChat("assistant", "⚠️ I couldn't extract any memory from that.", uid);
    return [];
  }

  const promises = memories.map(entry => {
    const { type, content, date, time, recurrence, mood } = entry;
    const path = (
      type === "calendar" ? `calendarEvents/${uid}` :
      type === "reminder" ? `reminders/${uid}` :
      type === "log"      ? `dayLog/${uid}/${today}` :
                           `notes/${uid}/${today}`
    );

    const payload = {
      content,
      timestamp: Date.now(),
      ...(date ? { date } : {}),
      ...(time ? { time } : {}),
      ...(recurrence ? { recurrence } : {}),
      ...(mood ? { mood } : {})
    };

    return push(ref(db, path), payload);
  });

  await Promise.all(promises);
  await saveMessageToChat("assistant", `✅ Saved ${memories.length} memory item(s).`, uid);
  return memories;
}

// ✅ Summarize every 20 messages
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
        { role: "system", content: "Summarize this block in one paragraph:" },
        { role: "user", content: block }
      ]
    })
  });

  const summaryData = await summaryRes.json();
  const summary = summaryData.choices?.[0]?.message?.content || "[No summary]";
  await push(ref(db, `memory/${uid}`), { summary, timestamp: Date.now() });
}

// ✅ Detect if user wants a destructive action
export async function handleDestructiveCommand(prompt, uid) {
  const intentRes = await fetch("/.netlify/functions/chatgpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: CHEAP_MODEL,
      temperature: LOW_TEMP,
      messages: [
        {
          role: "system",
          content: `You're an intent recognizer. Return:
{ "action": "delete", "target": "reminders" } for deletion requests.
Or: { "action": "none" } if it's not destructive. Only JSON.`
        },
        { role: "user", content: prompt }
      ]
    })
  });

  const intentRaw = await intentRes.json();
  const intent = extractJson(intentRaw.choices?.[0]?.message?.content || "{}");

  if (intent?.action === "delete" && intent.target) {
    const node = intent.target;
    await saveMessageToChat("assistant", `⚠️ Are you sure you want to delete all data from /${node}? Reply: "Yes, delete ${node}" to confirm.`, uid);
    return "confirming";
  }

  return "no-action";
}

// ✅ Confirm deletion if user says yes
export async function confirmDestructiveAction(confirmPrompt, uid) {
  const match = confirmPrompt.match(/^yes, delete (\w+)/i);
  if (!match) return false;

  const node = match[1];
  await remove(ref(db, `${node}/${uid}`));
  await saveMessageToChat("assistant", `✅ All data under /${node} has been deleted.`, uid);
  return true;
}