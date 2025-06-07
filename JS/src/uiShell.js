// 🔹 uiShell.js – Enhanced UI: header animation, spinner, scroll, and animated message rendering

let userHasScrolled = false;

// ========== 1. Header animation ==========
export function updateHeaderWithAssistantReply(text) {
  const header = document.getElementById("header-title");
  if (!header) return;
  header.style.transition = "opacity 0.3s ease";
  header.style.opacity = 0;
  setTimeout(() => {
    header.textContent = text;
    header.style.opacity = 1;
  }, 150);
}

// ========== 2. Chat input spinner ==========
export function showChatInputSpinner(show = true) {
  const spinner = document.getElementById("chat-loading-spinner");
  const inputField = document.getElementById("user-input");
  if (spinner) spinner.style.display = show ? "inline-block" : "none";
  if (inputField) inputField.disabled = show;
}

// ========== 3. Scroll control ==========
export function initScrollTracking() {
  const log = document.getElementById("chat-log");
  if (!log) return;
  log.addEventListener("scroll", () => {
    const threshold = 100;
    userHasScrolled = (log.scrollTop + log.clientHeight + threshold < log.scrollHeight);
  });
}

export function scrollToBottom(force = false) {
  const log = document.getElementById("chat-log");
  if (!log) return;
  if (!userHasScrolled || force) {
    requestAnimationFrame(() => {
      log.scrollTo({ top: log.scrollHeight, behavior: "smooth" });
    });
  }
}

// ========== 4. Render messages w/ animation ==========
export function renderMessages(messages) {
  const log = document.getElementById("chat-log");
  if (!log) return;

  log.innerHTML = "";

  messages
    .sort((a, b) => a.timestamp - b.timestamp)
    .forEach((msg, index) => {
      const role = msg.role === "bot" ? "assistant" : msg.role;
      const div = document.createElement("div");
      div.className = `msg ${
        role === "user" ? "user-msg" :
        role === "assistant" ? "bot-msg" :
        "debug-msg"
      }`;
      div.innerHTML = msg.content;
      div.style.opacity = 0;
      div.style.transform = "translateY(10px)";
      div.style.transition = `opacity 0.4s ease ${index * 20}ms, transform 0.4s ease ${index * 20}ms`;
      log.appendChild(div);
      requestAnimationFrame(() => {
        div.style.opacity = 1;
        div.style.transform = "translateY(0)";
      });
    });

  scrollToBottom();
}