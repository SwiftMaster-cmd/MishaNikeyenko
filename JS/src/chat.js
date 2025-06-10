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
import { trackedChat } from "./tokenTracker.js";

window.addEventListener("DOMContentLoaded", () => {
  const form        = document.getElementById("chat-form");
  const input       = document.getElementById("user-input");
  const debugToggle = document.getElementById("debug-toggle");

  input?.focus();
  initScrollTracking();
  debugToggle?.addEventListener("click", () => window.showDebugOverlay?.());

  let uid     = null;
  let chatRef = null;

  onAuthStateChanged(auth, user => {
    if (!user) {
      signInAnonymously(auth).catch(() =>
        window.setStatusFeedback?.("error", "Auth failed.")
      );
      return;
    }
    uid     = user.uid;
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
    input.value = "";

    showChatInputSpinner(true);
    window.setStatusFeedback?.("loading", "Thinking...");

    try {
      // 1. Natural‐language commands
      if (await tryNatural(prompt, { uid, chatRef, state: {} })) {
        return;
      }

      // 2. Static slash commands
      const staticCmds = new Set([
        "/time","/date","/uid","/clearchat","/summary","/commands",
        "/notes","/reminders","/events","/console"
      ]);
      if (staticCmds.has(prompt)) {
        if (prompt === "/notes")      await listNotes(chatRef);
        else if (prompt === "/reminders") await listReminders(chatRef);
        else if (prompt === "/events")    await listEvents(chatRef);
        else if (prompt === "/console")   window.showDebugOverlay?.();
        else await handleStaticCommand(prompt, chatRef, uid);
        return;
      }

      // 3. Memory extraction (preferences, reminders, notes, logs)
      const memory = await extractMemoryFromPrompt(prompt, uid);
      if (memory) {
        await saveMessageToChat("user", prompt, uid);
        const ack = {
          preference: `✅ Saved preference: "${memory.content}"`,
          reminder:   `✅ Saved reminder: "${memory.content}"`,
          calendar:   `✅ Saved event: "${memory.content}"${memory.date?` on ${memory.date}`:""}${memory.time?` at ${memory.time}`:""}`
        }[memory.type];
        if (ack) await saveMessageToChat("assistant", ack, uid);
        return;
      }

      // 4. Main chat: record user message, build context, single trackedChat call
      await saveMessageToChat("user", prompt, uid);

      const [all20, ctx] = await Promise.all([
        fetchLast20Messages(uid),
        getAllContext(uid)
      ]);
      const last5 = all20.slice(-5);

      const systemPrompt = buildSystemPrompt({
        memory:    ctx.memory,
        todayLog:  ctx.dayLog,
        notes:     ctx.notes,
        calendar:  ctx.calendar,
        reminders: ctx.reminders,
        calc:      ctx.calc,
        date:      new Date().toISOString().slice(0,10)
      });

      const apiResponse = await trackedChat("/.netlify/functions/chatgpt", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({
          messages: [
            { role: "system", content: systemPrompt },
            ...last5,
            { role: "user", content: prompt }
          ],
          model: "gpt-4o",
          temperature: 0.8
        })
      });

      let reply = apiResponse.choices?.[0]?.message?.content || "[No reply]";
      if (/^(\s*[-*]|\d+\.)\s/m.test(reply)) {
        reply = `<div class="list-container"><ul>${
          reply.split(/\r?\n/)
               .map(l => l.replace(/^\s*([-*]|\d+\.)\s*/,"").trim())
               .filter(Boolean)
               .map(li => `<li>${li}</li>`).join("")
        }</ul></div>`;
      }

      await saveMessageToChat("assistant", reply, uid);
      updateHeaderWithAssistantReply(reply);

      // 5. Summarize if needed (silent)
      await summarizeChatIfNeeded(uid);

    } catch (err) {
      window.setStatusFeedback?.("error","Something went wrong");
      console.error(err);
    } finally {
      showChatInputSpinner(false);
      window.setStatusFeedback?.("idle","");
      input.focus();
    }
  });

  // Shortcut for "/console"
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