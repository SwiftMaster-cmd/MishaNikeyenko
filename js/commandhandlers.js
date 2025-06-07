import { db } from "./firebaseConfig.js";
import {
  ref,
  get,
  child,
  set
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { appendNode } from "./firebaseHelpers.js";

// Handles static commands ("/time", "/date", "/uid", etc.)
export async function handleStaticCommand(cmd, chatRef, uid) {
  const today = new Date().toISOString().slice(0, 10);

  switch (cmd) {
    case "/time": {
      const time = new Date().toLocaleTimeString();
      return appendNode(chatRef, {
        role: "assistant",
        content: `🕒 Current time is ${time}`,
        timestamp: Date.now()
      });
    }

    case "/date":
      return appendNode(chatRef, {
        role: "assistant",
        content: `📅 Today's date is ${today}`,
        timestamp: Date.now()
      });

    case "/uid":
      return appendNode(chatRef, {
        role: "assistant",
        content: `🆔 Your UID is: ${uid}`,
        timestamp: Date.now()
      });

    case "/clearchat":
      return clearChatHistory(chatRef);

    case "/summary":
      return sendSummary(chatRef, uid, today);

    case "/commands":
      return listCommands(chatRef);

    default:
      return Promise.resolve();
  }
}

async function clearChatHistory(chatRef) {
  await set(chatRef, {});
  return appendNode(chatRef, {
    role: "assistant",
    content: "🧼 Chat history cleared.",
    timestamp: Date.now()
  });
}

function listCommands(chatRef) {
  const commandList = [
    { cmd: "/note",     desc: "Save a note (e.g. /note call Mom later)" },
    { cmd: "/reminder", desc: "Set a reminder (e.g. /reminder pay bill tomorrow)" },
    { cmd: "/calendar", desc: "Create a calendar event (e.g. /calendar dinner Friday)" },
    { cmd: "/log",      desc: "Add to your day log (e.g. /log felt great after run)" },
    { cmd: "/notes",    desc: "List all notes saved today" },
    { cmd: "/reminders",desc: "List all reminders" },
    { cmd: "/events",   desc: "List all calendar events" },
    { cmd: "/summary",  desc: "Summarize today’s log and notes" },
    { cmd: "/clearchat",desc: "Clear the visible chat history" },
    { cmd: "/time",     desc: "Show current time" },
    { cmd: "/date",     desc: "Show today’s date" },
    { cmd: "/uid",      desc: "Show your Firebase user ID" }
  ];

  const response = commandList
    .map(c => `🔹 **${c.cmd}** – ${c.desc}`)
    .join("\n");

  return appendNode(chatRef, {
    role: "assistant",
    content: `🧭 **Available Commands**:\n\n${response}`,
    timestamp: Date.now()
  });
}

async function sendSummary(chatRef, uid, today) {
  const { getDayLog, getNotes } = await import("./memoryManager.js");
  const [dayLog, notes] = await Promise.all([
    getDayLog(uid, today),
    getNotes(uid)
  ]);

  const noteList = Object.values(notes?.[today] || {})
    .map(n => `- ${n.content}`)
    .join("\n") || "No notes.";

  const logSummary = Object.entries(dayLog || {})
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
    .join("\n") || "No log.";

  const content = `
📝 **Today’s Summary**:

📓 Log:
${logSummary}

🗒️ Notes:
${noteList}
  `.trim();

  return appendNode(chatRef, {
    role: "assistant",
    content,
    timestamp: Date.now()
  });
}

export async function listNotes(chatRef) {
  const uid = chatRef._path.pieces_[1];
  const today = new Date().toISOString().slice(0, 10);

  try {
    const snap = await get(child(ref(db), `notes/${uid}`));
    const notesForToday = snap.exists() ? snap.val()[today] || {} : {};
    const keys = Object.keys(notesForToday);

    if (!keys.length) {
      return appendNode(chatRef, {
        role: "assistant",
        content: "🗒️ You have no notes for today."
      });
    }

    const lines = keys.map(key => {
      const { content, timestamp } = notesForToday[key];
      const time = new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      return `• [${time}] ${content}`;
    });

    const response = "🗒️ **Today's Notes:**\n" + lines.join("\n");
    return appendNode(chatRef, {
      role: "assistant",
      content: response
    });
  } catch (err) {
    return appendNode(chatRef, {
      role: "assistant",
      content: `❌ Error fetching notes: ${err.message}`
    });
  }
}

export async function listReminders(chatRef) {
  const uid = chatRef._path.pieces_[1];

  try {
    const snap = await get(child(ref(db), `reminders/${uid}`));
    const remData = snap.exists() ? snap.val() : {};
    const keys = Object.keys(remData);

    if (!keys.length) {
      return appendNode(chatRef, {
        role: "assistant",
        content: "⏰ You have no reminders set."
      });
    }

    const lines = keys.map(key => {
      const { content, timestamp, date } = remData[key];
      const time = date || new Date(timestamp).toLocaleDateString();
      return `• [${time}] ${content}`;
    });

    const response = "⏰ **Your Reminders:**\n" + lines.join("\n");
    return appendNode(chatRef, {
      role: "assistant",
      content: response
    });
  } catch (err) {
    return appendNode(chatRef, {
      role: "assistant",
      content: `❌ Error fetching reminders: ${err.message}`
    });
  }
}

export async function listEvents(chatRef) {
  const uid = chatRef._path.pieces_[1];

  try {
    const snap = await get(child(ref(db), `calendarEvents/${uid}`));
    const evData = snap.exists() ? snap.val() : {};
    const keys = Object.keys(evData);

    if (!keys.length) {
      return appendNode(chatRef, {
        role: "assistant",
        content: "📆 You have no calendar events."
      });
    }

    const lines = keys.map(key => {
      const { content, timestamp, date } = evData[key];
      const time = date || new Date(timestamp).toLocaleDateString();
      return `• [${time}] ${content}`;
    });

    const response = "📆 **Your Events:**\n" + lines.join("\n");
    return appendNode(chatRef, {
      role: "assistant",
      content: response
    });
  } catch (err) {
    return appendNode(chatRef, {
      role: "assistant",
      content: `❌ Error fetching calendar events: ${err.message}`
    });
  }
}