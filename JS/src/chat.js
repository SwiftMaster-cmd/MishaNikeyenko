// chat.js – Pure flow control, async, modular, non-blocking UX

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

import {
  appendNoteToFirebase
} from "./notes.js";

import {
  renderMessages,
  showChatInputSpinner,
  scrollToBottom,
  updateHeaderWithAssistantReply,
  initScrollTracking
} from "./uiShell.js";

const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const log = document.getElementById("chat-log");

let uid = null;

// Helper: Parse note commands
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
    loadInitialMessages();
    initScrollTracking();
  } else {
    await signInAnonymously(auth);
  }
});

// ========== 2. Load and render last 20 messages ==========
async function loadInitialMessages() {
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

// ========== 3. Main chat submit logic ==========
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const inputValue = input.value.trim();
  if (!inputValue) return;

  // Handle note command immediately
  if (isNoteCommand(inputValue)) {
    const noteContent = extractNoteContent(inputValue);
    if (noteContent.length > 0) {
      try {
        await appendNoteToFirebase(uid, noteContent);
        await saveMessageToChat('user', inputValue, uid);
        await saveMessageToChat('assistant', `Note saved: "${noteContent}"`, uid);
        renderMessages([
          ...await fetchLast20Messages(uid),
          { role: 'assistant', content: `Note saved: "${noteContent}"` }
        ]);
        input.value = '';
        scrollToBottom();
        return;
      } catch (err) {
        window.debug(`[ERROR] Saving note: ${err.message}`);
        return;
      }
    }
  }

  // User message: save and render instantly
  showChatInputSpinner(true);
  await saveMessageToChat('user', inputValue, uid);
  renderMessages([
    ...await fetchLast20Messages(uid),
    { role: 'user', content: inputValue },
    { role: 'assistant', content: '...' }
  ]);
  input.value = '';
  scrollToBottom();

  // Fetch context in parallel, get GPT reply, update
  let contextArr, assistantReply = "";
  try {
    const t0 = Date.now();
    contextArr = await getAllContext(uid); // Batch all context
    contextArr.push({ role: "user", content: inputValue, timestamp: Date.now() });
    window.debug(`[CONTEXT] Loaded in ${Date.now()-t0}ms`);
    const t1 = Date.now();
    assistantReply = await getAssistantReply(contextArr, uid);
    window.debug(`[GPT] Reply received in ${Date.now()-t1}ms`);
    await saveMessageToChat('assistant', assistantReply, uid);
  } catch (e) {
    assistantReply = "Error: Assistant unavailable.";
    window.debug(`[ERROR] Assistant: ${e.message}`);
    await saveMessageToChat('assistant', assistantReply, uid);
  }
  renderMessages([
    ...await fetchLast20Messages(uid),
    { role: 'assistant', content: assistantReply }
  ]);
  showChatInputSpinner(false);
  scrollToBottom();

  summarizeChatIfNeeded(uid);
});

// ========== 4. Live update when Firebase chatHistory changes ==========
onValue(ref(db, `chatHistory/${uid}`), async () => {
  const messages = await fetchLast20Messages(uid);
  renderMessages(messages);
  scrollToBottom();
});

window.debug(`[READY] chat.js loaded`);