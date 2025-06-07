// 🔹 chat.js – input and flow control only, all UI/logic in modules

import {
  onValue,
  ref
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

// ========== 2. Scroll Init ==========
initScrollTracking();

// ========== 3. Auth + Load ==========
let uid = null;
let chatRef = null;

function safeRender(messages) {
  try {
    renderMessages(messages);
    scrollToBottom();
  } catch (e) {
    window.debug("[RENDER ERROR]", e.message);
  }
}

onAuthStateChanged(auth, (user) => {
  if (!user) {
    signInAnonymously(auth);
    window.setStatusFeedback("loading", "Signing in...");
    return;
  }

  uid = user.uid;
  chatRef = ref(db, `chatHistory/${uid}`);
  window.setStatusFeedback("success", "Ready");
  window.debug("Authenticated → UID:", uid);

  // Defer render until DOM is idle
  setTimeout(() => {
    onValue(chatRef, (snapshot) => {
      const data = snapshot.val() || {};
      const messages = Object.entries(data)
        .map(([id, msg]) => ({
          id,
          role: msg.role === "bot" ? "assistant" : msg.role,
          content: msg.content,
          timestamp: msg.timestamp || 0
        }))
        .sort((a, b) => a.timestamp - b.timestamp)
        .slice(-10); // Only last 10 for performance

      safeRender(messages);
    });
  }, 250);
});

// ========== 4. Submit Handler ==========
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt || !uid) return;
  input.value = "";

  showChatInputSpinner(true);
  window.setStatusFeedback("loading", "Thinking...");
  window.debug("[SUBMIT]", prompt);

  try {
    // Handle static commands
    const staticCmds = {
      "/time": handleStaticCommand,
      "/date": handleStaticCommand,
      "/uid": handleStaticCommand,
      "/clearchat": handleStaticCommand,
      "/summary": handleStaticCommand,
      "/commands": handleStaticCommand,
      "/notes": listNotes,
      "/reminders": listReminders,
      "/events": listEvents
    };

    if (staticCmds[prompt]) {
      await staticCmds[prompt](prompt, chatRef, uid);
      window.setStatusFeedback("success", "Command executed");
      showChatInputSpinner(false);
      return;
    }

    // Save user message
    await saveMessageToChat("user", prompt, uid);
    window.debug("[SAVED]", "User message saved");

    // Extract memory
    const memory = await extractMemoryFromPrompt(prompt, uid);
    if (memory) {
      window.setStatusFeedback("success", `Memory (${memory.type})`);
      window.debug("[MEMORY]", memory);
    }

    // Fetch context
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
    const preview = full.map(m => `${m.role}: ${m.content?.slice?.(0, 30) || "..."}`);
    window.debug("[GPT INPUT]", preview);

    // Assistant response
    const reply = await getAssistantReply(full);
    await saveMessageToChat("assistant", reply, uid);
    window.reply(reply);
    updateHeaderWithAssistantReply(reply);

    // Summarize
    await summarizeChatIfNeeded(uid);

    window.setStatusFeedback("success", "Done");
  } catch (err) {
    window.setStatusFeedback("error", "Failed");
    window.debug("[ERROR]", err.message || err);
  } finally {
    showChatInputSpinner(false);
  }
});