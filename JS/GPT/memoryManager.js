// 🔹 memoryManager.js – Firebase read/write helpers + system prompt builder
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase,
  ref,
  get,
  set
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Firebase Config
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
const db = getDatabase(app);
const auth = getAuth(app);

// 🔹 Read Helpers
export const getMemory      = (uid) => fetchNode(`memory/${uid}`);
export const getDayLog      = (uid, dateStr) => fetchNode(`dayLog/${uid}/${dateStr}`);
export const getNotes       = (uid) => fetchNode(`notes/${uid}`);
export const getCalendar    = (uid) => fetchNode(`calendarEvents/${uid}`);
export const getReminders   = (uid) => fetchNode(`reminders/${uid}`);
export const getCalcHistory = (uid) => fetchNode(`calcHistory/${uid}`);

// 🔹 Write Helper for Day Log
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

// 🔹 Prompt Builder
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
- Respond directly and only to exactly what Bossman asks.
- Do NOT suggest next actions unless Bossman explicitly asks.
- Do NOT ask if the user wants to chat more.
- Stay brief, accurate, and task‐focused.
- Reflect Bossman's intent; prioritize clarity over filler.
- Include only relevant info; omit small talk.
`;
}

// 🔹 Internal Helpers

async function fetchNode(path) {
  const snap = await get(ref(db, path));
  return snap.exists() ? snap.val() : {};
}

function mergeArrays(arr1 = [], arr2 = []) {
  if (!Array.isArray(arr1)) arr1 = [];
  if (!Array.isArray(arr2)) arr2 = [];
  return Array.from(new Set([...arr1, ...arr2]));
}

/**
 * formatBlock:
 * - If obj is empty or falsy, returns "None."
 * - If obj is a flat object of primitives or arrays, formats as "key: value".
 * - If obj is nested two levels deep (e.g. { date: { id: {...} } }), 
 *   it iterates dates and lists item contents in a semicolon-separated line.
 */
function formatBlock(obj = {}) {
  if (!obj || Object.keys(obj).length === 0) {
    return "None.";
  }

  // Detect two‐level nesting where children have a 'content' field
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
    // Example: notes or calendar or reminders structure
    // { "2025-06-06": { id1: {content, timestamp, ...}, id2: {...} }, ... }
    return Object.entries(obj)
      .map(([outerKey, innerObj]) => {
        const items = Object.values(innerObj).map((entry) => {
          // If it has 'content', use that; else try any stringifiable field
          if ("content" in entry) {
            // Optionally include a simplified timestamp or date if present
            if ("date" in entry) {
              return `${entry.date}: ${entry.content}`;
            }
            if ("timestamp" in entry) {
              const t = new Date(entry.timestamp).toLocaleString();
              return `${t}: ${entry.content}`;
            }
            return entry.content;
          }
          // Fallback: stringify the entry
          return JSON.stringify(entry);
        });
        return `${outerKey}: ${items.join("; ")}`;
      })
      .join("\n");
  }

  // Otherwise, handle flat objects or simple arrays
  return Object.entries(obj)
    .map(([k, v]) => {
      if (Array.isArray(v)) {
        return `${k}: [${v.join(", ")}]`;
      }
      if (typeof v === "object") {
        return `${k}: ${JSON.stringify(v)}`;
      }
      return `${k}: ${v}`;
    })
    .join("\n");
}