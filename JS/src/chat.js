// 🔹 chat.js – assistant reply replaces <h1 id="header-title">

import {
  ref, push, onValue, get, child
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import { db, auth } from "./firebaseConfig.js";
import {
  getMemory, getDayLog, getNotes, getCalendar, getReminders, getCalcHistory, buildSystemPrompt
} from "./memoryManager.js";
import {
  handleStaticCommand, listNotes, listReminders, listEvents
} from "./commandHandlers.js";
import { extractJson, detectMemoryType } from "./chatUtils.js";

// ========== 1. UI Elements ==========
const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const log = document.getElementById("chat-log");
const header = document.getElementById("header-title");

function updateHeaderWithAssistantReply(text) {
  if (!header) return;
  header.textContent = text;
}

// ========== 2. Visual Feedback Utilities ==========

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
  let html = "", color = "";
  switch(type) {
    case "success": html = "✅"; color="#1db954"; break;
    case "error":   html = "❌"; color="#d7263d"; break;
    case "loading": html = "⏳"; color="#ffd600"; break;
    default:        html = ""; color=""; break;
  }
  icon.textContent = html;
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
    tip.style.fontWeight = (type === "success") ? "600" : "400";
    tip.style.fontSize = "1.04rem";
    tip.style.boxShadow = "none";
  } else {
    tip.textContent = "";
    tip.style.display = "none";
  }
  if (type !== "loading" && html) {
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

// ========== 6. Debug Overlay Button ==========
const debugToggle = document.getElementById("debug-toggle");
if (debugToggle) {
  debugToggle.addEventListener("click", () => {
    if (typeof window.showDebugOverlay === "function") window.showDebugOverlay();
  });
}

// ========== 7. Firebase Initialization ==========
onAuthStateChanged(auth, (user) => {
  if (!user) {
    signInAnonymously(auth);
    window.debugLog("Auth: Signed in anonymously.");
    setStatusIndicator("loading", "Signing in...");
    return;
  }
  uid = user.uid;
  chatRef = ref(db, `chatHistory/${uid}`);
  window.debugLog("Auth: UID is", uid);

  onValue(chatRef, (snapshot) => {
    const data = snapshot.val() || {};
    const allMessages = Object.entries(data).map(([id, msg]) => ({
      id,
      role: msg.role === "bot" ? "assistant" : msg.role,
      content: msg.content,
      timestamp: msg.timestamp || 0
    }));
    const last20 = allMessages.sort((a, b) => a.timestamp - b.timestamp).slice(-20);
    renderMessages(last20);
  });
});

// ========== 8. Submission ==========
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt || !chatRef || !uid) return;
  input.value = "";

  setStatusIndicator("loading", "Processing...");
  showChatInputSpinner(true);
  window.debugLog("User submitted:", prompt);

  try {
    const staticCommands = ["/time", "/date", "/uid", "/clearchat", "/summary", "/commands"];
    if (staticCommands.includes(prompt)) {
      await handleStaticCommand(prompt, chatRef, uid);
      setStatusIndicator("success", "Command executed!");
      window.debugLog("Static command handled:", prompt);
      showChatInputSpinner(false);
      return;
    }
    if (prompt === "/notes") {
      await listNotes(chatRef);
      setStatusIndicator("success", "Listed notes.");
      window.debugLog("Listed notes.");
      showChatInputSpinner(false);
      return;
    }
    if (prompt === "/reminders") {
      await listReminders(chatRef);
      setStatusIndicator("success", "Listed reminders.");
      window.debugLog("Listed reminders.");
      showChatInputSpinner(false);
      return;
    }
    if (prompt === "/events") {
      await listEvents(chatRef);
      setStatusIndicator("success", "Listed events.");
      window.debugLog("Listed events.");
      showChatInputSpinner(false);
      return;
    }

    const now = Date.now();
    await push(chatRef, { role: "user", content: prompt, timestamp: now });
    window.debugLog("User message pushed:", prompt);

    // === Assistant Reply Logic ===
    (async () => {
      const today = new Date().toISOString().slice(0, 10);

      let last20 = [];
      try {
        const snap = await get(child(ref(db), `chatHistory/${uid}`));
        const data = snap.exists() ? snap.val() : {};
        const allMsgs = Object.entries(data).map(([id, msg]) => ({
          role: msg.role === "bot" ? "assistant" : msg.role,
          content: msg.content,
          timestamp: msg.timestamp || 0
        }));
        last20 = allMsgs.sort((a, b) => a.timestamp - b.timestamp).slice(-20);
        window.debugLog("Fetched last 20 messages for context.");
      } catch (err) {
        window.debugLog("Error fetching last 20 for reply:", err.message, err);
      }

      let memory = {}, dayLog = {}, notes = {}, calendar = {}, reminders = {}, calc = {};
      try {
        [memory, dayLog, notes, calendar, reminders, calc] = await Promise.all([
          getMemory(uid), getDayLog(uid, today), getNotes(uid),
          getCalendar(uid), getReminders(uid), getCalcHistory(uid)
        ]);
        window.debugLog("Fetched memory/context.");
      } catch (err) {
        window.debugLog("Memory/context fetch error:", err.message, err);
      }

      const sysPrompt = buildSystemPrompt({
        memory, todayLog: dayLog, notes, calendar, reminders, calc, date: today
      });
      const full = [{ role: "system", content: sysPrompt }, ...last20];

      // Optional Memory Parse
      const { memoryType, rawPrompt } = detectMemoryType(prompt);
      if (memoryType) {
        try {
          setStatusIndicator("loading", "Extracting memory...");
          const parsed = await fetch("/.netlify/functions/chatgpt", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: [
                {
                  role: "system",
                  content: `
You are a memory extraction engine. ALWAYS return exactly one JSON object:
{ "type": "note"|"reminder"|"calendar"|"log", "content": "...", "date": "YYYY-MM-DD (optional)" }`
                },
                { role: "user", content: memoryType.startsWith("/") ? rawPrompt : prompt }
              ],
              model: "gpt-4o",
              temperature: 0.3
            })
          });
          const text = await parsed.text();
          const parsedJSON = JSON.parse(text);
          const extracted = extractJson(parsedJSON.choices?.[0]?.message?.content || "");
          if (extracted?.type && extracted?.content) {
            const path =
              extracted.type === "calendar"
                ? `calendarEvents/${uid}`
                : extracted.type === "reminder"
                ? `reminders/${uid}`
                : extracted.type === "log"
                ? `dayLog/${uid}/${today}`
                : `notes/${uid}/${today}`;
            await push(ref(db, path), {
              content: extracted.content,
              timestamp: Date.now(),
              ...(extracted.date ? { date: extracted.date } : {})
            });
            setStatusIndicator("success", `Memory saved (${extracted.type})!`);
          } else {
            setStatusIndicator("error", "Could not save memory.");
          }
        } catch (err) {
          window.debugLog("Memory parse/write failed:", err.message, err);
          setStatusIndicator("error", "Memory extraction failed.");
        }
      }

      // Assistant Reply
      let assistantReply = "[No reply]";
      try {
        setStatusIndicator("loading", "Assistant replying...");
        const replyRes = await fetch("/.netlify/functions/chatgpt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: full, model: "gpt-4o", temperature: 0.8 })
        });
        const replyData = await replyRes.json();
        assistantReply = replyData.choices?.[0]?.message?.content || assistantReply;
        window.debugLog("Assistant reply received:", assistantReply);
        setStatusIndicator("success", "Assistant replied!");
        updateHeaderWithAssistantReply(assistantReply); // ✅ THIS UPDATES THE TITLE
      } catch (err) {
        assistantReply = "[Assistant error: " + err.message + "]";
        window.debugLog("GPT reply error:", err.message, err);
        setStatusIndicator("error", "Failed to get assistant reply.");
      }

      try {
        await push(chatRef, { role: "assistant", content: assistantReply, timestamp: Date.now() });
        window.debugLog("Assistant reply pushed.");
      } catch (err) {
        window.debugLog("Failed to push assistant reply:", err.message, err);
        setStatusIndicator("error", "Failed to save assistant reply.");
      } finally {
        showChatInputSpinner(false);
      }
    })();

    setStatusIndicator("success", "Message sent!");
  } catch (err) {
    window.debugLog("Form submit error:", err.message, err);
    setStatusIndicator("error", "Request failed.");
    showChatInputSpinner(false);
  }
});