// 🔹 chat.js – dual-mode memory saving + hover-to-view debug/info overlay + visual feedback

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

// --- VISUAL FEEDBACK UTILS ---
function showLoading(msg = "Processing...") {
  let loading = document.getElementById("loading-overlay");
  if (!loading) {
    loading = document.createElement("div");
    loading.id = "loading-overlay";
    loading.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;background:#000a;z-index:99999;display:flex;align-items:center;justify-content:center;font-size:2rem;color:#fff;";
    document.body.appendChild(loading);
  }
  loading.textContent = msg;
  loading.style.display = "flex";
}
function hideLoading() {
  const loading = document.getElementById("loading-overlay");
  if (loading) loading.style.display = "none";
}
function showToast(msg, isError = false) {
  let toast = document.getElementById("toast-banner");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast-banner";
    toast.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:12px 28px;border-radius:8px;background:#222;color:#fff;z-index:99999;font-size:1.1rem;box-shadow:0 2px 8px #0008;transition:opacity .2s;";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.background = isError ? "#d7263d" : "#22793c";
  toast.style.opacity = "1";
  setTimeout(() => { toast.style.opacity = "0"; }, 2500);
}

// --- UI Elements ---
const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const log = document.getElementById("chat-log");

// --- Persistent Debug ---
const debugInfo = [];
function addDebugMessage(...args) {
  if (typeof window.debugLog === "function") {
    window.debugLog(...args);
  }
  debugInfo.push(args.join(" "));
}

// --- State ---
let uid = null;
let chatRef = null;
let userHasScrolled = false;

// --- Debug Overlay Setup ---
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

// --- Scroll Logic ---
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

// --- Render Messages ---
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

// --- Debug Button Integration ---
createDebugOverlay();
const debugToggle = document.getElementById("debug-toggle");
if (debugToggle) {
  debugToggle.addEventListener("click", showDebugOverlay);
}

// --- Firebase Auth/Chat Initialization ---
onAuthStateChanged(auth, (user) => {
  if (!user) {
    signInAnonymously(auth);
    addDebugMessage("Auth: Signed in anonymously.");
    showToast("Signed in anonymously");
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

// --- Main Submit Logic ---
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt || !chatRef || !uid) return;
  input.value = "";

  showLoading("Processing...");
  addDebugMessage("User submitted:", prompt);

  try {
    // --- Command/Listing Shortcuts ---
    const staticCommands = ["/time", "/date", "/uid", "/clearchat", "/summary", "/commands"];
    if (staticCommands.includes(prompt)) {
      await handleStaticCommand(prompt, chatRef, uid);
      showToast("Command executed!");
      addDebugMessage("Static command handled:", prompt);
      hideLoading();
      return;
    }
    if (prompt === "/notes") {
      await listNotes(chatRef);
      showToast("Listed notes.");
      addDebugMessage("Listed notes.");
      hideLoading();
      return;
    }
    if (prompt === "/reminders") {
      await listReminders(chatRef);
      showToast("Listed reminders.");
      addDebugMessage("Listed reminders.");
      hideLoading();
      return;
    }
    if (prompt === "/events") {
      await listEvents(chatRef);
      showToast("Listed events.");
      addDebugMessage("Listed events.");
      hideLoading();
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
          showLoading("Extracting memory...");
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
            showToast(`Memory saved (${extracted.type})!`);
          } else {
            addDebugMessage("Incomplete memory structure returned");
            showToast("Could not save memory (incomplete structure).", true);
          }
        } catch (err) {
          addDebugMessage("Memory parse/write failed:", err.message, err);
          showToast("Memory extraction failed.", true);
        } finally {
          hideLoading();
        }
      }

      // e) Get the assistant’s reply from GPT
      let assistantReply = "[No reply]";
      try {
        showLoading("Getting assistant reply...");
        const replyRes = await fetch("/.netlify/functions/chatgpt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: full, model: "gpt-4o", temperature: 0.8 })
        });
        const replyData = await replyRes.json();
        assistantReply = replyData.choices?.[0]?.message?.content || assistantReply;
        addDebugMessage("Assistant reply received:", assistantReply);
      } catch (err) {
        addDebugMessage("GPT reply error:", err.message, err);
        assistantReply = "[Assistant error: " + err.message + "]";
        showToast("Failed to get assistant reply.", true);
      } finally {
        hideLoading();
      }

      // f) Push the assistant’s reply into chatHistory
      try {
        await push(chatRef, { role: "assistant", content: assistantReply, timestamp: Date.now() });
        showToast("Assistant replied!");
        addDebugMessage("Assistant reply pushed.");
      } catch (err) {
        addDebugMessage("Failed to push assistant reply:", err.message, err);
        showToast("Failed to save assistant reply.", true);
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
          showLoading("Summarizing...");
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
          showToast("Chat summarized.");
        } catch (err) {
          addDebugMessage("Summary generation failed:", err.message, err);
          showToast("Summary generation failed.", true);
        } finally {
          hideLoading();
        }
      }
    })();

    showToast("Message sent!");
  } catch (err) {
    addDebugMessage("Form submit error:", err.message, err);
    showToast("Error processing your request.", true);
    hideLoading();
  }
});