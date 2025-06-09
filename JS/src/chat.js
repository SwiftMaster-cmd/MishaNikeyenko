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

// ========== 4. Search Results UI ==========
function renderSearchResults(results, container) {
  if (!container) return;
  container.innerHTML = "";
  results.forEach(res => {
    const card = document.createElement("div");
    card.className = "search-result-card";
    card.innerHTML = `
      <div class="search-result-title"><a href="${res.url}" target="_blank" rel="noopener">${res.title || res.url}</a></div>
      <div class="search-result-snippet">${res.snippet || ""}</div>
      <div class="search-result-link"><a href="${res.url}" target="_blank" rel="noopener">${res.url}</a></div>
    `;
    container.appendChild(card);
  });
}

// ========== 5. Submit Handler ==========
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt || !uid) return;
  input.value = "";

  showChatInputSpinner(true);
  window.setStatusFeedback?.("loading", "Thinking...");
  window.debug?.("[SUBMIT]", { uid, prompt });

  try {
    // Quick Static Commands
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

    // ====== /search command integration ======
    if (prompt.startsWith("/search ")) {
      const query = prompt.replace("/search ", "").trim();
      window.debug?.("[SEARCH] Query:", query);
      // Display search results as a message bubble
      try {
        // Call your Netlify function
        const response = await fetch(`/.netlify/functions/brave-search?q=${encodeURIComponent(query)}&count=5`);
        const data = await response.json();
        window.debug?.("[SEARCH RAW]", data);

        // Robust results handling:
        let results = [];
        if (Array.isArray(data.results)) {
          results = data.results.map(r => ({
            title: r.title || "",
            url: r.url || "",
            snippet: r.description || r.snippet || ""
          }));
        } else if (data.web && Array.isArray(data.web.results)) {
          results = data.web.results.map(r => ({
            title: r.title || "",
            url: r.url || "",
            snippet: r.description || r.snippet || ""
          }));
        } else {
          throw new Error("No results found in search response.");
        }

        // Display formatted results in chat (as a bot message)
        const resultsHtml = results.length
          ? results.map(res =>
              `<div class="search-result-card">
                <div class="search-result-title"><a href="${res.url}" target="_blank" rel="noopener">${res.title || res.url}</a></div>
                <div class="search-result-snippet">${res.snippet || ""}</div>
                <div class="search-result-link"><a href="${res.url}" target="_blank" rel="noopener">${res.url}</a></div>
              </div>`).join("")
          : `<div>No results found.</div>`;

        // Save to chat log as assistant message
        await saveMessageToChat("assistant", resultsHtml, uid);

        // Update chat display
        renderMessages([
          ...document.querySelectorAll('.msg') // preserve history in view
        ].map(node => ({
          content: node.innerHTML,
          role: node.classList.contains('user-msg') ? 'user' : 'assistant'
        })).concat([{ content: resultsHtml, role: "assistant" }]));
        scrollToBottom();

        window.setStatusFeedback?.("success", "Search complete");
        showChatInputSpinner(false);
        return;
      } catch (err) {
        window.debug?.("[SEARCH ERROR]", err.message || err);
        await saveMessageToChat("assistant", `Search error: ${err.message || "Unknown error"}`, uid);
        window.setStatusFeedback?.("error", "Search failed");
        showChatInputSpinner(false);
        return;
      }
    }

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

// ========== 6. /console Keyboard Activation ==========
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