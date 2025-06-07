// 🔹 chat.js – input, flow control, voice in/out, auto-list rendering

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
import { startVoiceRecognition, speakText } from "./voice.js";

window.renderInfoList = renderInfoList;

// ========== 1. DOM ==========
const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const micButton = document.getElementById("mic-button");
const debugToggle = document.getElementById("debug-toggle");

initScrollTracking();

micButton?.addEventListener("click", () => {
  startVoiceRecognition((transcript) => {
    input.value = transcript;
  });
});

debugToggle?.addEventListener("click", () => {
  if (typeof window.showDebugOverlay === "function") window.showDebugOverlay();
});

// ========== 2. Auth ==========
let uid = null;
let chatRef = null;

onAuthStateChanged(auth, (user) => {
  if (!user) {
    signInAnonymously(auth);
    return;
  }
  uid = user.uid;
  chatRef = ref(db, `chatHistory/${uid}`);

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

// ========== 3. Submit ==========
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt || !uid) return;
  input.value = "";

  showChatInputSpinner(true);
  window.setStatusFeedback("loading", "Thinking...");
  window.debug("[SUBMIT]", { uid, prompt });

  try {
    if (["/time", "/date", "/uid", "/clearchat", "/summary", "/commands"].includes(prompt)) {
      await handleStaticCommand(prompt, chatRef, uid);
      return showChatInputSpinner(false);
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
    window.logAssistantReply(assistantReply);
    updateHeaderWithAssistantReply(assistantReply);
    speakText(assistantReply); // 🔊 Voice Output

    // Try rendering as info list
    try {
      if (assistantReply.startsWith("[LIST]")) {
        const payload = JSON.parse(assistantReply.replace("[LIST]", "").trim());
        return window.renderInfoList({ containerId: "main", ...payload });
      }

      const cardPattern = /\*\*(.+?):\*\*((?:\s*-\s*[^*]+)+)/g;
      let match;
      let foundInline = false;
      while ((match = cardPattern.exec(assistantReply)) !== null) {
        const title = match[1].trim();
        const items = match[2].split(/\s*-\s*/).filter(Boolean).map(d => ({ label: "", desc: d.trim() }));
        window.renderInfoList({ containerId: "main", title, items });
        foundInline = true;
      }
      if (foundInline) return;

      const listSections = assistantReply.split(/\n(?=[A-Za-z ]+:\n)/g);
      for (const section of listSections) {
        const match = section.match(/^([A-Za-z ]+):\s*\n((?:[-•].+\n?)+)/im);
        if (match) {
          const title = match[1].trim();
          const items = match[2].split('\n').filter(Boolean).map(line => ({
            label: "",
            desc: line.replace(/^[-•]\s*/, "")
          }));
          window.renderInfoList({ containerId: "main", title, items });
        }
      }

      if (assistantReply.trim().startsWith("{") && assistantReply.trim().endsWith("}")) {
        const payload = JSON.parse(assistantReply);
        if (payload.items) {
          window.renderInfoList({
            containerId: "main",
            title: payload.title || "List",
            icon: payload.icon || "",
            items: payload.items
          });
        }
      }
    } catch (e) {
      window.debug("[List Render Error]", e);
    }

    await summarizeChatIfNeeded(uid);
    window.setStatusFeedback("success", "Message sent");
  } catch (err) {
    window.setStatusFeedback("error", "Something went wrong");
    window.debug("[ERROR]", err.message || err);
  } finally {
    showChatInputSpinner(false);
  }
});