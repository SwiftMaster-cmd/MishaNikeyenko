import * as Logic from './consoleLogic.js';

// --- MINI CONSOLE UI ---
export function setupMiniConsole() {
  const panel = document.getElementById("onscreen-console");
  if (!panel) return;
  panel.innerHTML = `
    <div id="onscreen-console-messages"></div>
    <div style="margin-top: 10px;">
      <button id="console-clear-btn">Clear Logs</button>
      <button id="console-export-btn">Export Logs</button>
      <button id="console-fullview-btn">Full View</button>
      <button id="console-autoscroll-btn" style="opacity:1;">AutoScroll</button>
    </div>
  `;
  document.getElementById("console-clear-btn").onclick = Logic.clearLogs;
  document.getElementById("console-export-btn").onclick = Logic.exportLogs;
  document.getElementById("console-fullview-btn").onclick = Logic.showOverlay;
  document.getElementById("console-autoscroll-btn").onclick = () => {
    Logic.toggleAutoscroll();
    document.getElementById("console-autoscroll-btn").style.opacity = Logic.miniAutoscroll ? '1' : '0.5';
  };
  Logic.renderMiniLogs();
  Logic.setupMiniConsoleScroll();
}

// --- OVERLAY/DEBUG MODAL UI ---
export function injectOverlayLayout() {
  const overlay = document.getElementById("debug-overlay");
  if (!overlay) return;
  overlay.style.display = "none";
  overlay.innerHTML = `
    <div id="debug-modal" style="background:rgba(28,32,42,0.98);border-radius:20px;box-shadow:0 8px 64px #0007;padding:32px 28px;min-width:540px;min-height:420px;max-width:900px;width:95vw;max-height:88vh;display:flex;flex-direction:column;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <div>
          <button class="console-btn" id="overlay-clear" type="button">Clear Logs</button>
          <button class="console-btn" id="overlay-export" type="button">Export Logs</button>
          <button class="console-btn" id="overlay-autoscroll" type="button" style="opacity:1;">AutoScroll</button>
        </div>
        <button class="console-btn close-btn" id="overlay-close" style="font-size:1.3em;padding:4px 12px;">✕</button>
      </div>
      <div id="overlay-console-pane" style="min-height:480px;height:65vh;max-height:72vh;overflow:auto;border-radius:10px;background:rgba(24,28,36,0.97);padding:10px;">
        <div id="overlay-console-messages"></div>
      </div>
    </div>
  `;
  document.getElementById("overlay-clear").onclick = Logic.clearLogs;
  document.getElementById("overlay-export").onclick = Logic.exportLogs;
  document.getElementById("overlay-autoscroll").onclick = () => {
    Logic.toggleOverlayAutoscroll();
    document.getElementById("overlay-autoscroll").style.opacity = Logic.overlayAutoscroll ? '1' : '0.5';
  };
  document.getElementById("overlay-close").onclick = Logic.closeOverlay;
  Logic.renderOverlayLogs();
}

// --- SETUP ON DOM READY ---
document.addEventListener("DOMContentLoaded", () => {
  setupMiniConsole();
  injectOverlayLayout();
  Logic.setupClipboardCopy();
});