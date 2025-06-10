// chat.js – input & flow control only; UI in uiShell.js; natural-language commands delegated to naturalCommands.js

import { onValue, ref } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
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
import { tryNatural } from "./naturalCommands.js";

window.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("chat-form");
  const input = document.getElementById("user-input");
  const debugToggle = document.getElementById("debug-toggle");

  input?.focus();
  initScrollTracking();
  debugToggle?.addEventListener("click", () => window.showDebugOverlay?.());

  let uid = null;
  let chatRef = null;
  const state = { lastSearchData: { term: null, results: [] } };

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

      renderMessages(messages.slice(-20));
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

    showChatInputSpinner(true);
    window.setStatusFeedback?.("loading", "Thinking...");

    try {
      // 1. Natural-language commands
      if (await tryNatural(prompt, { uid, chatRef, state })) {
        return;
      }

      // 2. Static slash commands
      const staticCommands = new Set([
        "/time", "/date", "/uid",
        "/clearchat", "/summary", "/commands",
        "/notes", "/reminders", "/events", "/console"
      ]);
      if (staticCommands.has(prompt)) {
        if (prompt === "/notes") {
          await listNotes(chatRef);
        } else if (prompt === "/reminders") {
          await listReminders(chatRef);
        } else if (prompt === "/events") {
          await listEvents(chatRef);
        } else if (prompt === "/console") {
          window.showDebugOverlay?.();
        } else {
          await handleStaticCommand(prompt, chatRef, uid);
        }
        return;
      }

      // 3. Memory intents (preferences, reminders, notes, logs, calendar)
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
            const on = memory.date ? ` on ${memory.date}` : "";
            const at = memory.time ? ` at ${memory.time}` : "";
            await saveMessageToChat("assistant",
              `✅ Saved event: "${memory.content}"${on}${at}`, uid);
            break;
          }
          case "note":
            await handleStaticCommand(`/note ${memory.content}`, chatRef, uid);
            break;
          case "log":
            await handleStaticCommand(`/log ${memory.content}`, chatRef, uid);
            break;
        }
        return;
      }

      // 4. Fallback: conversational AI + auto-list detection
      await saveMessageToChat("user", prompt, uid);

      const [last20, ctx] = await Promise.all([
        fetchLast20Messages(uid),
        getAllContext(uid)
      ]);
      const systemPrompt = buildSystemPrompt({
        memory: ctx.memory,
        todayLog: ctx.dayLog,
        notes: ctx.notes,
        calendar: ctx.calendar,
        reminders: ctx.reminders,
        calc: ctx.calc,
        date: new Date().toISOString().slice(0, 10)
      });

      let reply = await getAssistantReply([
        { role: "system", content: systemPrompt },
        ...last20
      ]);

      if (/^(\s*[-*]|\d+\.)\s/m.test(reply)) {
        const items = reply
          .split(/\r?\n/)
          .map(l => l.replace(/^\s*([-*]|\d+\.)\s*/, "").trim())
          .filter(Boolean)
          .map(li => `<li>${li}</li>`)
          .join("");
        reply = `<div class="list-container"><ul>${items}</ul></div>`;
      }

      await saveMessageToChat("assistant", reply, uid);
      updateHeaderWithAssistantReply(reply);
      await summarizeChatIfNeeded(uid);

    } catch (err) {
      window.setStatusFeedback?.("error", "Something went wrong");
      console.error(err);
    } finally {
      showChatInputSpinner(false);
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