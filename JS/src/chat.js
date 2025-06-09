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

import { renderSearchResults } from "./searchResults.js"; // import your search results renderer

// ========== 1. DOM Elements ==========
const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const debugToggle = document.getElementById("debug-toggle");
const chatLog = document.getElementById("chat-log");

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

// ========== 4. Helper to append search results as chat message ==========
function appendSearchResults(results, container) {
  if (!results || results.length === 0) {
    appendAssistantMessage("No search results found.");
    return;
  }
  // Render search results HTML
  const wrapper = document.createElement("div");
  wrapper.className = "assistant-msg msg search-results-wrapper";

  // Use your searchResults renderer, but get HTML as string:
  const resultsHTML = results.map(r => `
    <div class="search-result-card">
      <div class="result-title">
        <a href="${r.url}" target="_blank" rel="noopener noreferrer">${r.title}</a>
      </div>
      <div class="result-snippet">${r.snippet}</div>
    </div>
  `).join('');
  wrapper.innerHTML = resultsHTML;

  chatLog.appendChild(wrapper);
  scrollToBottom();
}

// ========== 5. Helper to append assistant messages ==========
function appendAssistantMessage(text) {
  const message = document.createElement("div");
  message.className = "assistant-msg msg";
  message.textContent = text;
  chatLog.appendChild(message);
  scrollToBottom();
}

// ========== 6. Submit Handler ==========
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt || !uid) return;
  input.value = "";

  showChatInputSpinner(true);
  window.setStatusFeedback?.("loading", "Thinking...");
  window.debug?.("[SUBMIT]", { uid, prompt });

  try {
    // Static Commands
    const quick = ["/time", "/date", "/uid", "/clearchat", "/summary", "/commands"];
    if (quick.includes(prompt)) {
      await handleStaticCommand(prompt, chatRef, uid);
      window.setStatusFeedback?.("success", "Command executed");
      showChatInputSpinner(false);
      return;
    }
    if (prompt === "/notes") {
      await listNotes(chatRef);
      window.setStatusFeedback?.("success", "Notes listed");
      showChatInputSpinner(false);
      return;
    }
    if (prompt === "/reminders") {
      await listReminders(chatRef);
      window.setStatusFeedback?.("success", "Reminders listed");
      showChatInputSpinner(false);
      return;
    }
    if (prompt === "/events") {
      await listEvents(chatRef);
      window.setStatusFeedback?.("success", "Events listed");
      showChatInputSpinner(false);
      return;
    }
    if (prompt === "/console") {
      if (typeof window.showDebugOverlay === "function") window.showDebugOverlay();
      window.setStatusFeedback?.("success", "Console opened");
      showChatInputSpinner(false);
      return;
    }

    // ===== Custom: Search Command =====
    if (prompt.startsWith("/search ")) {
      const query = prompt.replace("/search ", "").trim();
      if (!query) {
        appendAssistantMessage("Please provide a search query.");
        showChatInputSpinner(false);
        return;
      }
      window.debug?.("[SEARCH] Query:", query);

      // Save user search prompt to chat DB
      await saveMessageToChat("user", prompt, uid);
      window.debug?.("[STEP 1] User search message saved.");

      // Perform search (import your webSearchBrave from search.js accordingly)
      import("./search.js").then(async ({ webSearchBrave }) => {
        try {
          const searchData = await webSearchBrave(query, { count: 5 });
          // Save search results summary as assistant message in chat DB (optional)
          await saveMessageToChat("assistant", `[Search results for "${query}"]`, uid);

          // Append the search results visually in chat log
          appendSearchResults(searchData.results, chatLog);

          window.setStatusFeedback?.("success", "Search results displayed");
        } catch (searchErr) {
          window.debug?.("[SEARCH ERROR]", searchErr.message || searchErr);
          appendAssistantMessage(`Search error: ${searchErr.message || "Failed to fetch results"}`);
          window.setStatusFeedback?.("error", "Search failed");
        }
      });

      showChatInputSpinner(false);
      return;
    }

    // Normal chat flow:
    // Step 1: Save user message
    await saveMessageToChat("user", prompt, uid);
    window.debug?.("[STEP 1] User message saved.");

    // Step 2: Try memory extraction
    window.debug?.("[STEP 2] Checking for memory...");
    const memory = await extractMemoryFromPrompt(prompt, uid);
    if (memory) {
      window.setStatusFeedback?.("success", `Memory saved (${memory.type})`);
      window.debug?.("[MEMORY]", memory);
    }

    // Step 3: Build assistant prompt
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

    // Step 4: Get assistant reply
    const assistantReply = await getAssistantReply(full);
    await saveMessageToChat("assistant", assistantReply, uid);
    window.logAssistantReply?.(assistantReply);
    updateHeaderWithAssistantReply(assistantReply);

    // Step 5: Summarize if needed
    await summarizeChatIfNeeded(uid);
    window.setStatusFeedback?.("success", "Message sent");
  } catch (err) {
    window.setStatusFeedback?.("error", "Something went wrong");
    window.debug?.("[ERROR]", err.message || err);
  } finally {
    showChatInputSpinner(false);
  }
});

// ========== 7. /console Keyboard Activation ==========
let consoleBuffer = "";

document.addEventListener("keydown", (e) => {
  // Only listen if chat input is NOT focused and no modifiers are held
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