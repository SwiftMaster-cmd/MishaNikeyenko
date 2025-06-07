// 🔹 chat.js – full voice input/output, auto-list rendering, modular UI

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

import { renderInfoList } from "./lists.js";
import {
  speakText,
  startVoiceRecognition
} from "./voice.js";

window.renderInfoList = renderInfoList;

// ========== 1. DOM ==========
const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const micButton = document.getElementById("mic-button");
const debugToggle = document.getElementById("debug-toggle");

initScrollTracking();

// ========== 2. Mic Button ==========
if (micButton) {
  micButton.addEventListener("click", () => {
    startVoiceRecognition((transcript) => {
      input.value = transcript;
    });
  });
}

// ========== 3. Debug Toggle ==========
if (debugToggle) {
  debugToggle.addEventListener("click", () => {
    if (typeof window.showDebugOverlay === "function") window.showDebugOverlay();
  });
}

// ========== 4. Firebase Auth ==========
let uid = null;
let chatRef = null;

onAuthStateChanged(auth, (user) => {
  if (!user) {
    signInAnonymously(auth);
    window.setStatusFeedback("loading", "Signing in...");
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

// ========== 5. Chat Submit Handler ==========
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt || !uid) return;
  input.value = "";

  showChatInputSpinner(true);
  window.setStatusFeedback("loading", "Thinking...");
  window.debug("[SUBMIT]", { uid, prompt });

  try {
    const staticCommands = ["/time", "/date", "/uid", "/clearchat", "/summary", "/commands"];
    if (staticCommands.includes(prompt)) {
      await handleStaticCommand(prompt, chatRef, uid);
      showChatInputSpinner(false);
      return;
    }
    if (prompt === "/notes") return listNotes(chatRef);
    if (prompt === "/reminders") return listReminders(chatRef);
    if (prompt === "/events") return listEvents(chatRef);

    await saveMessageToChat("user", prompt, uid);

    const memory = await extractMemoryFromPrompt(prompt, uid);
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
    const assistantReply = await getAssistantReply(full);

    await saveMessageToChat("assistant", assistantReply, uid);
    updateHeaderWithAssistantReply(assistantReply);
    window.logAssistantReply(assistantReply);
    speakText(assistantReply);

    // ========== 6. Auto List Rendering ==========
    try {
      // Format: [LIST] { ... }
      if (assistantReply.startsWith("[LIST]")) {
        const jsonStart = assistantReply.indexOf("{");
        const payload = JSON.parse(assistantReply.slice(jsonStart));
        window.renderInfoList({ containerId: "main", ...payload });
        showChatInputSpinner(false);
        return;
      }

      // Format: **Section:** - Item - Item
      const cardPattern = /\*\*(.+?):\*\*((?:\s*-\s*[^*]+)+)/g;
      let foundInline = false;
      let match;
      while ((match = cardPattern.exec(assistantReply)) !== null) {
        const title = match[1].trim();
        const items = match[2]
          .split(/\s*-\s*/)
          .filter(Boolean)
          .map(text => ({ label: "", desc: text }));
        window.renderInfoList({ containerId: "main", title, items });
        foundInline = true;
      }
      if (foundInline) {
        showChatInputSpinner(false);
        return;
      }

      // Format: Title:\n- item\n- item
      const sectionPattern = /^(.*?):\s*\n((?:[-•]\s?.+\n?)+)/gm;
      let sectionMatch;
      while ((sectionMatch = sectionPattern.exec(assistantReply)) !== null) {
        const title = sectionMatch[1].trim();
        const items = sectionMatch[2]
          .split("\n")
          .filter(Boolean)
          .map(line => ({
            label: "",
            desc: line.replace(/^[-•]\s*/, "")
          }));
        window.renderInfoList({ containerId: "main", title, items });
      }

      // Format: JSON object with .items[]
      if (assistantReply.trim().startsWith("{")) {
        const parsed = JSON.parse(assistantReply);
        if (parsed.items && Array.isArray(parsed.items)) {
          window.renderInfoList({
            containerId: "main",
            title: parsed.title || "List",
            icon: parsed.icon || "",
            items: parsed.items
          });
        }
      }
    } catch (err) {
      window.debug("[List Render Error]", err);
    }

    // ========== 7. Optional Summary ==========
    await summarizeChatIfNeeded(uid);
    window.setStatusFeedback("success", "Message sent");
  } catch (err) {
    window.setStatusFeedback("error", "Something went wrong");
    window.debug("[ERROR]", err.message || err);
  } finally {
    showChatInputSpinner(false);
  }
});