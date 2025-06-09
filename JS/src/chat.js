// chat.js – input and flow control only, all UI/logic in modules

import { onValue, ref } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import { db, auth } from "./firebaseConfig.js";
import {
  handleStaticCommand,
  listNotes,
  listReminders,
  listEvents
} from "./commandHandlers.js";
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

// ========== DOM ==========
const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const debugToggle = document.getElementById("debug-toggle");

// ========== Init ==========
initScrollTracking();
if (debugToggle) {
  debugToggle.addEventListener("click", () => window.showDebugOverlay?.());
}

// ========== Auth & Load ==========
let uid = null;
let chatRef = null;

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
    const chatMessages = Object.entries(data)
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

// ========== Helpers for list fallback ==========
function isList(text) {
  return /^(\s*[-*]|\d+\.)\s/m.test(text);
}

function listToHtml(text) {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .map(line => line.replace(/^\s*([-*]|\d+\.)\s*/, "").trim())
    .filter(line => line);
  const items = lines.map(l => `<li>${l}</li>`).join("");
  return `<div class="list-container"><ul>${items}</ul></div>`;
}

// ========== Form Handler ==========
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
          await saveMessageToChat(
            "assistant",
            `✅ Saved preference: "${memory.content}"`,
            uid
          );
          break;
        case "reminder":
          await saveMessageToChat(
            "assistant",
            `✅ Saved reminder: "${memory.content}"`,
            uid
          );
          break;
        case "calendar": {
          const when = memory.date ? ` on ${memory.date}` : "";
          const at = memory.time ? ` at ${memory.time}` : "";
          await saveMessageToChat(
            "assistant",
            `✅ Saved event: "${memory.content}"${when}${at}`,
            uid
          );
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
      lastSearchData = { term, results: data.results };
      const summaryPrompt = [
        { role: "system", content: "You are a concise summarizer. Summarize these search results in one paragraph:" },
        { role: "user", content: JSON.stringify(data.results, null, 2) }
      ];
      const summary = await getAssistantReply(summaryPrompt);
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
    if (prompt === "/savesummary") {
      const success = await saveLastSummaryToMemory(uid);
      const msg = success ? "✅ Summary saved to memory." : "❌ No summary available.";
      await saveMessageToChat("assistant", msg, uid);
      showChatInputSpinner(false);
      return;
    }

    // 🔹 /learn about
    if (prompt.startsWith("/learn about ")) {
      const topic = prompt.slice(13).trim();
      if (!topic) {
        await saveMessageToChat("assistant", "❌ No topic provided.", uid);
        showChatInputSpinner(false);
        return;
      }
      await saveMessageToChat("user", prompt, uid);
      const summary = await learnAboutTopic(topic, uid);
      await saveMessageToChat(
        "assistant",
        `📚 Learned about "${topic}":\n\n${summary}`,
        uid
      );
      showChatInputSpinner(false);
      return;
    }

    // 🔹 /pastsearches
    if (prompt === "/pastsearches") {
      const list = getPastSearches();
      const msg = list.length
        ? `📂 Recent learned topics:\n` +
          list.map(i => `• **${i.topic}** (${new Date(i.timestamp).toLocaleDateString()})`).join("\n")
        : "No past learned topics found.";
      await saveMessageToChat("assistant", msg, uid);
      showChatInputSpinner(false);
      return;
    }

    // 🔹 /commands
    if (prompt === "/commands") {
      const commands = [
        "/note - Save a note",
        "/reminder - Set a reminder",
        "/calendar - Create a calendar event",
        "/log - Add to day log",
        "/notes - List notes",
        "/reminders - List reminders",
        "/events - List events",
        "/summary - Summarize logs",
        "/clearchat - Clear chat history",
        "/time - Show current time",
        "/date - Show today's date",
        "/uid - Show user ID",
        "/search - Web search and summarize",
        "/searchresults - Show last search results",
        "/savesummary - Save last summary",
        "/learn about - Auto search & save facts",
        "/pastsearches - List learned topics"
      ];
      const listHtml = `<div class="commands-container"><h3>Available Commands</h3><ul>${commands
        .map(c => `<li>${c}</li>`)
        .join("")}</ul></div>`;
      await saveMessageToChat("assistant", listHtml, uid);
      showChatInputSpinner(false);
      return;
    }

    // 🔹 Fallback standard conversation + list auto-detect
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
    let reply = await getAssistantReply(full);

    if (isList(reply)) {
      reply = listToHtml(reply);
    } else {
      // wrap raw HTML if any
      reply = `<div>${reply}</div>`;
    }

    await saveMessageToChat("assistant", reply, uid);
    updateHeaderWithAssistantReply(reply);
    await summarizeChatIfNeeded(uid);

  } catch (err) {
    window.setStatusFeedback?.("error", "Something went wrong");
    window.debug?.("[ERROR]", err.message || err);
  } finally {
    showChatInputSpinner(false);
  }
});

// ========== Keyboard Overlay ==========
let buffer = "";
document.addEventListener("keydown", e => {
  const inputEl = document.getElementById("user-input");
  if (
    document.activeElement !== inputEl &&
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