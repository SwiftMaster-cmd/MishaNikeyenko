// 🔹 scrollManager.js

export function initScroll(logEl) {
  let userScrolled = false;
  logEl.addEventListener("scroll", () => {
    userScrolled = logEl.scrollTop + logEl.clientHeight + 100 < logEl.scrollHeight;
  });
  return function scrollToBottom(force = false) {
    if (!userScrolled || force) {
      requestAnimationFrame(() => {
        logEl.scrollTop = logEl.scrollHeight;
      });
    }
  };
}