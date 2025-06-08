import runPlaygroundSession from './runPlaygroundSession.js';

// Utility: Escape HTML for safe output
function escapeHTML(str) {
  return String(str).replace(/[&<>'"]/g, s => ({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
  }[s]));
}

// Inject full UI
const main = document.getElementById('playground-main');
main.innerHTML = `
  <h2 style="text-align:center;margin-bottom:0;">Playground Session Test</h2>
  <div id="playground-status" style="margin:8px auto 18px auto;text-align:center;max-width:600px;color:#77f;">Ready</div>
  <form id="playground-form" style="text-align:center;max-width:700px;margin:0 auto;">
    <input
      id="user-task"
      type="text"
      placeholder="Describe the code you want generated (e.g. 'Glassmorphic card CSS')"
      style="width:82%;max-width:480px;padding:11px 14px;border-radius:8px;border:1.5px solid #444;margin-bottom:12px;font-size:1.1em;box-shadow:0 2px 8px #18182844;"
      autocomplete="off"
      required
    >
    <button id="run-test-btn" style="padding:10px 32px;border-radius:8px;background:#3d4386;color:#fff;font-size:1.13em;cursor:pointer;border:none;box-shadow:0 2px 6px #15153355;">Run</button>
  </form>
  <div id="console-log" style="margin:26px auto 0 auto;max-width:700px;min-height:32px;background:#181828;border-radius:10px;padding:10px 18px;font-family:'Fira Mono',monospace;color:#aaa;overflow-x:auto;"></div>
  <div id="playground-output-container" style="margin:30px auto 0 auto;max-width:730px;width:98vw;">
    <div id="playground-output" style="background:#23233c;border-radius:14px;padding:20px;box-shadow:0 2px 32px #14143a99;font-family:'Fira Mono','Menlo',monospace;font-size:1.08em;color:#e0e0e0;overflow-x:auto;word-break:break-word;max-height:510px;overflow-y:auto;min-height:56px;transition:max-height 0.2s;"></div>
  </div>
`;

// --- Collapsible Section Helper ---
function collapsible(title, html, open = true, accent = "#b9ffb9") {
  return `
    <details style="margin-bottom:14px;border-radius:8px;background:#232f37;border:1.5px solid ${accent};overflow:hidden;" ${open ? "open" : ""}>
      <summary style="font-size:1.12em;font-weight:600;padding:10px 16px;outline:none;cursor:pointer;background:linear-gradient(90deg,${accent}22 0,#23233c 100%);color:${accent};border-bottom:1px solid ${accent};">${title}</summary>
      <div style="padding:14px 14px 8px 16px;max-height:300px;overflow-x:auto;overflow-y:auto;">
        ${html}
      </div>
    </details>
  `;
}

// DOM elements
const output = document.getElementById('playground-output');
const logBox = document.getElementById('console-log');
const status = document.getElementById('playground-status');
const form = document.getElementById('playground-form');
const input = document.getElementById('user-task');
const button = document.getElementById('run-test-btn');

function setStatus(text, color="#77f") {
  status.textContent = text;
  status.style.color = color;
}

form.onsubmit = async (e) => {
  e.preventDefault();
  output.innerHTML = "";
  logBox.innerHTML = "";
  setStatus("Running session...", "#fd6");
  button.disabled = true;

  const taskDescription = input.value.trim();
  if (!taskDescription) return;

  const userTask = {
    id: Date.now(),
    title: taskDescription,
    description: taskDescription,
    language: "JavaScript",
    done: false
  };

  try {
    setStatus("Generating code with GPT-4o...");
    const result = await runPlaygroundSession([userTask]);
    setStatus("Session complete!", "#3dfc8b");

    output.innerHTML = `
      <div style="margin-bottom:10px;">
        <b style="font-size:1.13em;">Task:</b> ${escapeHTML(result.title)}
      </div>
      ${collapsible("Generated Code", `<pre style="background:#181828;padding:12px 10px;border-radius:7px;color:#b9ffb9;font-size:1.03em;">${escapeHTML(result.draftCode.code)}</pre>`, true, "#b9ffb9")}
      ${collapsible("Review", `<pre style="background:#282838;padding:12px 10px;border-radius:7px;color:#e0c8f8;font-size:1em;">${escapeHTML(JSON.stringify(result.reviewNotes, null, 2))}</pre>`, false, "#e0c8f8")}
      <div style="color:#aaa;font-size:0.97em;margin-top:18px;">
        <b>Timestamp:</b> ${new Date(result.timestamp).toLocaleString()}
      </div>
    `;
    logBox.innerHTML += `[${new Date().toLocaleTimeString()}] Session run complete.<br>`;
  } catch (err) {
    setStatus("Error: " + err.message, "#f55");
    output.innerHTML = `<div style="color:#f55;font-weight:bold;">ERROR: ${escapeHTML(err.message)}</div>`;
    logBox.innerHTML += `<div style="color:#f55">[${new Date().toLocaleTimeString()}] ERROR: ${escapeHTML(err.message)}</div>`;
  } finally {
    button.disabled = false;
  }
};