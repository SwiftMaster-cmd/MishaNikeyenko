// messageRenderer.js

let userHasScrolled = false;

/**
 * Listen on a scrollable container to detect if the user scrolled up manually.
 * @param {HTMLElement} logElement
 */
export function attachScrollListener(logElement) {
  logElement.addEventListener("scroll", () => {
    const threshold = 100;
    userHasScrolled = (logElement.scrollTop + logElement.clientHeight + threshold < logElement.scrollHeight);
  });
}

/**
 * Scroll the log container to bottom if the user hasn’t manually scrolled.
 * @param {HTMLElement} logElement
 * @param {boolean} force - If true, always scroll down.
 */
export function scrollToBottom(logElement, force = false) {
  if (!userHasScrolled || force) {
    requestAnimationFrame(() => {
      logElement.scrollTop = logElement.scrollHeight;
    });
  }
}

/**
 * Render an array of message objects into the log container.
 * @param {HTMLElement} logElement
 * @param {Array<{ role: string, content: string, timestamp: number }>} messages
 */
export function renderMessages(logElement, messages) {
  logElement.innerHTML = "";
  messages
    .sort((a, b) => a.timestamp - b.timestamp)
    .forEach((msg) => {
      const role = (msg.role === "bot") ? "assistant" : msg.role;
      const div = document.createElement("div");
      div.className = `msg ${
        role === "user" ? "user-msg" :
        role === "assistant" ? "bot-msg" :
        "debug-msg"
      }`;
      div.innerHTML = msg.content;
      logElement.appendChild(div);
    });

  scrollToBottom(logElement);
}