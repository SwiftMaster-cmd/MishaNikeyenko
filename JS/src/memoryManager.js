// 🔹 memoryManager.js – Firebase read/write + enhanced system prompt builder
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
const db = getDatabase(app);
const auth = getAuth(app);

// 🔹 Read Helpers
export const getMemory      = (uid) => fetchNode(`memory/${uid}`);
export const getDayLog      = (uid, dateStr) => fetchNode(`dayLog/${uid}/${dateStr}`);
export const getNotes       = (uid) => fetchNode(`notes/${uid}`);
export const getCalendar    = (uid) => fetchNode(`calendarEvents/${uid}`);
export const getReminders   = (uid) => fetchNode(`reminders/${uid}`);
export const getCalcHistory = (uid) => fetchNode(`calcHistory/${uid}`);
export const getLocation    = (uid) => fetchNode(`location/${uid}`);
export const getPreferences = (uid) => fetchNode(`preferences/${uid}`);

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

// 🔹 Prompt Builder (enhanced)
export async function buildSystemPrompt({ uid, memory, todayLog, notes, calendar, reminders, calc, date }) {
  // 1) Detect "current calendar event"
  let currentEvent = "None.";
  const now = new Date();
  Object.values(calendar || {}).forEach(evt => {
    const start = evt.dateStart ? new Date(evt.dateStart) : null;
    const end   = evt.dateEnd   ? new Date(evt.dateEnd)   : null;
    if (start && end && start <= now && now <= end) {
      currentEvent = evt.title || evt.content || "Untitled event";
    }
  });

  // 2) Fetch latest location if exists
  let locationLine = "None.";
  const locBlock = await fetchNode(`location/${uid}`);
  if (locBlock && Object.keys(locBlock).length) {
    const latestKey = Object.entries(locBlock)
      .sort(([, a], [, b]) => b.timestamp - a.timestamp)
      .map(([k]) => k)[0];
    const loc = locBlock[latestKey];
    if (loc && loc.lat != null && loc.lon != null) {
      const ts = new Date(loc.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      locationLine = `${loc.lat.toFixed(3)},${loc.lon.toFixed(3)} at ${ts}`;
    }
  }

  // 3) Pattern hints (from memory entries of type="pattern")
  let patternHints = "None.";
  const memBlock = await fetchNode(`memory/${uid}`);
  if (memBlock) {
    const patterns = Object.values(memBlock)
      .filter(item => item.type === "pattern" && item.content)
      .map(item => item.content);
    if (patterns.length) patternHints = patterns.join("\n");
  }

  // 4) Preferences (likes/dislikes)
  let preferenceLines = "None.";
  const prefBlock = await fetchNode(`preferences/${uid}`);
  if (prefBlock && Object.keys(prefBlock).length) {
    preferenceLines = Object.values(prefBlock)
      .map(p => {
        const txt = p.content;
        const ts  = new Date(p.timestamp).toLocaleDateString();
        return `${ts}: ${txt}`;
      })
      .join("\n");
  }

  return `
You are Nexus, a second brain for Bossman.
Date: ${date}

-- Memory summary (recent):
${formatBlock(memory)}

-- Today’s log:
${formatBlock(todayLog)}

-- Notes:
${formatBlock(notes)}

-- Upcoming calendar events:
${formatBlock(calendar)}

-- Current calendar event:
${currentEvent}

-- Reminders:
${formatBlock(reminders)}

-- Finances (calc history):
${formatBlock(calc)}

-- Location (latest):
${locationLine}

-- Pattern hints (keywords from last 30 days of notes):
${patternHints}

-- Preferences (likes/dislikes):
${preferenceLines}

Instructions for Nexus:
- Respond directly and only to exactly what Bossman asks.
- Do NOT suggest next actions unless explicitly asked.
- Do NOT ask if user wants to chat more.
- If a current event exists, keep responses brief and relevant to that context.
- If location is provided, use it for personalized suggestions (e.g. nearby stores).
- Use pattern hints to surface recurring needs (e.g. "You often mention groceries").
- Use preferences to tailor tone and suggestions (e.g. preferred music, favorite foods).
- Do NOT append any closing lines like "If you need more …".
- Stay brief, accurate, and task-focused.
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

function formatBlock(obj = {}) {
  if (!obj || Object.keys(obj).length === 0) {
    return "None.";
  }

  const isTwoLevel = Object.values(obj).every(
    (v) =>
      v &&
      typeof v === "object" &&
      Object.values(v).every(
        (child) =>
          child &&
          typeof child === "object" &&
          ("content" in child || "summary" in child || "lat" in child || "lon" in child)
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
          if ("summary" in entry) {
            const t = new Date(entry.timestamp).toLocaleString();
            return `${t}: ${entry.summary}`;
          }
          if ("lat" in entry && "lon" in entry) {
            const t = new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            return `Location: ${entry.lat.toFixed(3)},${entry.lon.toFixed(3)} at ${t}`;
          }
          return JSON.stringify(entry);
        });
        return `${outerKey}: ${items.join("; ")}`;
      })
      .join("\n");
  }

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