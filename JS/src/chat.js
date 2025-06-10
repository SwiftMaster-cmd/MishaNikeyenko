// chat.js – input & flow control only; UI in uiShell.js; actions delegated to admin.js

import { onValue, ref } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import { db, auth } from "./firebaseConfig.js";
import {
  saveMessageToChat,
  fetchLast20Messages,
  getAllContext,
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
import { processUserMessage } from "./admin.js";

window.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("chat-form");
  const input = document.getElementById("user-input");
  const debugToggle = document.getElementById("debug-toggle");

  input?.focus();
  initScrollTracking();
  debugToggle?.addEventListener("click", () => window.showDebugOverlay?.());

  let uid = null;
  let chatRef = null;
  const state = {};

  // 1) Set up Firebase auth & real-time listener
  onAuthStateChanged(auth, user => {
    if (!user) {
      signInAnonymously(auth).catch(() =>
        window.setStatusFeedback?.("error", "Auth failed.")
      );
      return;
    }
    uid = user.uid;
    chatRef = ref(db, `chatHistory/${uid}`);

    onValue(chatRef, snapshot => {
      const data = snapshot.val() || {};
      const messages = Object.entries(data)
        .map(([id, m]) => ({
          id,
          role: m.role === "bot" ? "assistant" : m.role,
          content: m.content,
          timestamp: m.timestamp || 0
        }))
        .sort((a, b) => a.timestamp - b.timestamp);

      renderMessages(messages);
      scrollToBottom();
      input.focus();
    });
  });

  // 2) Submit handler
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const prompt = input.value.trim();
    if (!prompt || !uid) {
      input.focus();
      return;
    }
    input.value = "";

    showChatInputSpinner(true);
    window.setStatusFeedback?.("loading", "Thinking...");

    try {
      // a) Save user message
      await saveMessageToChat("user", prompt, uid);

      // b) Gather context
      const [last20, ctx] = await Promise.all([
        fetchLast20Messages(uid),
        getAllContext(uid)
      ]);

      // c) Build system prompt
      const systemPrompt = buildSystemPrompt({
        memory: ctx.memory,
        todayLog: ctx.dayLog,
        notes: ctx.notes,
        calendar: ctx.calendar,
        reminders: ctx.reminders,
        calc: ctx.calc,
        date: new Date().toISOString().slice(0, 10)
      });

      // d) Let admin.js handle LLM + function calls
      const reply = await processUserMessage({
        messages: [
          { role: "system", content: systemPrompt },
          ...last20,
          { role: "user", content: prompt }
        ],
        uid,
        state
      });

      // e) Save assistant reply
      await saveMessageToChat("assistant", reply, uid);

      // f) Immediately fetch & render updated messages
      const updated = await fetchLast20Messages(uid);
      renderMessages(updated);
      updateHeaderWithAssistantReply(reply);
      scrollToBottom();
      await summarizeChatIfNeeded(uid);

    } catch (err) {
      window.setStatusFeedback?.("error", "Something went wrong");
      console.error(err);
    } finally {
      showChatInputSpinner(false);
      window.setStatusFeedback?.("idle", "");
      input.focus();
    }
  });

  // 3) Keyboard `/console` shortcut
  let buffer = "";
  document.addEventListener("keydown", e => {
    if (
      document.activeElement !== input &&
      !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey
    ) {
      buffer += e.key;
      if (buffer.endsWith("/console")) {
        window.showDebugOverlay?.();
        buffer = "";
      } else if (!"/console".startsWith(buffer)) {
        buffer = "";
      }
      if (e.key === "Escape") buffer = "";
    }
  });
});