// 🔹 chat.js – Full assistant input and flow control

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
import {
  renderMessages,
  showChatInputSpinner,
  scrollToBottom,
  updateHeaderWithAssistantReply,
  initScrollTracking
} from "./uiShell.js";

// ========== 1. DOM ==========
const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");

// ========== 2. Scroll ==========
initScrollTracking();

// ========== 3. Auth ==========
let uid = null;
let chatRef = null;

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

  // ✅ Remove loader on auth success
  const loader = document.getElementById("initial-loader");
  if (loader) loader.remove();

  // Load latest messages
  onValue(chatRef, (snapshot) => {
    const data = snapshot.val() || {};
    const messages = Object.entries(data).map(([id, msg]) => ({
      id,
      role: msg.role === "bot" ? "assistant" : msg.role,
      content: msg.content,
      timestamp: msg.timestamp || 0
    }));
    window.debug("Chat history loaded", messages.length);
    renderMessages(messages.slice(-20));
  });
});

// ========== 4. Submission ==========
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt || !uid) return;
  input.value = "";

  showChatInputSpinner(true);
  window.setStatusFeedback("loading", "Thinking...");
  window.debug("[SUBMIT]", { uid, prompt });

  try {
    // Static Commands
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

    // Save user message
    await saveMessageToChat("user", prompt, uid);
    window.debug("[STEP 1] User message saved");

    // Try memory extraction
    const memory = await extractMemoryFromPrompt(prompt, uid);
    if (memory) {
      window.setStatusFeedback("success", `Memory saved (${memory.type})`);
      window.debug("[MEMORY]", memory);
    }

    // Build assistant prompt
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

    // Get assistant reply
    const reply = await getAssistantReply(full);
    await saveMessageToChat("assistant", reply, uid);
    window.logAssistantReply(reply);
    updateHeaderWithAssistantReply(reply);

    // Optional summary
    await summarizeChatIfNeeded(uid);
    window.setStatusFeedback("success", "Message sent");
  } catch (err) {
    window.setStatusFeedback("error", "Something went wrong");
    window.debug("[ERROR]", err.message || err);
  } finally {
    showChatInputSpinner(false);
  }
});