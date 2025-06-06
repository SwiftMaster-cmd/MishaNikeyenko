// 🔹 chatUI.js -- UI handling and rendering
export const form = document.getElementById("chat-form");
export const input = document.getElementById("user-input");
export const log = document.getElementById("chat-log");

let userHasScrolled = false;

export function addDebugMessage(text) {
  const div = document.createElement("div");
  div.className = "msg debug-msg";
  div.textContent = `[DEBUG] ${text}`;
  log.appendChild(div);
  scrollToBottom(true);
}

export function renderMessages(messages) {
  log.innerHTML = "";
  messages
    .sort((a, b) => a.timestamp - b.timestamp)
    .forEach((msg) => {
      const role = msg.role === "bot" ? "assistant" : msg.role;
      const div = document.createElement("div");
      div.className = `msg ${role === "user" ? "user-msg" : role === "assistant" ? "bot-msg" : "debug-msg"}`;
      div.textContent = msg.content;
      log.appendChild(div);
    });
  scrollToBottom();
}

function scrollToBottom(force = false) {
  if (!userHasScrolled || force) {
    requestAnimationFrame(() => {
      log.scrollTop = log.scrollHeight;
    });
  }
}

export function setupScrollListener() {
  log.addEventListener("scroll", () => {
    const threshold = 100;
    userHasScrolled = (log.scrollTop + log.clientHeight + threshold < log.scrollHeight);
  });
}