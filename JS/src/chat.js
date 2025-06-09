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
  // ========== DOM ==========
  const form = document.getElementById("chat-form");
  const input = document.getElementById("user-input");
  const debugToggle = document.getElementById("debug-toggle");

  input?.focus();                     // activate immediately on load
  initScrollTracking();

  if (debugToggle) {
    debugToggle.addEventListener("click", () => window.showDebugOverlay?.());
  }

  // ========== Firebase Auth & Load ==========
  let uid = null;
  let chatRef = null;

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
      input?.focus();                 // keep focus after reload
    });
  });

  // ========== List detection helpers ==========
  function isList(text) {
    return /^(\s*[-*]|\d+\.)\s/m.test(text);
  }
  function listToHtml(text) {
    const lines = text
      .split(/\r?\n/)
      .map(line => line.replace(/^\s*([-*]|\d+\.)\s*/, "").trim())
      .filter(Boolean);
    const items = lines.map(l => `<li>${l}</li>`).join("");
    return `<div class="list-container"><ul>${items}</ul></div>`;
  }

  // ========== Form submission ==========
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
      // -- Static commands (all early-exit)
      const quick = ["/time","/date","/uid","/clearchat","/summary","/commands"];
      if (quick.includes(prompt)) {
        await handleStaticCommand(prompt, chatRef, uid);
        return;
      }
      if (prompt === "/notes") {
        await listNotes(chatRef); return;
      }
      if (prompt === "/reminders") {
        await listReminders(chatRef); return;
      }
      if (prompt === "/events") {
        await listEvents(chatRef); return;
      }
      if (prompt === "/console") {
        window.showDebugOverlay?.(); return;
      }

      // -- Memory intents
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
            const at   = memory.time ? ` at ${memory.time}` : "";
            await saveMessageToChat("assistant",
              `✅ Saved event: "${memory.content}"${when}${at}`, uid);
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

      // -- /search
      if (prompt.startsWith("/search ")) {
        const term = prompt.slice(8).trim();
        if (!term) {
          window.setStatusFeedback?.("error","Search query empty");
          return;
        }
        const data = await webSearchBrave(term, { uid, count: 5 });
        const summaryPrompt = [
          { role: "system", content: "You are a concise summarizer. Summarize these search results in one paragraph:" },
          { role: "user", content: JSON.stringify(data.results, null, 2) }
        ];
        const summary = await getAssistantReply(summaryPrompt);
        await saveMessageToChat("user", prompt, uid);
        await saveMessageToChat("assistant", summary, uid);
        lastSearchData = { term, results: data.results };
        return;
      }

      // -- /searchresults
      if (prompt === "/searchresults") {
        if (!lastSearchData.term) {
          await saveMessageToChat("assistant","❌ No previous search found.", uid);
        } else {
          let html = `<div class="search-results"><div class="results-title">
            Results for "${lastSearchData.term}"
          </div><ul>`;
          for (const r of lastSearchData.results) {
            html += `<li>
              <a href="${r.url}" target="_blank" rel="noopener">${r.title}</a>
              ${r.snippet?`<div class="snippet">${r.snippet}</div>`:""}
              <div class="result-url">${r.url}</div>
            </li>`;
          }
          html += `</ul></div>`;
          await saveMessageToChat("assistant", html, uid);
        }
        return;
      }

      // -- /savesummary
      if (prompt === "/savesummary") {
        const ok = await saveLastSummaryToMemory(uid);
        await saveMessageToChat("assistant",
          ok?"✅ Summary saved to memory.":"❌ No summary available.", uid);
        return;
      }

      // -- /learn about
      if (prompt.startsWith("/learn about ")) {
        const topic = prompt.slice(13).trim();
        if (!topic) {
          await saveMessageToChat("assistant","❌ No topic provided.", uid);
          return;
        }
        await saveMessageToChat("user", prompt, uid);
        const summary = await learnAboutTopic(topic, uid);
        await saveMessageToChat("assistant",
          `📚 Learned about "${topic}":\n\n${summary}`, uid);
        return;
      }

      // -- /pastsearches
      if (prompt === "/pastsearches") {
        const list = getPastSearches();
        const msg = list.length
          ? `📂 Recent learned topics:\n` +
            list.map(i => `• **${i.topic}** (${new Date(i.timestamp).toLocaleDateString()})`).join("\n")
          : "No past learned topics found.";
        await saveMessageToChat("assistant", msg, uid);
        return;
      }

      // -- /commands
      if (prompt === "/commands") {
        const cmds = [
          "/note - Save a note",
          "/reminder - Set a reminder",
          "/calendar - Create a calendar event",
          "/log - Add to day log",
          "/notes","/reminders","/events",
          "/summary","/clearchat","/time","/date","/uid",
          "/search","/searchresults","/savesummary",
          "/learn about","/pastsearches"
        ];
        const listHtml = `<div class="commands-container"><h3>Commands</h3><ul>`+
          cmds.map(c=>`<li>${c}</li>`).join("")+
          `</ul></div>`;
        await saveMessageToChat("assistant", listHtml, uid);
        return;
      }

      // -- Fallback: conversation + list auto-detect
      await saveMessageToChat("user", prompt, uid);
      const [last20, ctx] = await Promise.all([fetchLast20Messages(uid), getAllContext(uid)]);
      const sysPrompt = buildSystemPrompt({
        memory: ctx.memory,
        todayLog: ctx.dayLog,
        notes: ctx.notes,
        calendar: ctx.calendar,
        reminders: ctx.reminders,
        calc: ctx.calc,
        date: new Date().toISOString().slice(0,10)
      });

      let reply = await getAssistantReply([
        { role:"system", content: sysPrompt },
        ...last20
      ]);

      if (isList(reply)) {
        reply = listToHtml(reply);
      }

      await saveMessageToChat("assistant", reply, uid);
      updateHeaderWithAssistantReply(reply);
      await summarizeChatIfNeeded(uid);

    } catch (err) {
      window.setStatusFeedback?.("error","Something went wrong");
      console.error(err);
    } finally {
      showChatInputSpinner(false);
      input.focus();
    }
  });

  // ========== Keyboard Overlay ==========
  let buffer = "";
  document.addEventListener("keydown", e => {
    if (
      document.activeElement !== input &&
      !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey
    ) {
      if (e.key.length === 1) {
        buffer += e.key;
        if (buffer.endsWith("/console")) {
          window.showDebugOverlay?.();
          buffer = "";
        } else if (!"/console".startsWith(buffer)) {
          buffer = "";
        }
      } else if (e.key === "Escape") {
        buffer = "";
      }
    }
  });
});