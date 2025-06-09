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

// ========== Cache for last search ==========
let lastSearchData = { term: null, results: [] };

// ========== 1. DOM Elements ==========
const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const debugToggle = document.getElementById("debug-toggle");

// ========== 2. Init ==========
initScrollTracking();
if (debugToggle) {
  debugToggle.addEventListener("click", () => {
    if (typeof window.showDebugOverlay === "function") window.showDebugOverlay();
  });
}

// ========== 3. Auth & Chat History ==========
let uid = null;
let chatRef = null;
let chatMessages = [];
let isShowingCommandOutput = false;

onAuthStateChanged(auth, user => {
  if (!user) {
    signInAnonymously(auth).catch(() =>
      window.setStatusFeedback?.("error", "Auth failed.")
    );
    window.setStatusFeedback?.("loading", "Signing in...");
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

    if (!isShowingCommandOutput) {
      renderMessages(chatMessages.slice(-20));
      scrollToBottom();
    }
  });
});

// ========== 4. Submit Handler ==========
form.addEventListener("submit", async e => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt || !uid) return;
  input.value = "";

  if (isShowingCommandOutput) {
    isShowingCommandOutput = false;
    renderMessages(chatMessages.slice(-20));
    scrollToBottom();
  }

  showChatInputSpinner(true);
  window.setStatusFeedback?.("loading", "Thinking...");

  try {
    // 4.1 Static slash commands
    const quick = ["/time", "/date", "/uid", "/clearchat", "/summary", "/commands"];
    if (quick.includes(prompt)) {
      await handleStaticCommand(prompt, chatRef, uid);
      showChatInputSpinner(false);
      return;
    }
    if (prompt === "/notes") {
      isShowingCommandOutput = true;
      await listNotes(chatRef);
      showChatInputSpinner(false);
      return;
    }
    if (prompt === "/reminders") {
      isShowingCommandOutput = true;
      await listReminders(chatRef);
      showChatInputSpinner(false);
      return;
    }
    if (prompt === "/events") {
      isShowingCommandOutput = true;
      await listEvents(chatRef);
      showChatInputSpinner(false);
      return;
    }
    if (prompt === "/console") {
      window.showDebugOverlay?.();
      showChatInputSpinner(false);
      return;
    }

    // 4.2 Memory intents (preference/reminder/calendar/note/log)
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

    // 4.3 /search – summarize results, cache full data
    if (prompt.startsWith("/search ")) {
      const term = prompt.slice(8).trim();
      if (!term) {
        window.setStatusFeedback?.("error", "Search query empty");
        showChatInputSpinner(false);
        return;
      }

      isShowingCommandOutput = true;

      // Fetch raw results
      const data = await webSearchBrave(term, { uid, count: 5 });

      // Cache term + results for later
      lastSearchData.term = term;
      lastSearchData.results = data.results;

      // Summarize top hits via GPT
      const summaryPrompt = [
        { role: "system", content: "You are a concise summarizer. Summarize these search results in one paragraph:" },
        { role: "user", content: JSON.stringify(data.results, null, 2) }
      ];
      const summary = await getAssistantReply(summaryPrompt);

      // Save & render summary + hint
      await saveMessageToChat("user", prompt, uid);
      await saveMessageToChat("assistant", summary, uid);
      await saveMessageToChat("assistant", 'Type `/searchresults` to view full results.', uid);

      renderMessages([
        { role: "user", content: prompt, timestamp: Date.now() },
        { role: "assistant", content: summary, timestamp: Date.now() },
        { role: "assistant", content: 'Type `/searchresults` to view full results.', timestamp: Date.now() }
      ], true);
      scrollToBottom();
      showChatInputSpinner(false);
      return;
    }

    // 4.4 /searchresults – show cached full list
    if (prompt === "/searchresults") {
      isShowingCommandOutput = true;

      if (!lastSearchData.term || lastSearchData.results.length === 0) {
        await saveMessageToChat("assistant", "❌ No previous search. Use `/search <term>` first.", uid);
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
        renderMessages([{ role: "assistant", content: html, timestamp: Date.now() }], true);
        scrollToBottom();
      }

      // Reset so normal chat resumes
      isShowingCommandOutput = false;
      window.setStatusFeedback?.("success", "Displayed full results");
      showChatInputSpinner(false);
      return;
    }

    // 4.5 Standard GPT conversation
    await saveMessageToChat("user", prompt, uid);
    const [last20, ctx] = await Promise.all([
      fetchLast20Messages(uid),
      getAllContext(uid)
    ]);
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

// ========== 5. /console Keyboard Activation ==========
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