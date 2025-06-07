// 🔹 chat.js – Clean UI + spinner + debug overlay, all backend logic handled in backgpt.js

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

// ========== 1. UI Elements ==========
const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const log = document.getElementById("chat-log");
const header = document.getElementById("header-title");

function updateHeaderWithAssistantReply(text) {
  if (!header) return;
  header.style.opacity = 0;
  setTimeout(() => {
    header.textContent = text;
    header.style.opacity = 1;
  }, 150);
}

// ========== 2. Spinner + Status ==========
function showChatInputSpinner(show = true) {
  const spinner = document.getElementById("chat-loading-spinner");
  const inputField = document.getElementById("user-input");
  if (spinner) spinner.style.display = show ? "inline-block" : "none";
  if (inputField) inputField.disabled = show;
}

function setStatusIndicator(type, msg = "") {
  const icon = document.getElementById("status-icon");
  const tip = document.getElementById("status-tooltip");
  if (!icon || !tip) return;

  const iconMap = {
    success: { symbol: "✅", color: "#1db954" },
    error: { symbol: "❌", color: "#d7263d" },
    loading: { symbol: "⏳", color: "#ffd600" }
  };
  const { symbol = "", color = "" } = iconMap[type] || {};

  icon.textContent = symbol;
  icon.style.color = color;

  if (msg) {
    tip.textContent = msg;
    tip.style.display = "inline";
    tip.style.opacity = "0.93";
    tip.style.position = "static";
    tip.style.background = "none";
    tip.style.padding = "0";
    tip.style.marginLeft = "6px";
    tip.style.color = color !== "#ffd600" ? color : "#ffd600";
    tip.style.fontWeight = type === "success" ? "600" : "400";
    tip.style.fontSize = "1.04rem";
    tip.style.boxShadow = "none";
  } else {
    tip.textContent = "";
    tip.style.display = "none";
  }

  if (type !== "loading" && symbol) {
    setTimeout(() => {
      icon.textContent = "";
      tip.textContent = "";
      tip.style.display = "none";
    }, 1800);
  }
}

// ========== 3. State ==========
let uid = null;
let chatRef = null;
let userHasScrolled = false;

// ========== 4. Scroll Logic ==========
log.addEventListener("scroll", () => {
  const threshold = 100;
  userHasScrolled = (log.scrollTop + log.clientHeight + threshold < log.scrollHeight);
});

function scrollToBottom(force = false) {
  if (!userHasScrolled || force) {
    requestAnimationFrame(() => {
      log.scrollTop = log.scrollHeight;
    });
  }
}

// ========== 5. Render Messages ==========
function renderMessages(messages) {
  log.innerHTML = "";
  messages
    .sort((a, b) => a.timestamp - b.timestamp)
    .forEach((msg) => {
      const role = msg.role === "bot" ? "assistant" : msg.role;
      const div = document.createElement("div");
      div.className = `msg ${
        role === "user" ? "user-msg" :
        role === "assistant" ? "bot-msg" :
        "debug-msg"
      }`;
      div.innerHTML = msg.content;
      log.appendChild(div);
    });
  scrollToBottom();
}

// ========== 6. Debug Toggle ==========
const debugToggle = document.getElementById("debug-toggle");
if (debugToggle) {
  debugToggle.addEventListener("click", () => {
    if (typeof window.showDebugOverlay === "function") window.showDebugOverlay();
  });
}

// ========== 7. Firebase Auth ==========
onAuthStateChanged(auth, (user) => {
  if (!user) {
    signInAnonymously(auth);
    window.debugLog("Auth: Signed in anonymously.");
    setStatusIndicator("loading", "Signing in...");
    return;
  }
  uid = user.uid;
  chatRef = ref(db, `chatHistory/${uid}`);
  window.debugLog("Auth UID:", uid);

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

// ========== 8. Submit Handler ==========
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt || !uid) return;
  input.value = "";

  showChatInputSpinner(true);
  setStatusIndicator("loading", "Thinking...");
  window.debugLog("Prompt:", prompt);

  try {
    // Handle quick commands
    if (["/time", "/date", "/uid", "/clearchat", "/summary", "/commands"].includes(prompt)) {
      await handleStaticCommand(prompt, chatRef, uid);
      setStatusIndicator("success", "Command done");
      showChatInputSpinner(false);
      return;
    }

    if (prompt === "/notes") {
      await listNotes(chatRef);
      setStatusIndicator("success", "Notes listed");
      showChatInputSpinner(false);
      return;
    }
    if (prompt === "/reminders") {
      await listReminders(chatRef);
      setStatusIndicator("success", "Reminders listed");
      showChatInputSpinner(false);
      return;
    }
    if (prompt === "/events") {
      await listEvents(chatRef);
      setStatusIndicator("success", "Events listed");
      showChatInputSpinner(false);
      return;
    }

    // 1. Push user message
    await saveMessageToChat("user", prompt, uid);
    window.debugLog("Message saved.");

    // 2. Attempt memory extraction
    const memory = await extractMemoryFromPrompt(prompt, uid);
    if (memory) {
      setStatusIndicator("success", `Memory saved (${memory.type})`);
      window.debugLog("Memory extracted:", memory);
    }

    // 3. Build assistant prompt context
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

    // 4. Get assistant reply
    const assistantReply = await getAssistantReply(full);
    await saveMessageToChat("assistant", assistantReply, uid);
    window.logAssistantReply(assistantReply);
    updateHeaderWithAssistantReply(assistantReply);

    // 5. Check if summary is due
    await summarizeChatIfNeeded(uid);

    setStatusIndicator("success", "Sent!");
  } catch (err) {
    setStatusIndicator("error", "Something failed");
    window.debugLog("Submit error:", err.message || err);
  } finally {
    showChatInputSpinner(false);
  }
});