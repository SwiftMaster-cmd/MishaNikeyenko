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
      const data = await webSearchBrave(term, { uid, count: 5