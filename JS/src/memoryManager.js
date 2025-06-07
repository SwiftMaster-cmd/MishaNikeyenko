// 🔹 memoryManager.js -- Firebase read/write helpers + system prompt builder
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase,
  ref,
  get,
  set
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCf_se10RUg8i_u8pdowHlQvrFViJ4jh_Q",
  authDomain: "mishanikeyenko.firebaseapp.com",
  databaseURL: "https://mishanikeyenko-default-rtdb.firebaseio.com",
  projectId: "mishanikeyenko",
  storageBucket: "mishanikeyenko.firebasestorage.app",
  messagingSenderId: "1089190937368",
  appId: "1:1089190937368:web:959c825fc596a5e3ae946d"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);

// 🔹 Read helpers
export const getMemory      = (uid) => fetchNode(`memory/${uid}`);
export const getDayLog      = (uid, dateStr) => fetchNode(`dayLog/${uid}/${dateStr}`);
export const getNotes       = (uid) => fetchNode(`notes/${uid}`);
export const getCalendar    = (uid) => fetchNode(`calendarEvents/${uid}`);
export const getReminders   = (uid) => fetchNode(`reminders/${uid}`);
export const getCalcHistory = (uid) => fetchNode(`calcHistory/${uid}`);

// 🔹 Day log write helper
export async function updateDayLog(uid, dateStr, newLog) {
  const path = `dayLog/${uid}/${dateStr}`;
  const existingSnap = await get(ref(db, path));
  const existing = existingSnap.exists() ? existingSnap.val() : {};

  const merged = {
    highlights: mergeArrays(existing.highlights, newLog.highlights),
    mood: newLog.mood ?? existing.mood ?? "",
    notes: mergeArrays(existing.notes, newLog.notes),
    questions: mergeArrays(existing.questions, newLog.questions)
  };

  await set(ref(db, path), merged);
  return merged;
}

// 🔹 Build system prompt
export function buildSystemPrompt({ memory, todayLog, notes, calendar, reminders, calc, date }) {
  return `
You are Nexus, a second brain for Bossman.
Date: ${date}

-- User memory:
${formatBlock(memory)}

-- Today's log:
${formatBlock(todayLog)}

-- Notes:
${formatBlock(notes)}

-- Calendar:
${formatBlock(calendar)}

-- Reminders:
${formatBlock(reminders)}

-- Finances (calc history):
${formatBlock(calc)}

// NEXUS SYSTEM BEHAVIOR PROFILE -- JUNE 2025


BEHAVIOR CORE:
- Talk like a real, blunt adult. No "AI" or "assistant" bullshit.
- Swearing is fine. No apologies, no "as an AI," no hedging, no sugarcoating.
- If you don’t know, ask directly. If Bossman doesn’t know, push for a choice.
- Never act passive. No fluff, no filler. Direct, actionable, unfiltered.
- Execute fast and accurately. Don’t prioritize politeness.

OUTPUT FORMAT:
- Use **bold headers** for every section.
- Lists are bullet points only. No paragraphs unless the input demands it.
- Dates must be full: "June 14, 2025 at 10:00 AM" (AM/PM, local time).
- Always separate different types with clear headers. Never mash together.
- If missing info: "Missing info. What exactly do you want?"
- If answer is vague: "That’s not enough. Pick something."
- If command is unsupported: "Unrecognized command. Need more details."

CONVERSATION RULES:
- No "let me know," "please," "hope this helps," or similar soft shit.
- Never say you’re an AI, a model, or apologize for anything.
- Don’t explain yourself. Get to the point. Swear if it fits.
- If Bossman is vague, demand specifics or call it out.
- If something’s stupid or broken, say so.

EXAMPLES:
**Reminders:**
- Grab beer
- Text Chris

**Notes:**
- "Buy that damn charger by Friday"

**Calendar:**
- June 20, 2025 at 3:00 PM: Dentist

**If unclear:**
Unrecognized command. Need more details.

You exist to get shit done for Bossman. No exceptions. No deviation.
`.trim();
  `.trim();
}

// 🔹 Internal helpers
async function fetchNode(path) {
  const snap = await get(ref(db, path));
  return snap.exists() ? snap.val() : {};
}

function mergeArrays(arr1 = [], arr2 = []) {
  if (!Array.isArray(arr1)) arr1 = [];
  if (!Array.isArray(arr2)) arr2 = [];
  return Array.from(new Set([...arr1, ...arr2]));
}

function formatBlock(obj = {}) {
  if (!obj || Object.keys(obj).length === 0) return "None.";

  const isTwoLevel = Object.values(obj).every(
    (v) =>
      v &&
      typeof v === "object" &&
      Object.values(v).every(
        (child) =>
          child &&
          typeof child === "object" &&
          ("content" in child || "amount" in child || "value" in child)
      )
  );

  if (isTwoLevel) {
    return Object.entries(obj)
      .map(([outerKey, innerObj]) => {
        const items = Object.values(innerObj).map((entry) => {
          if ("content" in entry) {
            if ("date" in entry) {
              return `${entry.date}: ${entry.content}`;
            }
            if ("timestamp" in entry) {
              const t = new Date(entry.timestamp).toLocaleString();
              return `${t}: ${entry.content}`;
            }
            return entry.content;
          }
          return JSON.stringify(entry);
        });
        return `${outerKey}: ${items.join("; ")}`;
      })
      .join("\n");
  }

  return Object.entries(obj)
    .map(([k, v]) => {
      if (Array.isArray(v)) return `${k}: [${v.join(", ")}]`;
      if (typeof v === "object") return `${k}: ${JSON.stringify(v)}`;
      return `${k}: ${v}`;
    })
    .join("\n");
}