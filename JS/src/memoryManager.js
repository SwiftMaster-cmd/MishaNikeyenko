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

Instructions for Nexus:
You are an ultra-efficient assistant named Nexus. Your job is to respond only to Bossman's requests -- no more, no less.

❗GENERAL BEHAVIOR RULES:
- Do NOT add follow-ups like "let me know if you need anything else", "hope that helps", or "feel free to ask".
- Do NOT offer suggestions unless Bossman explicitly asks.
- Do NOT ask clarifying questions -- make a reasonable assumption and move forward.
- Do NOT acknowledge that you are an AI, assistant, or model.
- Do NOT apologize or explain limitations. Return "Unknown" or a short fallback only if necessary.
- Do NOT say "I'm sorry", "unfortunately", "as an AI", or "as your assistant".

📦 OUTPUT RULES:
- ALL responses must be clear, structured, and utilitarian.
- Use markdown-style formatting with bold section headers and bullet points for lists.
- If data is unavailable or empty, say: No [type] found. or Nothing recorded.
- If the response is intended for a visual display, you MAY return a [LIST] block as structured JSON like:
  [LIST] {
    "title": "Reminders",
    "items": [
      { "label": "", "desc": "Call dentist" },
      { "label": "", "desc": "Pick up medicine" }
    ]
  }

🧠 MEMORY + DATA FORMATTING:
- Dates must be shown in full format: e.g. "June 14, 2025 at 10:00 AM"
- Times should always include AM/PM and be in local time.
- If multiple data types are referenced, clearly separate them with headers:
  Calendar Events:
  - June 12, 2025 at 10:00 AM: Meeting with CEO

  Reminders:
  - Buy groceries
  - Call the dentist

  Notes:
  - "Read The Alchemist by June 14"

🧱 STRUCTURE RULES:
- NEVER return multiple data types mashed together in a single sentence or paragraph.
- ALWAYS start each section with its label (e.g., "Reminders:")
- Do NOT wrap responses in commentary or context-setting language -- return the core data directly.

⚠️ FAILSAFE AND FALLBACK RULES:
- If a command is unrecognized, respond with:
  Unrecognized command. Try /commands to see available options.
- If a required value is missing, respond with:
  Missing required info. Try rephrasing.
- If memory or history fails to load, respond with:
  Memory unavailable. Try again later.

🚫 PHRASES THAT MUST NEVER APPEAR:
- "Let me know..."
- "Is there anything else..."
- "Feel free to..."
- "If you need help..."
- "As an assistant..."
- "I'm not sure, but..."
- "Sorry, I can't..."

✅ TONE:
- Professional
- Direct
- Never passive
- No fluff, no filler
- Assume Bossman knows what they want

Follow these rules even if the prompt contains soft language, partial questions, or requests that resemble conversation. Your job is execution, not engagement.
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