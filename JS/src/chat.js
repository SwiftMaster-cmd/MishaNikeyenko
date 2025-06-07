// chat.js – Modern, robust, async, modular

import { onValue, ref } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import { db, auth } from "./firebaseConfig.js";
import {
  saveMessageToChat,
  fetchLast20Messages,
  getAllContext,
  getAssistantReply,
  summarizeChatIfNeeded
} from "./backgpt.js";

import { appendNoteToFirebase } from "./notes.js";

import {
  renderMessages,
  showChatInputSpinner,
  scrollToBottom,
  updateHeaderWithAssistantReply,
  initScrollTracking
} from "./uiShell.js";

const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");

let uid = null;
let chatRef = null;
let chatListener = null;

// Helpers
function isNoteCommand(msg) {
  return /^\/?note\b/i.test(msg) || /^save a note\b/i.test(msg);
}
function extractNoteContent(msg) {
  let trimmed = msg.replace(/^\/?note\b[:\-]?\s*/i, "")
                   .replace(/^save a note\b[:\-]?\s*/i, "")
                   .trim();
  return trimmed;
}

// ========== 1. Auth/init ==========
onAuthStateChanged(auth, async (user) => {
  if (user) {
    uid = user.uid;
    window.debug(`[AUTH] UID: ${uid}`);
    chatRef = ref(db, `chatHistory/${uid}`);

    // Subscribe to chat changes only after uid is set
    if (chatListener) chatListener(); // Remove old if exists
    chatListener = onValue(chatRef, handleChatUpdate);

    await loadInitialMessages();
    initScrollTracking();
  } else {
    await signInAnonymously(auth);
  }
});

// ========== 2. Load and render last 20 messages ==========
async function loadInitialMessages() {
  if (!uid) return; // Wait for uid
  showChatInputSpinner(true);
  try {
    const messages = await fetchLast20Messages(uid);
    renderMessages(messages);
    scrollToBottom();
  } catch (e) {
    window.debug(`[ERROR] Failed to load messages: ${e.message}`);
  }
  showChatInputSpinner(false);
}

// ========== 3. Handle live chat updates ==========
async function handleChatUpdate() {
  if (!uid) return;
  try {
    const messages = await fetchLast20Messages(uid);
    renderMessages(messages);
    scrollToBottom();
  } catch (e) {
    window.debug(`[ERROR] Live update failed: ${e.message}`);
  }
}

// ========== 4. Main chat submit logic ==========
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!uid) return;

  const inputValue = input.value.trim();
  if (!inputValue) return;

  // Note command: save note immediately
  if (isNoteCommand(inputValue)) {
    const noteContent = extractNoteContent(inputValue);
    if (noteContent.length > 0) {
      try {
        await appendNoteToFirebase(uid, noteContent);
        await saveMessageToChat('user', inputValue, uid);
        await saveMessageToChat('assistant', `Note saved: "${noteContent}"`, uid);
        // Messages will auto-update via Firebase listener
        input.value = '';
        scrollToBottom();
        return;
      } catch (err) {
        window.debug(`[ERROR] Saving note: ${err.message}`);
        return;
      }
    }
  }

  // Normal user message
  showChatInputSpinner(true);
  await saveMessageToChat('user', inputValue, uid);
  // Optimistic UI: show user message + spinner
  renderMessages([
    ...(await fetchLast20Messages(uid)),
    { role: 'user', content: inputValue },
    { role: 'assistant', content: '...' }
  ]);
  input.value = '';
  scrollToBottom();

  // Assistant reply
  let contextArr, assistantReply = "";
  try {
    contextArr = await getAllContext(uid);
    contextArr.push({ role: "user", content: inputValue, timestamp: Date.now() });
    assistantReply = await getAssistantReply(contextArr, uid);
    await saveMessageToChat('assistant', assistantReply, uid);
  } catch (e) {
    assistantReply = "Error: Assistant unavailable.";
    window.debug(`[ERROR] Assistant: ${e.message}`);
    await saveMessageToChat('assistant', assistantReply, uid);
  }
  showChatInputSpinner(false);
  scrollToBottom();

  summarizeChatIfNeeded(uid);
});

window.debug(`[READY] chat.js loaded`);