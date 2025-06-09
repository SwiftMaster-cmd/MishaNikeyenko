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
  getPastSearches,
  setLastSummary,
  getLastSummary
} from "./learnManager.js";

// ========== Cache ==========
let lastSearchData = { term: null, results: [] };

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

// ========== 4. Handler ==========
form.addEventListener("submit", async e => {
  e.preventDefault();
  let prompt = input.value.trim();
  if (!prompt || !uid) return;
  input.value = "";

  showChatInputSpinner(true);
  window.setStatusFeedback?.("loading", "Thinking...");

  try {
    // Normalize prompt lowercase for commands
    const promptLower = prompt.toLowerCase();

    // 🔹 Static commands
    const quick = ["/time", "/date", "/uid", "/clearchat", "/summary", "/commands"];
    if (quick.includes(promptLower)) {
      await handleStaticCommand(promptLower, chatRef, uid);
      showChatInputSpinner(false);
      return;
    }
    if (promptLower === "/notes") {
      await listNotes(chatRef);
      showChatInputSpinner(false);
      return;
    }
    if (promptLower === "/reminders") {
      await listReminders(chatRef);
      showChatInputSpinner(false);
      return;
    }
    if (promptLower === "/events") {
      await listEvents(chatRef);
      showChatInputSpinner(false);
      return;
    }
    if (promptLower === "/console") {
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

    // 🔹 Save last summary with natural phrase "save that" or "/savesummary"
    if (promptLower === "save that" || promptLower === "/savesummary") {
      const { lastSummary, lastTerm } = getLastSummary();
      if (!lastSummary || !lastTerm) {
        await saveMessageToChat("assistant", "❌ No summary available to save.", uid);
      } else {
        const success = await saveLastSummaryToMemory(uid);
        const msg = success ? `✅ Saved summary about "${lastTerm}".` : "❌ Failed to save summary.";
        await saveMessageToChat("assistant", msg, uid);
      }
      showChatInputSpinner(false);
      return;
    }

    // 🔹 /learn about [topic]
    if (promptLower.startsWith("/learn about ")) {
      const topic = prompt.slice(13).trim();
      if (!topic) {
        await saveMessageToChat("assistant", "❌ No topic provided.", uid);
        showChatInputSpinner(false);
        return;
      }
      await saveMessageToChat("user", prompt, uid);
      const summary = await learnAboutTopic(topic, uid);
      await saveMessageToChat("assistant", `📚 Learned about "${topic}":\n\n${summary}`, uid);
      showChatInputSpinner(false);
      return;
    }

    // 🔹 /pastsearches or natural "show past searches"
    if (promptLower === "/pastsearches" || promptLower.includes("past searches")) {
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

    // 🔹 /search [term] (mandatory prefix)
    if (promptLower.startsWith("/search ")) {
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

      // Cache last summary for saving
      setLastSummary(term, summary);

      await saveMessageToChat("user", prompt, uid);
      await saveMessageToChat("assistant", summary, uid);

      showChatInputSpinner(false);
      return;
    }

    // 🔹 /searchresults
    if (promptLower === "/searchresults") {
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