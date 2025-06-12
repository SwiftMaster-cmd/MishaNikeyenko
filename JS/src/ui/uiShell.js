// uiShell.js – Updated: header animation, spinner, scroll tracking, structured rendering

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
  if (spinner) spinner.style.display = show ? "inline-block" : "none";
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

// ========== 4. Special container utils ==========
function hasSpecialContainer(html) {
  return /class="(list-container|commands-container|search-results|markdown-preview)"/.test(html);
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

// ========== 5. Render messages ==========
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

      if (hasSpecialContainer(msg.content)) {
        renderSpecialContainer(msg.content, div);
      } else {
        const bubble = document.createElement("div");
        bubble.className = "bubble";
        bubble.innerHTML = renderBubbleContent(msg.content, msg.metadata || {});
        div.appendChild(bubble);
      }

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

// ========== 6. Helpers ==========
function escapeAndLinkify(str) {
  const esc = str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return esc.replace(
    /(https?:\/\/[^\s]+)/g,
    url => `<a href="${url}" target="_blank" rel="noopener">${url}</a>`
  );
}

function renderBubbleContent(content, metadata) {
  const escaped = escapeAndLinkify(content);
  const { category, tags = [], topic } = metadata;

  let metaHTML = "";

  if (category || tags.length || topic) {
    metaHTML += `<div class="meta-line">`;
    if (category) metaHTML += `<span class="meta-badge category">${category}</span>`;
    if (topic) metaHTML += `<span class="meta-badge topic">${topic}</span>`;
    tags.forEach(tag => {
      metaHTML += `<span class="meta-badge tag">${tag}</span>`;
    });
    metaHTML += `</div>`;
  }

  return metaHTML + `<div class="msg-text">${escaped}</div>`;
}