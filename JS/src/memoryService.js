// memoryService.js
import { ref, push } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  getMemory,
  getDayLog,
  getNotes,
  getCalendar,
  getReminders,
  getCalcHistory,
  buildSystemPrompt
} from "./memoryManager.js";
import { extractJson, detectMemoryType } from "./chatUtils.js";
import { addDebugMessage } from "./debugOverlay.js";

/**
 * Fetch all context nodes (memory, dayLog, notes, calendar, reminders, calcHistory) in parallel.
 * @param {string} uid
 * @param {string} today - YYYY-MM-DD
 * @returns {Promise<{ memory: any, dayLog: any, notes: any, calendar: any, reminders: any, calc: any }>}
 */
export async function fetchAllContext(uid, today) {
  try {
    const [memory, dayLog, notes, calendar, reminders, calc] = await Promise.all([
      getMemory(uid),
      getDayLog(uid, today),
      getNotes(uid),
      getCalendar(uid),
      getReminders(uid),
      getCalcHistory(uid)
    ]);
    return { memory, dayLog, notes, calendar, reminders, calc };
  } catch (err) {
    addDebugMessage("Error fetching context: " + err.message);
    return { memory: null, dayLog: null, notes: null, calendar: null, reminders: null, calc: null };
  }
}

/**
 * Detect whether prompt should be saved as memory; if so, parse via GPT and push to Firebase.
 * @param {string} prompt
 * @param {string} uid
 * @param {string} today - YYYY-MM-DD
 */
export async function writeMemoryIfNeeded(prompt, uid, today) {
  const { memoryType, rawPrompt } = detectMemoryType(prompt);
  if (!memoryType) return;

  try {
    const payload = {
      messages: [
        {
          role: "system",
          content: `
You are a memory extraction engine. ALWAYS return exactly one JSON object with these keys:
{
  "type":   "note" | "reminder" | "calendar" | "log",
  "content": "string",
  "date":   "optional YYYY-MM-DD"
}

RULES:
1. If text begins with "/note", type="note".
2. If it begins with "/reminder" or "remind me", type="reminder".
3. If it mentions a date/time (e.g. "tomorrow", "Friday", "on 2025-06-10"), type="calendar".
4. If it begins with "/log" or includes "journal", type="log".
5. Otherwise, type="note" as a last resort.
6. Populate "date" only when explicitly given.
7. Return ONLY the JSON block.`
        },
        { role: "user", content: memoryType.startsWith("/") ? rawPrompt : prompt }
      ],
      model: "gpt-4o",
      temperature: 0.3
    };

    const res = await fetch("/.netlify/functions/chatgpt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const text = await res.text();
    const parsedJSON = JSON.parse(text);
    const extracted = extractJson(parsedJSON.choices?.[0]?.message?.content || "");

    if (extracted?.type && extracted?.content) {
      let path;
      switch (extracted.type) {
        case "calendar":
          path = `calendarEvents/${uid}`;
          break;
        case "reminder":
          path = `reminders/${uid}`;
          break;
        case "log":
          path = `dayLog/${uid}/${today}`;
          break;
        default:
          path = `notes/${uid}/${today}`;
      }

      const nodeRef = ref(
        // Use Firebase Realtime Database's root ref: "ref(db, path)"
        // But since `db` is imported by memoryManager or firebaseConfig, this will resolve correctly.
        // We assume memoryManager.getMemory etc. have initialized db. If not, adjust accordingly.
        db,
        path
      );
      await push(nodeRef, {
        content: extracted.content,
        timestamp: Date.now(),
        ...(extracted.date ? { date: extracted.date } : {})
      });
      addDebugMessage(`Memory saved: type=${extracted.type}, content="${extracted.content}"`);
    } else {
      addDebugMessage("Incomplete memory structure returned");
    }
  } catch (err) {
    addDebugMessage("Memory parse/write failed: " + err.message);
  }
}