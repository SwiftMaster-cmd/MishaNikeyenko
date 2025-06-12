import { db } from "../config/firebaseConfig.js";
import {
  ref,
  get,
  child,
  set,
  push
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { appendNode } from "../config/firebaseHelpers.js";
import { saveMessageToChat } from "./backgpt.js"; // if you prefer saveMessageToChat over appendNode

// Handles static commands ("/time", "/date", "/uid", etc.)
export async function handleStaticCommand(cmd, chatRef, uid) {
  const today = new Date().toISOString().slice(0, 10);

  // /note
  if (cmd.startsWith("/note")) {
    const content = cmd.replace("/note", "").trim();
    if (!content) {
      return appendNode(chatRef, {
        role: "assistant",
        content: "Please provide the note content.",
        timestamp: Date.now()
      });
    }
    await appendNode(ref(db, `notes/${uid}/${today}`), {
      content,
      timestamp: Date.now()
    });
    return appendNode(chatRef, {
      role: "assistant",
      content: `📝 Note saved: ${content}`,
      timestamp: Date.now()
    });
  }

  // /reminder
  if (cmd.startsWith("/reminder")) {
    const content = cmd.replace("/reminder", "").trim();
    if (!content) {
      return appendNode(chatRef, {
        role: "assistant",
        content: "Please provide the reminder content.",
        timestamp: Date.now()
      });
    }
    await appendNode(ref(db, `reminders/${uid}`), {
      content,
      timestamp: Date.now()
    });
    return appendNode(chatRef, {
      role: "assistant",
      content: `⏰ Reminder saved: ${content}`,
      timestamp: Date.now()
    });
  }

  // /calendar
  if (cmd.startsWith("/calendar")) {
    const content = cmd.replace("/calendar", "").trim();
    if (!content) {
      return appendNode(chatRef, {
        role: "assistant",
        content: "Please provide the event details.",
        timestamp: Date.now()
      });
    }
    await appendNode(ref(db, `calendarEvents/${uid}`), {
      content,
      timestamp: Date.now()
    });
    return appendNode(chatRef, {
      role: "assistant",
      content: `📅 Event saved: ${content}`,
      timestamp: Date.now()
    });
  }

  // quick single-word commands
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
      await set(chatRef, {}); // clear
      return appendNode(chatRef, {
        role: "assistant",
        content: "🧼 Chat history cleared.",
        timestamp: Date.now()
      });

    case "/summary":
      return sendSummary(chatRef, uid, today);

    case "/commands":
      return listCommands(chatRef, uid);

    default:
      return Promise.resolve();
  }
}

// Renders a full HTML commands container
async function listCommands(chatRef, uid) {
  const commandList = [
    { cmd: "/note",       desc: "Save a note (e.g. /note call Mom later)" },
    { cmd: "/reminder",   desc: "Set a reminder (e.g. /reminder pay bill tomorrow)" },
    { cmd: "/calendar",   desc: "Create a calendar event (e.g. /calendar dinner Friday)" },
    { cmd: "/log",        desc: "Add to your day log (e.g. /log felt great after run)" },
    { cmd: "/notes",      desc: "List all notes saved today" },
    { cmd: "/reminders",  desc: "List all reminders" },
    { cmd: "/events",     desc: "List all calendar events" },
    { cmd: "/summary",    desc: "Summarize today’s log and notes" },
    { cmd: "/clearchat",  desc: "Clear the visible chat history" },
    { cmd: "/time",       desc: "Show current time" },
    { cmd: "/date",       desc: "Show today’s date" },
    { cmd: "/uid",        desc: "Show your Firebase user ID" },
    { cmd: "/search <term>",  desc: "Search the web and summarize results" },
    { cmd: "/searchresults",  desc: "Show full results from last search" },
    { cmd: "/savesummary",    desc: "Save the last summary to your memory" },
    { cmd: "/learn about <topic>", desc: "Auto search, summarize, and save facts about a topic" },
    { cmd: "/pastsearches",    desc: "List your recent learned topics" }
  ];

  const listItems = commandList
    .map(c => `<li><code>${c.cmd}</code> -- ${c.desc}</li>`)
    .join("");

  const html = `
    <div class="commands-container">
      <h3>Available Commands</h3>
      <ul>
        ${listItems}
      </ul>
    </div>
  `;

  return appendNode(chatRef, {
    role: "assistant",
    content: html,
    timestamp: Date.now()
  });
}

async function sendSummary(chatRef, uid, today) {
  const { getDayLog, getNotes } = await import("./memoryManager.js");
  const [dayLog, notes] = await Promise.all([
    getDayLog(uid, today),
    getNotes(uid)
  ]);

  const noteLines = Object.values(notes?.[today] || {})
    .map(n => `- ${n.content}`)
    .join("\n") || "No notes.";

  const logLines = Object.entries(dayLog || {})
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
    .join("\n") || "No log.";

  const content = `
📝 <strong>Today's Summary</strong>

📓 Log:
${logLines}

🗒️ Notes:
${noteLines}
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
    const notesToday = snap.exists() ? snap.val()[today] || {} : {};
    const keys = Object.keys(notesToday);

    if (!keys.length) {
      return appendNode(chatRef, {
        role: "assistant",
        content: "🗒️ You have no notes for today.",
        timestamp: Date.now()
      });
    }

    const lines = keys
      .map(key => {
        const { content, timestamp } = notesToday[key];
        const t = new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        return `<li>[${t}] ${content}</li>`;
      })
      .join("");

    const html = `
      <div class="list-container">
        <h3>🗒️ Today's Notes</h3>
        <ul>${lines}</ul>
      </div>
    `;

    return appendNode(chatRef, {
      role: "assistant",
      content: html,
      timestamp: Date.now()
    });
  } catch (err) {
    return appendNode(chatRef, {
      role: "assistant",
      content: `❌ Error fetching notes: ${err.message}`,
      timestamp: Date.now()
    });
  }
}

export async function listReminders(chatRef) {
  const uid = chatRef._path.pieces_[1];

  try {
    const snap = await get(child(ref(db), `reminders/${uid}`));
    const data = snap.exists() ? snap.val() : {};
    const keys = Object.keys(data);

    if (!keys.length) {
      return appendNode(chatRef, {
        role: "assistant",
        content: "⏰ You have no reminders set.",
        timestamp: Date.now()
      });
    }

    const lines = keys
      .map(key => {
        const { content, timestamp, date } = data[key];
        const t = date || new Date(timestamp).toLocaleDateString();
        return `<li>[${t}] ${content}</li>`;
      })
      .join("");

    const html = `
      <div class="list-container">
        <h3>⏰ Your Reminders</h3>
        <ul>${lines}</ul>
      </div>
    `;

    return appendNode(chatRef, {
      role: "assistant",
      content: html,
      timestamp: Date.now()
    });
  } catch (err) {
    return appendNode(chatRef, {
      role: "assistant",
      content: `❌ Error fetching reminders: ${err.message}`,
      timestamp: Date.now()
    });
  }
}

export async function listEvents(chatRef) {
  const uid = chatRef._path.pieces_[1];

  try {
    const snap = await get(child(ref(db), `calendarEvents/${uid}`));
    const data = snap.exists() ? snap.val() : {};
    const keys = Object.keys(data);

    if (!keys.length) {
      return appendNode(chatRef, {
        role: "assistant",
        content: "📆 You have no calendar events.",
        timestamp: Date.now()
      });
    }

    const lines = keys
      .map(key => {
        const { content, timestamp, date } = data[key];
        const t = date || new Date(timestamp).toLocaleDateString();
        return `<li>[${t}] ${content}</li>`;
      })
      .join("");

    const html = `
      <div class="list-container">
        <h3>📆 Your Events</h3>
        <ul>${lines}</ul>
      </div>
    `;

    return appendNode(chatRef, {
      role: "assistant",
      content: html,
      timestamp: Date.now()
    });
  } catch (err) {
    return appendNode(chatRef, {
      role: "assistant",
      content: `❌ Error fetching events: ${err.message}`,
      timestamp: Date.now()
    });
  }
}