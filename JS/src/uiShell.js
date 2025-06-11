// uiShell.js – Enhanced UI + message-click dispatch for background reaction

let userHasScrolled = false;
const canvas = document.getElementById("bg-canvas");

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
  if (!spinner) return;
  spinner.style.display = show ? "inline-block" : "none";
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
    requestAnimationFrame(() => log.scrollTo({ top: log.scrollHeight, behavior: "smooth" }));
  }
}

// ========== 4. Special-container detection & rendering ==========
function hasSpecialContainer(html) {
  return /class="(list-container|commands-container|search-results)"/.test(html);
}

function renderSpecialContainer(html, container) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html.trim();
  const special = wrapper.firstElementChild;
  if (!special) {
    container.innerHTML = html;
    return;
  }
  Object.assign(special.style, {
    maxHeight: "60vh",
    overflowY: "auto",
    background: "transparent",
    boxShadow: "none",
    margin: "var(--gap) 0",
    padding: "4px"
  });
  container.appendChild(special);
}

// ========== 5. Render messages w/ animation, role classes, and click dispatch ==========
export function renderMessages(messages) {
  const log = document.getElementById("chat-log");
  if (!log) return;
  log.innerHTML = "";

  messages
    .sort((a, b) => a.timestamp - b.timestamp)
    .forEach((msg, idx) => {
      const roleClass = (msg.role === "bot" || msg.role === "assistant") ? "received" : "sent";
      const wrapper = document.createElement("div");
      wrapper.className = `msg ${roleClass}`;

      // bubble or special container
      if (hasSpecialContainer(msg.content)) {
        renderSpecialContainer(msg.content, wrapper);
      } else {
        const bubble = document.createElement("div");
        bubble.className = "bubble";
        bubble.innerHTML = escapeAndLinkify(msg.content);
        wrapper.appendChild(bubble);
      }

      // dispatch canvas-relative click for background reaction
      wrapper.addEventListener("click", e => {
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const detail = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        canvas.dispatchEvent(new CustomEvent("messageClick", { detail }));
      });

      // entrance animation
      wrapper.style.opacity = 0;
      wrapper.style.transform = "translateY(10px)";
      wrapper.style.transition = `opacity 0.4s ease ${idx * 20}ms, transform 0.4s ease ${idx * 20}ms`;

      log.appendChild(wrapper);
      requestAnimationFrame(() => {
        wrapper.style.opacity = 1;
        wrapper.style.transform = "translateY(0)";
      });
    });

  scrollToBottom();
}

// ========== 6. Utility: escape & linkify ==========
function escapeAndLinkify(text) {
  const esc = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return esc.replace(
    /(https?:\/\/[^\s]+)/g,
    url => `<a href="${url}" target="_blank" rel="noopener">${url}</a>`
  );
}