// 🔹 chat.js – input and flow control only, all UI/logic in modules + auto-list rendering

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

// Import list renderer (ensure it's globally exposed as window.renderInfoList in your HTML or import here)
import { renderInfoList } from "./lists.js";
window.renderInfoList = renderInfoList;

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
    signInAnonymously(auth);
    window.setStatusFeedback("loading", "Signing in...");
    window.debug("Auth: Signing in anonymously...");
    return;
  }
  uid = user.uid;
  chatRef = ref(db, `chatHistory/${uid}`);
  window.debug("Auth Ready → UID:", uid);

  onValue(chatRef, (snapshot) => {
    const data = snapshot.val() || {};
    const messages = Object.entries(data).map(([id, msg]) => ({
      id,
      role: msg.role === "bot" ? "assistant" : msg.role,
      content: msg.content,
      timestamp: msg.timestamp || 0
    }));
    renderMessages(messages.slice(-20));
  });
});

// ========== 4. Submit Handler ==========
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt || !uid) return;
  input.value = "";

  showChatInputSpinner(true);
  window.setStatusFeedback("loading", "Thinking...");
  window.debug("[SUBMIT]", { uid, prompt });

  try {
    // Static Commands
    const quick = ["/time", "/date", "/uid", "/clearchat", "/summary", "/commands"];
    if (quick.includes(prompt)) {
      await handleStaticCommand(prompt, chatRef, uid);
      window.setStatusFeedback("success", "Command executed");
      showChatInputSpinner(false);
      return;
    }
    if (prompt === "/notes") {
      await listNotes(chatRef);
      window.setStatusFeedback("success", "Notes listed");
      showChatInputSpinner(false);
      return;
    }
    if (prompt === "/reminders") {
      await listReminders(chatRef);
      window.setStatusFeedback("success", "Reminders listed");
      showChatInputSpinner(false);
      return;
    }
    if (prompt === "/events") {
      await listEvents(chatRef);
      window.setStatusFeedback("success", "Events listed");
      showChatInputSpinner(false);
      return;
    }

    // Step 1: Save user message
    await saveMessageToChat("user", prompt, uid);
    window.debug("[STEP 1] User message saved.");

    // Step 2: Try memory extraction
    window.debug("[STEP 2] Checking for memory...");
    const memory = await extractMemoryFromPrompt(prompt, uid);
    if (memory) {
      window.setStatusFeedback("success", `Memory saved (${memory.type})`);
      window.debug("[MEMORY]", memory);
    }

    // Step 3: Build assistant prompt
    window.debug("[STEP 3] Fetching context...");
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
    window.debug("[GPT INPUT]", full);

    // Step 4: Get assistant reply
    const assistantReply = await getAssistantReply(full);
    await saveMessageToChat("assistant", assistantReply, uid);
    window.logAssistantReply(assistantReply);
    updateHeaderWithAssistantReply(assistantReply);

    // --- AUTO-LIST RENDERING (detect and render pretty lists) ---
    try {
      // Pattern 1: [LIST]{...}
      if (assistantReply.startsWith("[LIST]")) {
        const payload = JSON.parse(assistantReply.replace("[LIST]", "").trim());
        window.renderInfoList({
          containerId: "main",
          ...payload
        });
        showChatInputSpinner(false);
        return;
      }
      // Pattern 2: Markdown-style list (fallback)
      const match = assistantReply.match(/^(\w+ List|Notes|Reminders|Events):\s*\n((?:[-•].+\n?)+)/im);
      if (match) {
        const title = match[1] || "List";
        const rawItems = match[2]
          .split('\n')
          .filter(Boolean)
          .map(line => {
            const m = line.match(/[-•]\s*(\[([^\]]+)\])?\s*(.+)/);
            return {
              label: m?.[2] || "",
              desc: m?.[3] || line.replace(/^[-•]\s*/, "")
            };
          });
        window.renderInfoList({
          containerId: "main",
          title,
          icon: "",
          items: rawItems
        });
        showChatInputSpinner(false);
        return;
      }
      // Pattern 3: Direct JSON
      if (assistantReply.trim().startsWith("{") && assistantReply.trim().endsWith("}")) {
        const payload = JSON.parse(assistantReply);
        if (payload.items && Array.isArray(payload.items)) {
          window.renderInfoList({
            containerId: "main",
            title: payload.title || "List",
            icon: payload.icon || "",
            items: payload.items
          });
          showChatInputSpinner(false);
          return;
        }
      }
    } catch (e) {
      window.debug("[List Render Error]", e);
    }

    // Step 5: Summarize if needed
    await summarizeChatIfNeeded(uid);
    window.setStatusFeedback("success", "Message sent");
  } catch (err) {
    window.setStatusFeedback("error", "Something went wrong");
    window.debug("[ERROR]", err.message || err);
  } finally {
    showChatInputSpinner(false);
  }
});