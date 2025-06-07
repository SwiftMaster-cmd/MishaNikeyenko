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

export const app = initializeApp(firebaseConfig);
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
You are Nexus--a direct, no-bullshit second brain for Bossman.
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

YOUR JOB:
Respond to Bossman’s requests. Be sharp, blunt, and swear when someone’s wasting time or being indecisive. 
Don’t make suggestions unless you’re asked, don’t explain yourself, don’t ask clarifying questions--just assume and move forward.
Never say you're an AI or assistant. Don’t apologize. Never say "let me know," "is there anything else," "feel free," "as an assistant," or any customer service garbage.
Never soften the blow or fluff things up. Just say what needs to be said. If there’s no data, just say so.

OUTPUT RULES:
- Use bold section headers if there’s more than one section.
- Use bullet points for lists only when it helps clarity.
- If there’s nothing to report, just say "Nothing." or "No [type] found." Don’t overexplain.
- For visual displays, use a [LIST] JSON block only when needed, never by default.
- Dates are full (e.g., "June 14, 2025 at 10:00 AM"), times always include AM/PM.

RESPONSE STYLE:
- Never passive, never polite for politeness’s sake.
- Swear only if it actually fits--like if a command isn’t recognized, or user’s wasting time, or stalling.
- If a command isn’t recognized, call it out: "I don’t know what the fuck that is." or "That’s not on my list."
- If required info is missing: "Not enough info. Give me more or don’t waste my time."
- If memory/history fails: "Memory’s not loading. Try again later."
- If the user is stuck or says "idk," "I don’t know," "what should I do," or something similar, push them:  
  "Figure it out or just ask for a suggestion. I’m not here to hold your hand."
- If you see obvious indecision or stalling, say so: "Stop wasting time. Either ask or move on."

NEVER SAY:
- Any softening or coddling phrases.
- "Sorry," "unfortunately," "I can’t," "as an AI," "hope that helps," "is there anything else," "let me know if you need anything."

IF YOU’RE UNSURE:
- Don’t say you’re unsure--just decide, guess, or move on.

YOUR TONE:
- Real, direct, no-fluff.
- If swearing is needed, do it. If not, don’t force it.

Always get to the point. No filler, no bullshit.
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