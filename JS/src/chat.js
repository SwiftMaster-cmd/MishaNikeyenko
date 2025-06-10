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
  let last20Cache = [];

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

      last20Cache = messages.slice(-20);
      renderMessages(last20Cache);
      scrollToBottom();
      input.focus();
    });
  });

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
      // 1) Save user message
      await saveMessageToChat("user", prompt, uid);

      // 2) Refresh last20Cache before LLM call
      last20Cache = await fetchLast20Messages(uid);

      // 3) Build system prompt
      const ctx = await getAllContext(uid);
      const systemPrompt = buildSystemPrompt({
        memory: ctx.memory,
        todayLog: ctx.dayLog,
        notes: ctx.notes,
        calendar: ctx.calendar,
        reminders: ctx.reminders,
        calc: ctx.calc,
        date: new Date().toISOString().slice(0, 10)
      });

      // 4) Agent call
      const reply = await processUserMessage({
        messages: [
          { role: "system", content: systemPrompt },
          ...last20Cache,
          { role: "user", content: prompt }
        ],
        uid,
        state
      });

      // 5) Save assistant reply
      await saveMessageToChat("assistant", reply, uid);

      // 6) Immediately update UI from cache + local reply
      const newMsg = {
        id: `local-${Date.now()}`,
        role: "assistant",
        content: reply,
        timestamp: Date.now()
      };
      last20Cache = [...last20Cache, newMsg].slice(-20);
      renderMessages(last20Cache);
      updateHeaderWithAssistantReply(reply);
      scrollToBottom();

      // 7) Summarize if needed
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