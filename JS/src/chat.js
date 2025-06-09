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

import { webSearchBrave } from "./search.js"; // <-- import your search

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
  const prompt = input.value.trim();
  if (!prompt || !uid) return;
  input.value = "";

  showChatInputSpinner(true);
  window.setStatusFeedback?.("loading", "Thinking...");
  window.debug?.("[SUBMIT]", { uid, prompt });

  try {
    // Save user message FIRST for ALL commands
    await saveMessageToChat("user", prompt, uid);

    // Search Command
    if (prompt.startsWith("/search ")) {
      const query = prompt.replace("/search ", "").trim();
      window.debug?.("[SEARCH] Query:", query);
      try {
        const result = await webSearchBrave(query, { count: 5 });
        // Build results HTML
        let html = `<div class="search-results"><b>Top Results for "${query}":</b><ul>`;
        for (const r of (result.results || [])) {
          html += `<li><a href="${r.url}" target="_blank">${r.title}</a><br><span style="font-size:0.98em;color:#aaa">${r.snippet}</span></li>`;
        }
        html += `</ul></div>`;
        await saveMessageToChat("assistant", html, uid);
        window.debug?.("[SEARCH] Results saved");
      } catch (err) {
        await saveMessageToChat("assistant", `Search error: ${err.message || err}`, uid);
        window.debug?.("[SEARCH ERROR]", err);
      }
      showChatInputSpinner(false);
      return;
    }

    // Static Commands (already saved as user message)
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

    // Step 2: Try memory extraction (always after saving user message)
    window.debug?.("[STEP 2] Checking for memory...");
    const memory = await extractMemoryFromPrompt(prompt, uid);
    if (memory) {
      window.setStatusFeedback?.("success", `Memory saved (${memory.type})`);
      window.debug?.("[MEMORY]", memory);
    }

    // Step 3: Build assistant prompt/context
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

// ========== 5. /console Keyboard Activation ==========
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