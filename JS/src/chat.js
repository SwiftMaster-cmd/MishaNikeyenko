// 🔹 chat.js – Command pre-processing + GPT chat + persistent Firebase notes

import {
  onValue,
  ref,
  push,
  get,
  child
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

import {
  renderMessages,
  showChatInputSpinner,
  scrollToBottom,
  updateHeaderWithAssistantReply,
  initScrollTracking
} from "./uiShell.js";

// ---- Core state ----
const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
let uid = null;

// ----- Note Command Logic -----
function isNoteCommand(str) {
  const patterns = [
    /^save a note[-: ]?/i,
    /^\/note\b/i,
    /^remember\b/i,
    /\badd (a )?note\b/i
  ];
  return patterns.some((pat) => pat.test(str.trim()));
}
function extractNoteContent(str) {
  // Remove command phrases and return the rest
  return str
    .replace(/^save a note[-: ]?/i, '')
    .replace(/^\/note\b/i, '')
    .replace(/^remember\b/i, '')
    .replace(/\badd (a )?note\b/i, '')
    .trim();
}
function appendNoteToFirebase(uid, note) {
  const todayKey = new Date().toISOString().slice(0, 10);
  const notesRef = ref(db, `notes/${uid}/${todayKey}`);
  push(notesRef, {
    content: note,
    timestamp: Date.now()
  });
}

// ---- Auth and initial load ----
function startChat() {
  fetchLast20Messages(uid).then(messages => {
    renderMessages(messages);
    scrollToBottom();
  });
  initScrollTracking();
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    uid = user.uid;
    startChat();
  } else {
    signInAnonymously(auth);
  }
});

// ---- Main chat submit logic ----
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const inputValue = input.value.trim();
  if (!inputValue) return;

  // Check for note command first!
  if (isNoteCommand(inputValue)) {
    const noteContent = extractNoteContent(inputValue);
    if (noteContent.length > 0) {
      appendNoteToFirebase(uid, noteContent);
      // Save as chat too, for full chat context:
      await saveMessageToChat('user', inputValue, uid);
      await saveMessageToChat('assistant', `Note saved: "${noteContent}"`, uid);
      renderMessages([
        { role: 'user', content: inputValue },
        { role: 'assistant', content: `Note saved: "${noteContent}"` }
      ]);
      input.value = '';
      scrollToBottom();
      return; // Don't forward to GPT
    }
  }

  // ---- Normal GPT chat flow ----
  showChatInputSpinner(true);
  await saveMessageToChat('user', inputValue, uid);

  // Load context for GPT
  const contextArr = await getAllContext(uid);

  // Add user message
  contextArr.push({
    role: "user",
    content: inputValue,
    timestamp: Date.now()
  });

  // Get GPT reply
  let assistantReply = '';
  try {
    assistantReply = await getAssistantReply(contextArr, uid);
    await saveMessageToChat('assistant', assistantReply, uid);
  } catch (e) {
    assistantReply = "Error: Could not connect to assistant.";
    await saveMessageToChat('assistant', assistantReply, uid);
  }

  // Render in UI
  renderMessages([
    { role: 'user', content: inputValue },
    { role: 'assistant', content: assistantReply }
  ]);
  input.value = '';
  showChatInputSpinner(false);
  scrollToBottom();

  // Optionally summarize chat or handle memory extraction
  summarizeChatIfNeeded(uid);
});