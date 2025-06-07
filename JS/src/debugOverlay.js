// 🔹 debugOverlay.js

let debugInfo = [];

export function addDebugMessage(text) {
  debugInfo.push(`${new Date().toLocaleTimeString()}: ${text}`);
}

export function createDebugOverlay() {
  const overlay = document.createElement("div");
  overlay.id = "debug-overlay";
  Object.assign(overlay.style, {
    display: "none",
    position: "fixed",
    top: 0, left: 0,
    width: "100vw",
    height: "100vh",
    backgroundColor: "rgba(0,0,0,0.85)",
    zIndex: 9999
  });

  const modal = document.createElement("div");
  modal.id = "debug-modal";
  Object.assign(modal.style, {
    position: "absolute",
    top: "50%", left: "50%",
    transform: "translate(-50%,-50%)",
    backgroundColor: "var(--clr-card)",
    color:      "var(--clr-text)",
    padding:    "1rem 1.5rem",
    borderRadius: "12px",
    maxWidth:   "80vw",
    maxHeight:  "80vh",
    overflowY:  "auto",
    border:     "1px solid var(--clr-border)"
  });

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "Close";
  Object.assign(closeBtn.style, {
    position: "absolute",
    top: "8px", right: "8px",
    background: "var(--clr-border)",
    color:      "var(--clr-text)",
    border:     "none",
    padding:    "4px 8px",
    cursor:     "pointer",
    borderRadius: "4px",
    fontSize:   "0.9rem"
  });
  closeBtn.addEventListener("click", () => overlay.style.display = "none");

  const contentDiv = document.createElement("div");
  contentDiv.id = "debug-content";
  Object.assign(contentDiv.style, {
    marginTop: "32px",
    whiteSpace: "pre-wrap",
    fontFamily: "monospace",
    fontSize: "0.9rem",
    lineHeight: "1.4"
  });

  modal.append(closeBtn, contentDiv);
  overlay.append(modal);
  document.body.append(overlay);
}

export function showDebugOverlay() {
  const overlay = document.getElementById("debug-overlay");
  const content = document.getElementById("debug-content");
  if (!overlay || !content) return;
  content.textContent = debugInfo.join("\n");
  overlay.style.display = "block";
}