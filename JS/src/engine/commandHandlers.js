import { db } from "../config/firebaseConfig.js";
import {
  ref,
  get,
  child,
  set,
  push
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { encryptContent } from "./encrypt.js";
import { appendNode } from "../config/firebaseHelpers.js";
import { saveMessageToChat } from "./backgpt.js";

// Unified encrypted memory save
async function saveEncryptedMemory(uid, type, rawContent) {
  const id = push(ref(db)).key;
  const encrypted = await encryptContent(rawContent);
  const now = Date.now();

  const metadata = {
    type,
    summary: rawContent.slice(0, 80), // simple summary fallback
    topic: "General",
    category: type,
    tags: [],
    timestamp: now
  };

  await Promise.all([
    set(ref(db, `memoryBlob/${uid}/${id}`), encrypted),
    set(ref(db, `memorySummary/${uid}/${id}`), metadata)
  ]);

  return { id, now };
}

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
    await saveEncryptedMemory(uid, "note", content);
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
    await saveEncryptedMemory(uid, "reminder", content);
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
    await saveEncryptedMemory(uid, "calendar", content);
    return appendNode(chatRef, {
      role: "assistant",
      content: `📅 Event saved: ${content}`,
      timestamp: Date.now()
    });
  }

  // /log
  if (cmd.startsWith("/log")) {
    const content = cmd.replace("/log", "").trim();
    if (!content) {
      return appendNode(chatRef, {
        role: "assistant",
        content: "Please provide the log content.",
        timestamp: Date.now()
      });
    }
    await saveEncryptedMemory(uid, "log", content);
    return appendNode(chatRef, {
      role: "assistant",
      content: `📔 Log entry saved: ${content}`,
      timestamp: Date.now()
    });
  }

  // Single-word commands
  switch (cmd) {
    case "/time":
      return appendNode(chatRef, {
        role: "assistant",
        content: `🕒 Current time is ${new Date().toLocaleTimeString()}`,
        timestamp: Date.now()
      });

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
      await set(chatRef, {});
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

async function listCommands(chatRef, uid) {
  const commandList = [
    { cmd: "/note", desc: "Save a note (e.g. /note call Mom later)" },
    { cmd: "/reminder", desc: "Set a reminder (e.g. /reminder pay bill tomorrow)" },
    { cmd: "/calendar", desc: "Create a calendar event (e.g. /calendar dinner Friday)" },
    { cmd: "/log", desc: "Add to your day log (e.g. /log felt great after run)" },
    { cmd: "/clearchat", desc: "Clear the visible chat history" },
    { cmd: "/summary", desc: "Summarize recent memory entries" },
    { cmd: "/time", desc: "Show current time" },
    { cmd: "/date", desc: "Show today’s date" },
    { cmd: "/uid", desc: "Show your Firebase user ID" },
    { cmd: "/search <term>", desc: "Search the web and summarize results" },
    { cmd: "/searchresults", desc: "Show full results from last search" },
    { cmd: "/savesummary", desc: "Save the last summary to memory" },
    { cmd: "/learn about <topic>", desc: "Auto search, summarize, and save topic" },
    { cmd: "/pastsearches", desc: "List your recent learned topics" }
  ];

  const listItems = commandList.map(c => `<li><code>${c.cmd}</code> -- ${c.desc}</li>`).join("");
  const html = `<div class="commands-container"><h3>Available Commands</h3><ul>${listItems}</ul></div>`;

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
${noteLines}`.trim();

  return appendNode(chatRef, {
    role: "assistant",
    content,
    timestamp: Date.now()
  });
}