// 🔹 chat.js – modern feedback: chat spinner + top-right indicator + persistent console

import {
  ref,
  push,
  onValue,
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
  getMemory,
  getDayLog,
  getNotes,
  getCalendar,
  getReminders,
  getCalcHistory,
  buildSystemPrompt
} from "./memoryManager.js";
import {
  handleStaticCommand,
  listNotes,
  listReminders,
  listEvents
} from "./commandHandlers.js";
import { extractJson, detectMemoryType } from "./chatUtils.js";

// ========== 1. UI Elements ==========
const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const log = document.getElementById("chat-log");

// ========== 2. Visual Feedback Utilities ==========

function showChatInputSpinner(show = true) {
  const spinner = document.getElementById("chat-loading-spinner");
  const inputField = document.getElementById("user-input");
  if (spinner) spinner.style.display = show ? "inline-block" : "none";
  if (inputField) inputField.disabled = show;
}

function setStatusIndicator(type, tooltip = "") {
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
  if (tooltip) {
    tip.textContent = tooltip;
    tip.style.display = "inline";
  } else {
    tip.style.display = "none";
  }
  // Fade out automatically (except loading)
  if (type !== "loading" && html) {
    setTimeout(() => {
      icon.textContent = "";
      tip.style.display = "none";
    }, 1800);
  }
}

// ========== 3. Debug Logging (persistent to onscreen console) ==========
const debugInfo = [];
function addDebugMessage(...args) {
  if (typeof window.debugLog === "function") {
    window.debugLog(...args);
  }
  debugInfo.push(args.join(" "));
}

// ========== 4. State ==========
let uid = null;
let chatRef = null;
let userHasScrolled = false;

// ========== 5. Debug Overlay ==========
function createDebugOverlay() {
  const overlay = document.createElement("div");
  overlay.id = "debug-overlay";
  Object.assign(overlay.style, {
    display: "none",
    position: "fixed",
    top: "0",
    left: "0",
    width: "100vw",
    height: "100vh",
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    zIndex: 9999
  });

  const modal = document.createElement("div");
  modal.id = "debug-modal";
  Object.assign(modal.style, {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    backgroundColor: "var(--clr-card)",
    color: "var(--clr-text)",
    padding: "1rem 1.5rem",
    borderRadius: "12px",
    boxShadow: "0 2px 10px rgba(0, 0, 0, 0.5)",
    maxWidth: "80vw",
    maxHeight: "80vh",
    overflowY: "auto",
    border: "1px solid var(--clr-border)"
  });

  const closeBtn = document.createElement("button");
  closeBtn.className = "close-btn";
  closeBtn.textContent = "Close";
  Object.assign(closeBtn.style, {
    position: "absolute",
    top: "8px",
    right: "8px",
    background: "var(--clr-border)",
    color: "var(--clr-text)",
    border: "none",
    padding: "4px 8px",
    cursor: "pointer",
    borderRadius: "4px",
    fontSize: "0.9rem"
  });
  closeBtn.addEventListener("click", () => {
    overlay.style.display = "none";
  });

  const contentDiv = document.createElement("div");
  contentDiv.id = "debug-content";
  Object.assign(contentDiv.style, {
    marginTop: "32px",
    whiteSpace: "pre-wrap",
    fontFamily: "monospace",
    fontSize: "0.9rem",
    lineHeight: "1.4"
  });

  modal.appendChild(closeBtn);
  modal.appendChild(contentDiv);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}
function showDebugOverlay() {
  const overlay = document.getElementById("debug-overlay");
  const contentDiv = document.getElementById("debug-content");
  if (!overlay || !contentDiv) return;
  contentDiv.textContent = debugInfo.join("\n");
  overlay.style.display = "block";
}

// ========== 6. Scroll Logic ==========
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

// ========== 7. Render Messages ==========
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

// ========== 8. Debug Button Integration ==========
createDebugOverlay();
const debugToggle = document.getElementById("debug-toggle");
if (debugToggle) {
  debugToggle.addEventListener("click", showDebugOverlay);
}

// ========== 9. Firebase Auth/Chat Initialization ==========
onAuthStateChanged(auth, (user) => {
  if (!user) {
    signInAnonymously(auth);
    addDebugMessage("Auth: Signed in anonymously.");
    setStatusIndicator("loading", "Signing in...");
    return;
  }
  uid = user.uid;
  chatRef = ref(db, `chatHistory/${uid}`);
  addDebugMessage("Auth: UID is", uid);

  // Listen to chatHistory changes and re-render last 20
  onValue(chatRef, (snapshot) => {
    const data = snapshot.val() || {};
    const allMessages = Object.entries(data).map(([id, msg]) => ({
      id,
      role: msg.role === "bot" ? "assistant" : msg.role,
      content: msg.content,
      timestamp: msg.timestamp || 0
    }));
    const last20 = allMessages
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-20);
    renderMessages(last20);
  });
});

// ========== 10. Main Submit Logic ==========
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt || !chatRef || !uid) return;
  input.value = "";

  setStatusIndicator("loading", "Processing...");
  showChatInputSpinner(true);
  addDebugMessage("User submitted:", prompt);

  try {
    // --- Command/Listing Shortcuts ---
    const staticCommands = ["/time", "/date", "/uid", "/clearchat", "/summary", "/commands"];
    if (staticCommands.includes(prompt)) {
      await handleStaticCommand(prompt, chatRef, uid);
      setStatusIndicator("success", "Command executed!");
      addDebugMessage("Static command handled:", prompt);
      showChatInputSpinner(false);
      return;
    }
    if (prompt === "/notes") {
      await listNotes(chatRef);
      setStatusIndicator("success", "Listed notes.");
      addDebugMessage("Listed notes.");
      showChatInputSpinner(false);
      return;
    }
    if (prompt === "/reminders") {
      await listReminders(chatRef);
      setStatusIndicator("success", "Listed reminders.");
      addDebugMessage("Listed reminders.");
      showChatInputSpinner(false);
      return;
    }
    if (prompt === "/events") {
      await listEvents(chatRef);
      setStatusIndicator("success", "Listed events.");
      addDebugMessage("Listed events.");
      showChatInputSpinner(false);
      return;
    }

    // 1) Push user message
    const now = Date.now();
    await push(chatRef, { role: "user", content: prompt, timestamp: now });
    addDebugMessage("User message pushed:", prompt);

    // 2) In parallel: assistant reply + memory write
    (async () => {
      const today = new Date().toISOString().slice(0, 10);

      // a) Fetch last 20 messages for context
      let last20 = [];
      try {
        const snap = await get(child(ref(db), `chatHistory/${uid}`));
        const data = snap.exists() ? snap.val() : {};
        const allMsgs = Object.entries(data).map(([id, msg]) => ({
          role: msg.role === "bot" ? "assistant" : msg.role,
          content: msg.content,
          timestamp: msg.timestamp || 0
        }));
        last20 = allMsgs
          .sort((a, b) => a.timestamp - b.timestamp)
          .slice(-20);
        addDebugMessage("Fetched last 20 messages for context.");
      } catch (err) {
        addDebugMessage("Error fetching last 20 for reply:", err.message, err);
      }

      // b) Fetch memory/context
      let memory = {}, dayLog = {}, notes = {}, calendar = {}, reminders = {}, calc = {};
      try {
        [memory, dayLog, notes, calendar, reminders, calc] = await Promise.all([
          getMemory(uid),
          getDayLog(uid, today),
          getNotes(uid),
          getCalendar(uid),
          getReminders(uid),
          getCalcHistory(uid)
        ]);
        addDebugMessage("Fetched memory/context.");
      } catch (err) {
        addDebugMessage("Memory/context fetch error:", err.message, err);
      }

      // c) Build system prompt + conversation for assistant
      const sysPrompt = buildSystemPrompt({
        memory,
        todayLog: dayLog,
        notes,
        calendar,
        reminders,
        calc,
        date: today
      });
      const full = [{ role: "system", content: sysPrompt }, ...last20];

      // d) Detect "memory" commands and write to appropriate nodes
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
You are a memory extraction engine. ALWAYS return exactly one JSON object with these keys:
{
  "type":   "note" | "reminder" | "calendar" | "log",
  "content": "string",
  "date":   "optional YYYY-MM-DD"
}

RULES:
1. If text begins with "/note", type="note".
2. If it begins with "/reminder" or "remind me", type="reminder".
3. If it mentions a date/time (e.g. "tomorrow", "Friday", "on 2025-06-10"), type="calendar".
4. If it begins with "/log" or includes "journal", type="log".
5. Otherwise, type="note" as a last resort.
6. Populate "date" only when explicitly given.
7. Return ONLY the JSON block.`
                },
                { role: "user", content: memoryType.startsWith("/") ? rawPrompt : prompt }
              ],
              model: "gpt-4o",
              temperature: 0.3
            })
          });
          const text = await parsed.text();
          addDebugMessage("Memory extraction response raw:", text);
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
            addDebugMessage(`Memory saved: type=${extracted.type}, content="${extracted.content}"`);
            setStatusIndicator("success", `Memory saved (${extracted.type})!`);
          } else {
            addDebugMessage("Incomplete memory structure returned");
            setStatusIndicator("error", "Could not save memory.");
          }
        } catch (err) {
          addDebugMessage("Memory parse/write failed:", err.message, err);
          setStatusIndicator("error", "Memory extraction failed.");
        }
      }

      // e) Get the assistant’s reply from GPT
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
        addDebugMessage("Assistant reply received:", assistantReply);
        setStatusIndicator("success", "Assistant replied!");
      } catch (err) {
        addDebugMessage("GPT reply error:", err.message, err);
        assistantReply = "[Assistant error: " + err.message + "]";
        setStatusIndicator("error", "Failed to get assistant reply.");
      }

      // f) Push the assistant’s reply into chatHistory
      try {
        await push(chatRef, { role: "assistant", content: assistantReply, timestamp: Date.now() });
        addDebugMessage("Assistant reply pushed.");
      } catch (err) {
        addDebugMessage("Failed to push assistant reply:", err.message, err);
        setStatusIndicator("error", "Failed to save assistant reply.");
      } finally {
        showChatInputSpinner(false);
      }
    })();

    // 3) In parallel: if total messages is a multiple of 20, summarize and save to memory
    (async () => {
      let allCount = 0;
      let last20ForSummary = [];
      try {
        const snap = await get(child(ref(db), `chatHistory/${uid}`));
        const data = snap.exists() ? snap.val() : {};
        allCount = Object.keys(data).length;
        const allMessages = Object.entries(data).map(([id, msg]) => ({
          role: msg.role === "bot" ? "assistant" : msg.role,
          content: msg.content,
          timestamp: msg.timestamp || 0
        }));
        last20ForSummary = allMessages
          .sort((a, b) => a.timestamp - b.timestamp)
          .slice(-20);
      } catch (err) {
        addDebugMessage("Error fetching chatHistory for summary:", err.message, err);
        return;
      }

      if (allCount > 0 && allCount % 20 === 0) {
        const convoText = last20ForSummary
          .map(m => `${m.role === "assistant" ? "Assistant" : "User"}: ${m.content}`)
          .join("\n");

        try {
          setStatusIndicator("loading", "Summarizing...");
          const summaryRes = await fetch("/.netlify/functions/chatgpt", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: [
                {
                  role: "system",
                  content: `You are a concise summarizer. Summarize the following conversation block into one paragraph:`
                },
                { role: "user", content: convoText }
              ],
              model: "gpt-4o",
              temperature: 0.5
            })
          });
          const summaryJson = await summaryRes.json();
          const summary = summaryJson.choices?.[0]?.message?.content || "[No summary]";
          await push(ref(db, `memory/${uid}`), {
            summary,
            timestamp: Date.now()
          });
          addDebugMessage("20-message summary saved to memory.");
          setStatusIndicator("success", "Chat summarized.");
        } catch (err) {
          addDebugMessage("Summary generation failed:", err.message, err);
          setStatusIndicator("error", "Summary failed.");
        }
      }
    })();

    setStatusIndicator("success", "Message sent!");
  } catch (err) {
    addDebugMessage("Form submit error:", err.message, err);
    setStatusIndicator("error", "Request failed.");
    showChatInputSpinner(false);
  }
});