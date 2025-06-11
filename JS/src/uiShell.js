// uiShell.js – Enhanced UI + magic hooks + click interactions

let userHasScrolled = false;

// 1. Header animation + magic on receive
export function updateHeaderWithAssistantReply(text) {
  const header = document.getElementById("header-title");
  if (!header) return;
  header.style.transition = "opacity 0.3s ease";
  header.style.opacity = 0;
  setTimeout(() => {
    header.textContent = text;
    header.style.opacity = 1;
    // magic burst on receive
    if (window.triggerMagicOnReceive) window.triggerMagicOnReceive();
  }, 150);
}

// 2. Chat input spinner
export function showChatInputSpinner(show = true) {
  const spinner = document.getElementById("chat-loading-spinner");
  if (spinner) spinner.style.display = show ? "inline-block" : "none";
}

// 3. Scroll tracking
export function initScrollTracking() {
  const log = document.getElementById("chat-log");
  if (!log) return;
  log.addEventListener("scroll", () => {
    const threshold = 100;
    userHasScrolled = (log.scrollTop + log.clientHeight + threshold < log.scrollHeight);
  });
}

// 4. Smooth scroll to bottom
export function scrollToBottom(force = false) {
  const log = document.getElementById("chat-log");
  if (!log) return;
  if (!userHasScrolled || force) {
    requestAnimationFrame(() => {
      log.scrollTo({ top: log.scrollHeight, behavior: "smooth" });
    });
  }
}

// 5. Inline‐container detection & rendering
function hasSpecialContainer(html) {
  return /class="(list-container|commands-container|search-results)"/.test(html);
}
function renderSpecialContainer(html, targetDiv) {
  const temp = document.createElement("div");
  temp.innerHTML = html.trim();
  const special = temp.firstElementChild;
  if (!special) {
    targetDiv.innerHTML = html;
    return;
  }
  special.style.maxHeight = "60vh";
  special.style.overflowY = "auto";
  special.style.background = "transparent";
  special.style.boxShadow = "none";
  special.style.margin = "var(--gap) 0";
  special.style.padding = "4px";
  targetDiv.appendChild(special);
}

// 6. Escape & linkify
function escapeAndLinkify(str) {
  const esc = str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc.replace(/(https?:\/\/[^\s]+)/g,
    url => `<a href="${url}" target="_blank" rel="noopener">${url}</a>`
  );
}

// 7. Render all messages + animations + click hooks
export function renderMessages(messages) {
  const log = document.getElementById("chat-log");
  if (!log) return;
  log.innerHTML = "";

  messages
    .sort((a, b) => a.timestamp - b.timestamp)
    .forEach((msg, index) => {
      const role = msg.role === "bot" ? "assistant" : msg.role;
      const div = document.createElement("div");
      div.className = `msg ${role === "user" ? "user-msg" : role === "assistant" ? "bot-msg" : "debug-msg"}`;

      // inline containers
      if (hasSpecialContainer(msg.content)) {
        renderSpecialContainer(msg.content, div);
      } else {
        const bubble = document.createElement("div");
        bubble.className = "bubble";
        bubble.innerHTML = escapeAndLinkify(msg.content);
        div.appendChild(bubble);
      }

      // fade-in + slide-up
      div.style.opacity = 0;
      div.style.transform = "translateY(10px)";
      div.style.transition = `opacity 0.4s ease ${index * 20}ms, transform 0.4s ease ${index * 20}ms`;

      // click handler → magic at click coords
      div.addEventListener("click", e => {
        if (window.triggerMagicAt) {
          const rect = div.getBoundingClientRect();
          // relative to canvas: use event client coords
          window.triggerMagicAt(e.clientX, e.clientY);
        }
      });

      log.appendChild(div);
      requestAnimationFrame(() => {
        div.style.opacity = 1;
        div.style.transform = "translateY(0)";
      });
    });

  // magic burst on receive for final assistant message
  const last = messages[messages.length - 1];
  if (last && last.role === "assistant" && window.triggerMagicOnReceive) {
    window.triggerMagicOnReceive();
  }

  scrollToBottom();
}

// 8. Hook for send → triggerMagicOnSend
// Call this before you dispatch user message in sendMessage():
//   if (window.triggerMagicOnSend) window.triggerMagicOnSend();