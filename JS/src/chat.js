// chat.js – input/flow control only; UI is 100% in uiShell.js

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
import { webSearchBrave } from "./search.js";
import { buildSystemPrompt } from "./memoryManager.js";
import {
  renderMessages,
  showChatInputSpinner,
  scrollToBottom,
  updateHeaderWithAssistantReply,
  initScrollTracking
} from "./uiShell.js";
import {
  learnAboutTopic,
  saveLastSummaryToMemory,
  getPastSearches
} from "./learnManager.js";

window.addEventListener("DOMContentLoaded", () => {
  // DOM refs
  const form = document.getElementById("chat-form");
  const input = document.getElementById("user-input");
  const debugToggle = document.getElementById("debug-toggle");

  // focus & init
  input?.focus();
  initScrollTracking();

  debugToggle?.addEventListener("click", () => window.showDebugOverlay?.());

  // Firebase & state
  let uid = null;
  let chatRef = null;
  let lastSearchData = { term: null, results: [] };

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
      const chatMessages = Object.entries(data)
        .map(([id, msg]) => ({
          id,
          role: msg.role === "bot" ? "assistant" : msg.role,
          content: msg.content,
          timestamp: msg.timestamp || 0
        }))
        .sort((a, b) => a.timestamp - b.timestamp);

      renderMessages(chatMessages.slice(-20));
      scrollToBottom();
      input.focus();
    });
  });

  // Helpers for list detection/formatting
  const isList = text => /^(\s*[-*]|\d+\.)\s/m.test(text);
  const formatList = text => {
    const items = text
      .split(/\r?\n/)
      .map(line => line.replace(/^\s*([-*]|\d+\.)\s*/, "").trim())
      .filter(Boolean)
      .map(item => `<li>${item}</li>`)
      .join("");
    return `<div class="list-container"><ul>${items}</ul></div>`;
  };

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const raw = input.value.trim();
    if (!raw || !uid) {
      input.focus();
      return;
    }
    const prompt = raw;
    const lower = prompt.toLowerCase();
    input.value = "";

    showChatInputSpinner(true);
    window.setStatusFeedback?.("loading", "Thinking...");

    try {
      // Natural: Search for X
      if (lower.startsWith("search for ") || lower.startsWith("search ")) {
        const term = prompt.replace(/^search( for)? /i, "").trim();
        if (!term) {
          window.setStatusFeedback?.("error", "Search query empty");
          return;
        }
        const { results } = await webSearchBrave(term, { uid, count: 5 });
        const summary = await getAssistantReply([
          { role: "system", content: "Summarize these results in one paragraph:" },
          { role: "user", content: JSON.stringify(results, null, 2) }
        ]);
        await saveMessageToChat("user", prompt, uid);
        await saveMessageToChat("assistant", summary, uid);
        lastSearchData = { term, results };
        return;
      }

      // Natural: Show last search results
      if (
        lower === "show results" ||
        lower === "show search results" ||
        prompt === "/searchresults"
      ) {
        if (!lastSearchData.term) {
          await saveMessageToChat("assistant", "❌ No previous search found.", uid);
        } else {
          let html = `<div class="search-results"><div class="results-title">
            Results for "${lastSearchData.term}"
          </div><ul>`;
          for (const r of lastSearchData.results) {
            html += `<li>
              <a href="${r.url}" target="_blank">${r.title}</a>
              ${r.snippet ? `<div class="snippet">${r.snippet}</div>` : ""}
              <div class="result-url">${r.url}</div>
            </li>`;
          }
          html += `</ul></div>`;
          await saveMessageToChat("assistant", html, uid);
        }
        return;
      }

      // Natural: Learn about X
      if (lower.startsWith("learn about ")) {
        const topic = prompt.slice(12).trim();
        if (!topic) {
          await saveMessageToChat("assistant", "❌ No topic provided.", uid);
          return;
        }
        await saveMessageToChat("user", prompt, uid);
        const summary = await learnAboutTopic(topic, uid);
        await saveMessageToChat(
          "assistant",
          `📚 Learned about "${topic}":\n\n${summary}`,
          uid
        );
        return;
      }

      // Natural: Save last summary
      if (
        lower === "save that" ||
        lower === "save summary" ||
        lower === "save that summary" ||
        prompt === "/savesummary"
      ) {
        const ok = await saveLastSummaryToMemory(uid);
        await saveMessageToChat(
          "assistant",
          ok ? "✅ Last summary saved." : "❌ Nothing to save.",
          uid
        );
        return;
      }

      // Natural: List commands
      if (
        /^(list|show) commands?$/.test(lower) ||
        prompt === "/commands"
      ) {
        await handleStaticCommand("/commands", chatRef, uid);
        return;
      }

      // Natural: List notes
      if (
        /^(list|show) notes$/.test(lower) ||
        prompt === "/notes"
      ) {
        await listNotes(chatRef);
        return;
      }

      // Natural: List reminders
      if (
        /^(list|show) reminders$/.test(lower) ||
        prompt === "/reminders"
      ) {
        await listReminders(chatRef);
        return;
      }

      // Natural: List calendar events
      if (
        /^(list|show) events$/.test(lower) ||
        prompt === "/events"
      ) {
        await listEvents(chatRef);
        return;
      }

      // Natural: Show past searches
      if (
        lower === "past searches" ||
        lower === "show past searches" ||
        prompt === "/pastsearches"
      ) {
        const history = await getPastSearches(uid);
        if (!history.length) {
          await saveMessageToChat("assistant", "No past learned topics found.", uid);
        } else {
          const lines = history
            .map(i => `• **${i.topic}** (${new Date(i.timestamp).toLocaleDateString()})`)
            .join("\n");
          await saveMessageToChat("assistant", `📂 Recent learned topics:\n${lines}`, uid);
        }
        return;
      }

      // Static slash commands
      const quick = new Set(["/time", "/date", "/uid", "/clearchat", "/summary"]);
      if (quick.has(prompt)) {
        await handleStaticCommand(prompt, chatRef, uid);
        return;
      }
      if (prompt === "/console") {
        window.showDebugOverlay?.();
        return;
      }

      // Memory intents
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
            await saveMessageToChat(
              "assistant",
              `✅ Saved event: "${memory.content}"${on}${at}`,
              uid
            );
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

      // Fallback conversation + list auto-detect
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
      if (isList(reply)) reply = formatList(reply);
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

  // Keyboard shortcut for /console
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