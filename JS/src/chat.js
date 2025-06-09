// 🔹 chat.js – input and flow control only, all UI/logic in modules

import {
  onValue,
  ref,
  push
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
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

import { buildSystemPrompt } from "./memoryManager.js";
import {
  renderMessages,
  showChatInputSpinner,
  scrollToBottom,
  updateHeaderWithAssistantReply,
  initScrollTracking
} from "./uiShell.js";

import { webSearchBrave } from "./search.js";

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

onAuthStateChanged(auth, (user) => {
  if (!user) {
    signInAnonymously(auth)
      .catch(e => window.setStatusFeedback?.("error", "Auth failed."));
    window.setStatusFeedback?.("loading", "Signing in...");
    window.debug?.("Auth: Signing in anonymously...");
    return;
  }
  uid = user.uid;
  chatRef = ref(db, `chatHistory/${uid}`);
  window.debug?.("Auth Ready → UID:", uid);

  onValue(chatRef, (snapshot) => {
    const data = snapshot.val() || {};
    const messages = Object.entries(data).map(([id, msg]) => ({
      id,
      role: msg.role === "bot" ? "assistant" : msg.role,
      content: msg.content,
      timestamp: msg.timestamp || 0
    }));
    renderMessages(messages.slice(-20));
    scrollToBottom();
  });
});

// ========== 4. Submit Handler ==========
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const rawPrompt = input.value.trim();
  if (!rawPrompt || !uid) return;
  input.value = "";

  showChatInputSpinner(true);
  window.setStatusFeedback?.("loading", "Thinking...");
  window.debug?.("[SUBMIT]", { uid, prompt: rawPrompt });

  try {
    // Handle static commands quickly
    const quick = ["/time", "/date", "/uid", "/clearchat", "/summary", "/commands"];
    if (quick.includes(rawPrompt)) {
      await handleStaticCommand(rawPrompt, chatRef, uid);
      window.setStatusFeedback?.("success", "Command executed");
      showChatInputSpinner(false);
      return;
    }
    if (rawPrompt === "/notes") {
      await listNotes(chatRef);
      window.setStatusFeedback?.("success", "Notes listed");
      showChatInputSpinner(false);
      return;
    }
    if (rawPrompt === "/reminders") {
      await listReminders(chatRef);
      window.setStatusFeedback?.("success", "Reminders listed");
      showChatInputSpinner(false);
      return;
    }
    if (rawPrompt === "/events") {
      await listEvents(chatRef);
      window.setStatusFeedback?.("success", "Events listed");
      showChatInputSpinner(false);
      return;
    }
    if (rawPrompt === "/console") {
      if (typeof window.showDebugOverlay === "function") window.showDebugOverlay();
      window.setStatusFeedback?.("success", "Console opened");
      showChatInputSpinner(false);
      return;
    }

    // Handle /search command with Brave Search API
    if (rawPrompt.toLowerCase().startsWith("/search ")) {
      const query = rawPrompt.slice(8).trim();
      if (!query) {
        window.setStatusFeedback?.("error", "Search query missing");
        showChatInputSpinner(false);
        return;
      }
      window.debug?.("[SEARCH] Query:", query);

      // Show user's query as a message in chat UI but do NOT save to Firebase (optional)
      renderMessages([{ role: "user", content: rawPrompt }], true);
      scrollToBottom();

      try {
        const result = await webSearchBrave(query, { count: 6 });
        window.debug?.("[SEARCH RESULT]", result);

        // Format results with improved UI
        let html = `<div class="search-results">
          <span class="results-title">Top Results for "${query}":</span>
          <ul>`;
        for (const r of (result.results || [])) {
          html += `<li>
            <a href="${r.url}" target="_blank" rel="noopener noreferrer">${r.title}</a>
            <span class="snippet">${r.snippet || ""}</span>
          </li>`;
        }
        html += `</ul></div>`;

        // Show results as an assistant message
        await saveMessageToChat("assistant", html, uid);
        renderMessages([{ role: "assistant", content: html }], true);
        scrollToBottom();

        window.setStatusFeedback?.("success", "Search complete");
      } catch (err) {
        window.debug?.("[SEARCH ERROR]", err.message || err);
        await saveMessageToChat("assistant", `Search error: ${err.message || err}`, uid);
        renderMessages([{ role: "assistant", content: `Search error: ${err.message || err}` }], true);
        scrollToBottom();
        window.setStatusFeedback?.("error", "Search failed");
      } finally {
        showChatInputSpinner(false);
      }
      return;
    }

    // Save user message to Firebase (so it shows in chat and logs)
    await saveMessageToChat("user", rawPrompt, uid);
    window.debug?.("[STEP 1] User message saved.");

    // Memory extraction step
    window.debug?.("[STEP 2] Checking for memory...");
    const memory = await extractMemoryFromPrompt(rawPrompt, uid);
    if (memory) {
      window.setStatusFeedback?.("success", `Memory saved (${memory.type})`);
      window.debug?.("[MEMORY]", memory);
    }

    // Fetch context and last messages
    window.debug?.("[STEP 3] Fetching context...");
    const [last20, context] = await Promise.all([
      fetchLast20Messages(uid),
      getAllContext(uid)
    ]);

    const sysPrompt = buildSystemPrompt({
      memory: context.memory,
      todayLog: context.dayLog,
      notes: context.notes,
      calendar: context.calendar,
      reminders: context.reminders,
      calc: context.calc,
      date: new Date().toISOString().slice(0, 10)
    });

    const full = [{ role: "system", content: sysPrompt }, ...last20];
    window.debug?.("[GPT INPUT]", full);

    // Get assistant reply from GPT
    const assistantReply = await getAssistantReply(full);
    await saveMessageToChat("assistant", assistantReply, uid);
    window.logAssistantReply?.(assistantReply);
    updateHeaderWithAssistantReply(assistantReply);

    // Summarize chat if needed
    await summarizeChatIfNeeded(uid);
    window.setStatusFeedback?.("success", "Message sent");

  } catch (err) {
    window.setStatusFeedback?.("error", "Something went wrong");
    window.debug?.("[ERROR]", err.message || err);
  } finally {
    showChatInputSpinner(false);
  }
});

// ========== 5. /console Keyboard Activation ==========
let consoleBuffer = "";

document.addEventListener("keydown", (e) => {
  if (
    document.activeElement !== input &&
    !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey
  ) {
    if (e.key.length === 1) {
      consoleBuffer += e.key;
      if (consoleBuffer.endsWith("/console")) {
        if (typeof window.showDebugOverlay === "function") window.showDebugOverlay();
        consoleBuffer = "";
      } else if (!"/console".startsWith(consoleBuffer)) {
        consoleBuffer = "";
      }
    } else if (e.key === "Escape") {
      consoleBuffer = "";
    }
  }
});