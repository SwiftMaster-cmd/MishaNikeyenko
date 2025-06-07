// 🔹 chat.js – clean UI shell, all logic and feedback handled externally

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

// ========== 2. Visuals ==========
function updateHeaderWithAssistantReply(text) {
  if (!header) return;
  header.style.opacity = 0;
  setTimeout(() => {
    header.textContent = text;
    header.style.opacity = 1;
  }, 150);
}

function showChatInputSpinner(show = true) {
  const spinner = document.getElementById("chat-loading-spinner");
  const inputField = document.getElementById("user-input");
  if (spinner) spinner.style.display = show ? "inline-block" : "none";
  if (inputField) inputField.disabled = show;
}

// ========== 3. State ==========
let uid = null;
let chatRef = null;
let userHasScrolled = false;

// ========== 4. Scroll ==========
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

// ========== 5. Render Chat ==========
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
    window.setStatusFeedback("loading", "Signing in...");
    window.debug("Auth: Signing in anonymously...");
    return;
  }
  uid = user.uid;
  chatRef = ref(db, `chatHistory/${uid}`);
  window.debug("Auth Ready → UID:", uid);

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

// ========== 8. Chat Submit ==========
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt || !uid) return;
  input.value = "";

  showChatInputSpinner(true);
  window.setStatusFeedback("loading", "Thinking...");
  window.debug("[SUBMIT]", { uid, prompt });

  try {
    // --- Static commands
    const quick = ["/time", "/date", "/uid", "/clearchat", "/summary", "/commands"];
    if (quick.includes(prompt)) {
      await handleStaticCommand(prompt, chatRef, uid);
      window.setStatusFeedback("success", "Command executed");
      showChatInputSpinner(false);
      return;
    }
    if (prompt === "/notes") {
      await listNotes(chatRef);
      window.setStatusFeedback("success", "Notes listed");
      showChatInputSpinner(false);
      return;
    }
    if (prompt === "/reminders") {
      await listReminders(chatRef);
      window.setStatusFeedback("success", "Reminders listed");
      showChatInputSpinner(false);
      return;
    }
    if (prompt === "/events") {
      await listEvents(chatRef);
      window.setStatusFeedback("success", "Events listed");
      showChatInputSpinner(false);
      return;
    }

    // --- Step 1: Save user message
    await saveMessageToChat("user", prompt, uid);
    window.debug("[STEP 1] User message saved.");

    // --- Step 2: Memory extraction
    window.debug("[STEP 2] Checking for memory...");
    const memory = await extractMemoryFromPrompt(prompt, uid);
    if (memory) {
      window.setStatusFeedback("success", `Memory saved (${memory.type})`);
      window.debug("[MEMORY]", memory);
    }

    // --- Step 3: Build GPT context
    window.debug("[STEP 3] Fetching context...");
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
    window.debug("[GPT INPUT]", full);

    // --- Step 4: Get assistant reply
    const assistantReply = await getAssistantReply(full);
    await saveMessageToChat("assistant", assistantReply, uid);
    window.logAssistantReply(assistantReply);
    updateHeaderWithAssistantReply(assistantReply);

    // --- Step 5: Check if summary needed
    await summarizeChatIfNeeded(uid);
    window.setStatusFeedback("success", "Message sent");
  } catch (err) {
    window.setStatusFeedback("error", "Something went wrong");
    window.debug("[ERROR]", err.message || err);
  } finally {
    showChatInputSpinner(false);
  }
});