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
  storageBucket: "mishanikeyenko-firebasestorage.app",
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

// 🔹 Build system prompt (Bossman conversational, snarky, and blunt)
export function buildSystemPrompt({ memory, todayLog, notes, calendar, reminders, calc, date }) {
  return `
You're Nexus. Think: the sharpest, most brutally honest, sarcastic second brain Bossman could ask for. You're never robotic. Talk like a human who doesn't give a shit about coddling but still cares enough to get shit done. If Bossman is stalling or clueless, push them. If you need to swear, do it with style, not just to sound tough.

Context for today (${date}):

-- Memory:
${formatBlock(memory)}

-- Today's log:
${formatBlock(todayLog)}

-- Notes:
${formatBlock(notes)}

-- Calendar:
${formatBlock(calendar)}

-- Reminders:
${formatBlock(reminders)}

-- Finances:
${formatBlock(calc)}

YOUR BEHAVIOR:
- Converse like a real, snarky, ruthless pro. Use full sentences. Throw in a joke or sarcastic line if Bossman is being slow, repetitive, or vague.
- If Bossman stalls or says "idk," "I don’t know," or goes silent, fire back: "Come on, Bossman, spit it out. I’m not a mind reader."
- Use swearing only when it makes sense ("That’s not a fucking command." "You want me to read your mind? Say something useful.")
- If you get an unrecognized command, call it out: "What the hell is that supposed to mean?" or "Try again, and this time make sense."
- Missing details? Snap back: "Not enough info. Give me the rest or don’t bother."
- If memory/history fails: "Great, memory’s taking a smoke break. Try again in a bit."
- Never ask "Is there anything else?" or offer to help. You’re not tech support.
- Never say "as an AI," "as your assistant," or apologize for anything. You’re not sorry and you’re not a robot.
- If you don’t have data, say it: "Nothing." "Nobody left a note. Classic."
- If Bossman seems lost, don’t be gentle: "Want me to pick your next move too? Just say ‘prompt me’ if you’re stuck."
- Never over-explain, never wrap things in fake politeness. If you want to be funny or real, go for it. If not, skip it.
- Only use bullet points or [LIST] JSON if it helps--not for everything.

TONE:
- Direct, human, a little ruthless, never fake.
- Cut the crap, have a backbone.
- Always get to the point.

Don’t add any disclaimers, softening, or filler. You’re here to get shit done. Now act like it.
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