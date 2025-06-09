// chat.js – input and flow control only, all UI/logic in modules

import {
  onValue,
  ref,
  push
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

import { webSearchBrave } from "./search.js";

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
let chatMessages = [];
let isShowingCommandOutput = false;

onAuthStateChanged(auth, (user) => {
  if (!user) {
    signInAnonymously(auth)
      .catch(e => window.setStatusFeedback?.("error", "Auth failed."));
    window.setStatusFeedback?.("loading", "Signing in...");
    window.debug?.("Auth: Signing in anonymously...");
    return;
  }
  uid = user.uid;
  chatRef = ref(db, `chatHistory/${uid}`);
  window.debug?.("Auth Ready → UID:", uid);

  onValue(chatRef, (snapshot) => {
    const data = snapshot.val() || {};
    chatMessages = Object.entries(data).map(([id, msg]) => ({
      id,
      role: msg.role === "bot" ? "assistant" : msg.role,
      content: msg.content,
      timestamp: msg.timestamp || 0
    })).sort((a, b) => a.timestamp - b.timestamp);

    if (!isShowingCommandOutput) {
      renderMessages(chatMessages.slice(-20));
      scrollToBottom();
    }
  });
});

// ========== 4. Submit Handler ==========
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt || !uid) return;
  input.value = "";

  if (isShowingCommandOutput) {
    isShowingCommandOutput = false;
    renderMessages(chatMessages.slice(-20));
    scrollToBottom();
  }

  showChatInputSpinner(true);
  window.setStatusFeedback?.("loading", "Thinking...");
  window.debug?.("[SUBMIT]", { uid, prompt });

  try {
    // Static command triggers
    const quick = ["/time", "/date", "/uid", "/clearchat", "/summary", "/commands"];
    if (quick.includes(prompt)) {
      await handleStaticCommand(prompt, chatRef, uid);
      window.setStatusFeedback?.("success", "Command executed");
      showChatInputSpinner(false);
      return;
    }

    if (prompt === "/notes") {
      isShowingCommandOutput = true;
      await listNotes(chatRef);
      window.setStatusFeedback?.("success", "Notes listed");
      showChatInputSpinner(false);
      return;
    }

    if (prompt === "/reminders") {
      isShowingCommandOutput = true;
      await listReminders(chatRef);
      window.setStatusFeedback?.("success", "Reminders listed");
      showChatInputSpinner(false);
      return;
    }

    if (prompt === "/events") {
      isShowingCommandOutput = true;
      await listEvents(chatRef);
      window.setStatusFeedback?.("success", "Events listed");
      showChatInputSpinner(false);
      return;
    }

    if (prompt === "/console") {
      if (typeof window.showDebugOverlay === "function") window.showDebugOverlay();
      window.setStatusFeedback?.("success", "Console opened");
      showChatInputSpinner(false);
      return;
    }

    // 🔍 Smart natural language or slash command intent
    const commandIntentMatch = prompt.match(
      /\b(?:\/?(note|reminder|calendar))\b|\b(write|save|make|add|set)\b.*\b(note|reminder|calendar|event)\b/i
    );

    if (commandIntentMatch) {
      const type = (
        commandIntentMatch[1] ||
        commandIntentMatch[3]
      )?.toLowerCase();

      if (type) {
        const [last20] = await Promise.all([fetchLast20Messages(uid)]);

        const contextPrompt = [
          {
            role: "system",
            content: `The user wants to save a ${type}. Based on context, respond ONLY with the exact text to store. No extra commentary.`
          },
          ...last20,
          { role: "user", content: prompt }
        ];

        const gptResult = await getAssistantReply(contextPrompt);
        const trimmed = gptResult.trim();

        if (!trimmed) {
          window.setStatusFeedback?.("error", "Nothing to save");
          showChatInputSpinner(false);
          return;
        }

      const syntheticCommand = `/${type} ${trimmed}`;
await saveMessageToChat("user", prompt, uid);
await handleStaticCommand(syntheticCommand, chatRef, uid);
isShowingCommandOutput = true;
scrollToBottom();
showChatInputSpinner(false);
return;
      }
    }

    // 🔎 Web search
    if (prompt.startsWith("/search ")) {
      const query = prompt.slice(8).trim();
      if (!query) {
        window.setStatusFeedback?.("error", "Search query empty");
        showChatInputSpinner(false);
        return;
      }
      isShowingCommandOutput = true;
      window.debug?.("[SEARCH] Query:", query);
      try {
        const data = await webSearchBrave(query, { count: 20 });
        if (!data || !data.results) throw new Error("No results");

        let formatted = `<div class="search-results">`;
        formatted += `<div class="results-title">Top Results for "${query}":</div><ul>`;
        for (const r of data.results) {
          formatted += `<li><a href="${r.url}" target="_blank" rel="noopener noreferrer">${r.title}</a>`;
          if (r.snippet) formatted += `<div class="snippet">${r.snippet}</div>`;
          formatted += `</li>`;
        }
        formatted += `</ul>`;

        if (data.infobox) {
          formatted += `<div class="infobox"><strong>Info Box:</strong> ${data.infobox}</div>`;
        }
        if (data.faq?.length) {
          formatted += `<div class="faq-section"><strong>FAQs:</strong><ul>`;
          for (const faq of data.faq) {
            formatted += `<li><strong>Q:</strong> ${faq.question}<br><strong>A:</strong> ${faq.answer}</li>`;
          }
          formatted += `</ul></div>`;
        }
        if (data.discussions?.length) {
          formatted += `<div class="discussions-section"><strong>Discussions:</strong><ul>`;
          for (const disc of data.discussions) {
            formatted += `<li><a href="${disc.url}" target="_blank" rel="noopener noreferrer">${disc.title}</a></li>`;
          }
          formatted += `</ul></div>`;
        }
        formatted += `</div>`;

        await saveMessageToChat("user", prompt, uid);
        await saveMessageToChat("assistant", formatted, uid);

        renderMessages([
          { role: "user", content: prompt, timestamp: Date.now() },
          { role: "assistant", content: formatted, timestamp: Date.now() }
        ], true);
        scrollToBottom();
        window.setStatusFeedback?.("success", "Search results loaded");
      } catch (searchErr) {
        window.setStatusFeedback?.("error", "Search failed");
        window.debug?.("[SEARCH ERROR]", searchErr.message || searchErr);
      } finally {
        showChatInputSpinner(false);
      }
      return;
    }

    // 🧠 Normal assistant chat
    await saveMessageToChat("user", prompt, uid);
    window.debug?.("[STEP 1] User message saved.");

    const memory = await extractMemoryFromPrompt(prompt, uid);
    if (memory) {
      window.setStatusFeedback?.("success", `Memory saved (${memory.type})`);
      window.debug?.("[MEMORY]", memory);
    }

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
    window.debug?.("[GPT INPUT]", full);

    const assistantReply = await getAssistantReply(full);
    await saveMessageToChat("assistant", assistantReply, uid);
    window.logAssistantReply?.(assistantReply);
    updateHeaderWithAssistantReply(assistantReply);
    await summarizeChatIfNeeded(uid);

    window.setStatusFeedback?.("success", "Message sent");
  } catch (err) {
    window.setStatusFeedback?.("error", "Something went wrong");
    window.debug?.("[ERROR]", err.message || err);
  } finally {
    showChatInputSpinner(false);
  }
});

// ========== 5. /console Keyboard Activation ==========
let consoleBuffer = "";

document.addEventListener("keydown", (e) => {
  if (
    document.activeElement !== input &&
    !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey
  ) {
    if (e.key.length === 1) {
      consoleBuffer += e.key;
      if (consoleBuffer.endsWith("/console")) {
        if (typeof window.showDebugOverlay === "function") window.showDebugOverlay();
        consoleBuffer = "";
      } else if (!"/console".startsWith(consoleBuffer)) {
        consoleBuffer = "";
      }
    } else if (e.key === "Escape") {
      consoleBuffer = "";
    }
  }
});