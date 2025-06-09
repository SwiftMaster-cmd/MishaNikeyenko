// chat.js – input and flow control, imports all UI/logic from modules

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

// DOM Elements
const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const chatLog = document.getElementById("chat-log");

initScrollTracking();

let uid = null;
let chatRef = null;

onAuthStateChanged(auth, (user) => {
  if (!user) {
    signInAnonymously(auth).catch(e => window.setStatusFeedback?.("error", "Auth failed."));
    window.setStatusFeedback?.("loading", "Signing in...");
    window.debug?.("Auth: Signing in anonymously...");
    return;
  }
  uid = user.uid;
  chatRef = ref(db, `chatHistory/${uid}`);
  window.debug?.("Auth Ready → UID:", uid);

  onValue(chatRef, (snapshot) => {
    const data = snapshot.val() || {};
    const messages = Object.entries(data).map(([id, msg]) => ({
      id,
      role: msg.role === "bot" ? "assistant" : msg.role,
      content: msg.content,
      timestamp: msg.timestamp || 0
    }));
    renderMessages(messages.slice(-20));
    scrollToBottom();
  });
});

// Append assistant message to chat log
function appendAssistantMessage(text, isHTML = false) {
  const message = document.createElement("div");
  message.className = "assistant-msg msg";
  if (isHTML) message.innerHTML = text;
  else message.textContent = text;
  chatLog.appendChild(message);
  scrollToBottom();
}

// Append user message to chat log
function appendUserMessage(text) {
  const message = document.createElement("div");
  message.className = "user-msg msg";
  message.textContent = text;
  chatLog.appendChild(message);
  scrollToBottom();
}

// Append search results formatted HTML to chat log
function appendSearchResults(results) {
  if (!results || results.length === 0) {
    appendAssistantMessage("No search results found.");
    return;
  }
  const html = results.map(r => `
    <div class="search-result-card">
      <div class="result-title">
        <a href="${r.url}" target="_blank" rel="noopener noreferrer">${r.title}</a>
      </div>
      <div class="result-snippet">${r.snippet}</div>
    </div>
  `).join('');
  appendAssistantMessage(html, true);
}

// Handle form submit
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt || !uid) return;
  input.value = "";
  appendUserMessage(prompt);

  showChatInputSpinner(true);
  window.setStatusFeedback?.("loading", "Thinking...");
  window.debug?.("[SUBMIT]", { uid, prompt });

  try {
    // Handle /search command
    if (prompt.startsWith("/search ")) {
      const query = prompt.slice(8).trim();
      if (!query) {
        appendAssistantMessage("Please provide a search query.");
        showChatInputSpinner(false);
        return;
      }

      await saveMessageToChat("user", prompt, uid);
      window.debug?.("[STEP 1] User search message saved.");

      try {
        const searchData = await webSearchBrave(query, { count: 5 });
        await saveMessageToChat("assistant", `[Search results for "${query}"]`, uid);

        appendSearchResults(searchData.results);

        window.setStatusFeedback?.("success", "Search results displayed");
      } catch (searchErr) {
        window.debug?.("[SEARCH ERROR]", searchErr.message || searchErr);
        appendAssistantMessage(`Search error: ${searchErr.message || "Failed to fetch results"}`);
        window.setStatusFeedback?.("error", "Search failed");
      }

      showChatInputSpinner(false);
      return;
    }

    // Normal chat flow
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