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
  <div id="playground-status" style="margin: 8px auto 18px auto; text-align:center; max-width:600px; color:#77f;">Ready</div>
  <form id="playground-form" style="text-align:center;max-width:700px;margin:0 auto;">
    <input
      id="user-task"
      type="text"
      placeholder="Describe the code you want generated (e.g. 'Add function')"
      style="width:80%;max-width:460px;padding:9px 12px;border-radius:8px;border:1.5px solid #444;margin-bottom:10px;font-size:1.08em;"
      autocomplete="off"
      required
    >
    <button id="run-test-btn" style="padding:10px 28px;border-radius:8px;background:#3d4386;color:#fff;font-size:1.11em;cursor:pointer;border:none;box-shadow:0 2px 6px #15153377;">Run</button>
  </form>
  <div id="console-log" style="margin:32px auto 0 auto; max-width:700px; min-height:40px; background:#181828; border-radius:12px; padding:12px; font-family:'Fira Mono',monospace; color:#aaa;"></div>
  <div id="playground-output" style="margin:32px auto 0 auto; max-width:700px; width:100%; background:#23233c; border-radius:12px; padding:24px; box-shadow:0 2px 32px #14143a99; font-family:'Fira Mono','Menlo',monospace; font-size:1.06em; color:#e0e0e0; overflow-x:auto; word-break:break-word;"></div>
`;

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

  // Dynamically build the task object:
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
    // Call the session runner with a single ad-hoc task
    const result = await runPlaygroundSession([userTask]);

    setStatus("Session complete!", "#3dfc8b");
    output.innerHTML = `
      <div style="margin-bottom:12px;">
        <b style="font-size:1.15em;">Task:</b> ${escapeHTML(result.title)}
      </div>
      <div style="margin-bottom:12px;">
        <b style="color:#b9ffb9;">Generated Code:</b>
        <pre style="background:#181828;padding:12px 10px;border-radius:8px;color:#b9ffb9;font-size:1em;overflow-x:auto;">${escapeHTML(result.draftCode.code)}</pre>
      </div>
      <div style="margin-bottom:12px;">
        <b style="color:#e0c8f8;">Review:</b>
        <pre style="background:#282838;padding:12px 10px;border-radius:8px;color:#e0c8f8;font-size:1em;overflow-x:auto;">${escapeHTML(JSON.stringify(result.reviewNotes, null, 2))}</pre>
      </div>
      <div style="color:#aaa;font-size:0.95em;margin-top:16px;">
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