// chat.js – input and flow control only, all UI/logic in modules

import { onValue, ref } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import { db, auth } from "./firebaseConfig.js";
import { handleStaticCommand, listNotes, listReminders, listEvents } from "./commandHandlers.js";

import {
  saveMessageToChat,
  fetchLast20Messages,
  getAllContext,
  getAssistantReply,
  extractMemoryFromPrompt,
  summarizeChatIfNeeded
} from "./backgpt.js";

import { webSearchBrave } from "./search.js";
import { buildSystemPrompt } from "./memoryManager.js";
import {
  renderMessages,
  showChatInputSpinner,
  scrollToBottom,
  updateHeaderWithAssistantReply,
  initScrollTracking
} from "./uiShell.js";

import {
  learnAboutTopic,
  saveLastSummaryToMemory,
  getPastSearches
} from "./learnManager.js";

// ========== Cache ==========
let lastSearchData = { term: null, results: [] };
let lastSummaryCache = "";

// ========== 1. DOM ==========
const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const debugToggle = document.getElementById("debug-toggle");

// ========== 2. Init ==========
initScrollTracking();
if (debugToggle) {
  debugToggle.addEventListener("click", () => {
    window.showDebugOverlay?.();
  });
}

// ========== 3. Auth & Load ==========
let uid = null;
let chatRef = null;
let chatMessages = [];

onAuthStateChanged(auth, user => {
  if (!user) {
    signInAnonymously(auth).catch(() =>
      window.setStatusFeedback?.("error", "Auth failed.")
    );
    return;
  }
  uid = user.uid;
  chatRef = ref(db, `chatHistory/${uid}`);

  onValue(chatRef, snapshot => {
    const data = snapshot.val() || {};
    chatMessages = Object.entries(data)
      .map(([id, msg]) => ({
        id,
        role: msg.role === "bot" ? "assistant" : msg.role,
        content: msg.content,
        timestamp: msg.timestamp || 0
      }))
      .sort((a, b) => a.timestamp - b.timestamp);

    renderMessages(chatMessages.slice(-20));
    scrollToBottom();
  });
});

// ========== Helpers for detecting and rendering lists ==========

function isCommandsList(reply) {
  // Check if reply looks like a commands list by simple heuristic:
  return /\/note/.test(reply) && /\/reminder/.test(reply);
}

function renderCommandsListUI() {
  // Static commands list UI markup
  const commands = [
    { cmd: "/note", desc: "Save a note (e.g. /note call Mom later)" },
    { cmd: "/reminder", desc: "Set a reminder (e.g. /reminder pay bill tomorrow)" },
    { cmd: "/calendar", desc: "Create a calendar event (e.g. /calendar dinner Friday)" },
    { cmd: "/log", desc: "Add to your day log (e.g. /log felt great after run)" },
    { cmd: "/notes", desc: "List all notes saved today" },
    { cmd: "/reminders", desc: "List all reminders" },
    { cmd: "/events", desc: "List all calendar events" },
    { cmd: "/summary", desc: "Summarize today’s log and notes" },
    { cmd: "/clearchat", desc: "Clear the visible chat history" },
    { cmd: "/time", desc: "Show current time" },
    { cmd: "/date", desc: "Show today’s date" },
    { cmd: "/uid", desc: "Show your Firebase user ID" }
  ];

  let html = `<div class="commands-container"><div class="commands-title">Available Commands</div><ul class="commands-list">`;
  for (const c of commands) {
    html += `<li><code>${c.cmd}</code>: ${c.desc}</li>`;
  }
  html += "</ul></div>";
  return html;
}

// ========== 4. Handler ==========
form.addEventListener("submit", async e => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt || !uid) return;
  input.value = "";

  showChatInputSpinner(true);
  window.setStatusFeedback?.("loading", "Thinking...");

  try {
    // 🔹 Static commands
    const quick = ["/time", "/date", "/uid", "/clearchat", "/summary", "/commands"];
    if (quick.includes(prompt)) {
      await handleStaticCommand(prompt, chatRef, uid);
      showChatInputSpinner(false);
      return;
    }
    if (prompt === "/notes") {
      await listNotes(chatRef);
      showChatInputSpinner(false);
      return;
    }
    if (prompt === "/reminders") {
      await listReminders(chatRef);
      showChatInputSpinner(false);
      return;
    }
    if (prompt === "/events") {
      await listEvents(chatRef);
      showChatInputSpinner(false);
      return;
    }
    if (prompt === "/console") {
      window.showDebugOverlay?.();
      showChatInputSpinner(false);
      return;
    }

    // 🔹 Memory intents
    const memory = await extractMemoryFromPrompt(prompt, uid);
    if (memory) {
      await saveMessageToChat("user", prompt, uid);
      switch (memory.type) {
        case "preference":
          await saveMessageToChat("assistant", `✅ Saved preference: "${memory.content}"`, uid);
          break;
        case "reminder":
          await saveMessageToChat("assistant", `✅ Saved reminder: "${memory.content}"`, uid);
          break;
        case "calendar": {
          const when = memory.date ? ` on ${memory.date}` : "";
          const at = memory.time ? ` at ${memory.time}` : "";
          await saveMessageToChat("assistant", `✅ Saved event: "${memory.content}"${when}${at}`, uid);
          break;
        }
        case "note":
          await handleStaticCommand(`/note ${memory.content}`, chatRef, uid);
          break;
        case "log":
          await handleStaticCommand(`/log ${memory.content}`, chatRef, uid);
          break;
      }
      showChatInputSpinner(false);
      return;
    }

    // 🔹 /search
    if (prompt.startsWith("/search ")) {
      const term = prompt.slice(8).trim();
      if (!term) {
        window.setStatusFeedback?.("error", "Search query empty");
        showChatInputSpinner(false);
        return;
      }

      const data = await webSearchBrave(term, { uid, count: 5 });
      lastSearchData.term = term;
      lastSearchData.results = data.results;

      const summaryPrompt = [
        { role: "system", content: "You are a concise summarizer. Summarize these search results in one paragraph:" },
        { role: "user", content: JSON.stringify(data.results, null, 2) }
      ];
      const summary = await getAssistantReply(summaryPrompt);
      lastSummaryCache = summary;

      await saveMessageToChat("user", prompt, uid);
      await saveMessageToChat("assistant", summary, uid);

      showChatInputSpinner(false);
      return;
    }

    // 🔹 /searchresults
    if (prompt === "/searchresults") {
      if (!lastSearchData.term) {
        await saveMessageToChat("assistant", "❌ No previous search found.", uid);
      } else {
        let html = `<div class="search-results"><div class="results-title">Results for "${lastSearchData.term}"</div><ul>`;
        for (const r of lastSearchData.results) {
          html += `<li>
            <a href="${r.url}" target="_blank" rel="noopener noreferrer">${r.title}</a>
            ${r.snippet ? `<div class="snippet">${r.snippet}</div>` : ""}
            <div class="result-url">${r.url}</div>
          </li>`;
        }
        html += `</ul></div>`;
        await saveMessageToChat("assistant", html, uid);
      }
      showChatInputSpinner(false);
      return;
    }

    // 🔹 /savesummary
    if (prompt === "/savesummary" || prompt.toLowerCase() === "save that") {
      if (!lastSummaryCache) {
        await saveMessageToChat("assistant", "❌ No summary available to save.", uid);
      } else {
        const success = await saveLastSummaryToMemory(uid);
        if (success) {
          await saveMessageToChat("assistant", "✅ Summary saved to memory.", uid);
          lastSummaryCache = ""; // Clear after saving
        } else {
          await saveMessageToChat("assistant", "❌ Failed to save summary.", uid);
        }
      }
      showChatInputSpinner(false);
      return;
    }

    // 🔹 /learn about
    if (prompt.toLowerCase().startsWith("learn ")) {
      const topic = prompt.slice(6).trim();
      if (!topic) {
        await saveMessageToChat("assistant", "❌ No topic provided to learn.", uid);
        showChatInputSpinner(false);
        return;
      }
      await saveMessageToChat("user", prompt, uid);
      const summary = await learnAboutTopic(topic, uid);
      lastSummaryCache = summary;
      await saveMessageToChat("assistant", `📚 Learned about "${topic}":\n\n${summary}`, uid);
      showChatInputSpinner(false);
      return;
    }

    // 🔹 /pastsearches or "show my past searches"
    if (
      prompt === "/pastsearches" ||
      /show my past searches/i.test(prompt) ||
      /list my past searches/i.test(prompt)
    ) {
      const list = await getPastSearches(uid);
      if (!list.length) {
        await saveMessageToChat("assistant", "No past learned topics found.", uid);
      } else {
        const msg = list
          .map(i => `• **${i.topic}** (${new Date(i.timestamp).toLocaleDateString()})`)
          .join("\n");
        await saveMessageToChat("assistant", `📂 Recent learned topics:\n${msg}`, uid);
      }
      showChatInputSpinner(false);
      return;
    }

    // 🔹 Fallback: Standard conversation
    await saveMessageToChat("user", prompt, uid);
    const [last20, ctx] = await Promise.all([fetchLast20Messages(uid), getAllContext(uid)]);
    const sysPrompt = buildSystemPrompt({
      memory: ctx.memory,
      todayLog: ctx.dayLog,
      notes: ctx.notes,
      calendar: ctx.calendar,
      reminders: ctx.reminders,
      calc: ctx.calc,
      date: new Date().toISOString().slice(0, 10)
    });
    const full = [{ role: "system", content: sysPrompt }, ...last20];
    const reply = await getAssistantReply(full);

    // Detect commands list and render UI instead of raw text
    let displayReply = reply;
    if (isCommandsList(reply)) {
      displayReply = renderCommandsListUI();
    }

    await saveMessageToChat("assistant", displayReply, uid);
    updateHeaderWithAssistantReply(displayReply);
    await summarizeChatIfNeeded(uid);
  } catch (err) {
    window.setStatusFeedback?.("error", "Something went wrong");
    window.debug?.("[ERROR]", err.message || err);
  } finally {
    showChatInputSpinner(false);
  }
});

// ========== 5. Keyboard Overlay ==========
let buffer = "";
document.addEventListener("keydown", e => {
  if (
    document.activeElement !== input &&
    !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey
  ) {
    if (e.key.length === 1) {
      buffer += e.key;
      if (buffer.endsWith("/console")) {
        window.showDebugOverlay?.();
        buffer = "";
      } else if (!"/console".startsWith(buffer)) {
        buffer = "";
      }
    } else if (e.key === "Escape") {
      buffer = "";
    }
  }
});