const debugInfo = [];
const lastNodeData = {};  // NEW: keeps the last snapshot per label

export function addDebugMessage(...args) {
  if (typeof window.debugLog === "function") window.debugLog(...args);
  debugInfo.push(args.join(" "));
  // Optionally trim debugInfo for performance:
  // if (debugInfo.length > 200) debugInfo.shift();
}

// New function to set and show node snapshot for a label
export function setDebugNodeData(label, data) {
  lastNodeData[label] = data;
}

// Overlay modal setup
export function createDebugOverlay() {
  if (document.getElementById("debug-overlay")) return; // Only once
  const overlay = document.createElement("div");
  overlay.id = "debug-overlay";
  Object.assign(overlay.style, {
    display: "none",
    position: "fixed",
    top: "0", left: "0", width: "100vw", height: "100vh",
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    zIndex: 9999
  });

  const modal = document.createElement("div");
  modal.id = "debug-modal";
  Object.assign(modal.style, {
    position: "absolute", top: "50%", left: "50%",
    transform: "translate(-50%, -50%)",
    backgroundColor: "var(--clr-card)",
    color: "var(--clr-text)",
    padding: "1rem 1.5rem", borderRadius: "12px",
    boxShadow: "0 2px 10px rgba(0,0,0,0.5)",
    maxWidth: "80vw", maxHeight: "80vh",
    overflowY: "auto", border: "1px solid var(--clr-border)"
  });

  const closeBtn = document.createElement("button");
  closeBtn.className = "close-btn";
  closeBtn.textContent = "Close";
  Object.assign(closeBtn.style, {
    position: "absolute", top: "8px", right: "8px",
    background: "var(--clr-border)", color: "var(--clr-text)",
    border: "none", padding: "4px 8px", cursor: "pointer",
    borderRadius: "4px", fontSize: "0.9rem"
  });
  closeBtn.addEventListener("click", () => { overlay.style.display = "none"; });

  const contentDiv = document.createElement("div");
  contentDiv.id = "debug-content";
  Object.assign(contentDiv.style, {
    marginTop: "32px", whiteSpace: "pre-wrap",
    fontFamily: "monospace", fontSize: "0.9rem", lineHeight: "1.4"
  });

  // NEW: Node snapshot container
  const snapshotDiv = document.createElement("div");
  snapshotDiv.id = "debug-snapshots";
  Object.assign(snapshotDiv.style, {
    marginTop: "16px",
    background: "#232336",
    padding: "10px 16px",
    borderRadius: "9px",
    fontFamily: "monospace",
    fontSize: "0.93rem",
    color: "#a9f8fd",
    maxHeight: "240px",
    overflowY: "auto"
  });

  modal.appendChild(closeBtn);
  modal.appendChild(contentDiv);
  modal.appendChild(snapshotDiv); // Add below log
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

export function showDebugOverlay() {
  const overlay = document.getElementById("debug-overlay");
  const contentDiv = document.getElementById("debug-content");
  const snapshotDiv = document.getElementById("debug-snapshots");
  if (!overlay || !contentDiv || !snapshotDiv) return;

  // Debug log
  contentDiv.textContent = debugInfo.join("\n");

  // Show each last snapshot
  let out = "";
  for (const label in lastNodeData) {
    out += `\n\n${label}:\n` +
      JSON.stringify(lastNodeData[label], null, 2);
  }
  snapshotDiv.textContent = out.trim() || "[No database snapshots yet]";
  overlay.style.display = "block";
}

// For keyboard shortcut (optional)
export function setupDebugShortcut() {
  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "D") {
      showDebugOverlay();
    }
  });
}