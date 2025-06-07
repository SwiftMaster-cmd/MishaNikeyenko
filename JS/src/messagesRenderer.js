// 🔹 messageRenderer.js

export function renderMessages(logEl, messages, scrollToBottom) {
  logEl.innerHTML = "";
  messages
    .sort((a, b) => a.timestamp - b.timestamp)
    .forEach(({ role, content }) => {
      const div = document.createElement("div");
      div.className = role === "user"
        ? "msg user-msg"
        : role === "assistant"
        ? "msg bot-msg"
        : "msg debug-msg";
      div.innerHTML = content;
      logEl.append(div);
    });
  scrollToBottom();
}