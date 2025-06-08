import {
  createProject,
  listProjects,
  loadProject,
  deleteProject,
  addHistory,
  listHistory,
  markBestVersion,
  getBestVersion
} from './projectManager.js';
import runPlaygroundSession from './runPlaygroundSession.js';

// Utility: Escape HTML for safe output
function escapeHTML(str) {
  return String(str).replace(/[&<>'"]/g, s => ({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
  }[s]));
}

// --- DOM Injection ---
const main = document.getElementById('playground-main');
main.innerHTML = `
  <div id="playground-outer-container"
    style="margin:40px auto 0 auto;max-width:820px;width:98vw;min-height:340px;max-height:710px;box-shadow:0 2px 32px #14143a44;border-radius:20px;overflow-y:auto;background:#1b1b28;">
    <h2 style="text-align:center;margin:18px 0 0 0;">AI Playground Projects</h2>
    <div id="playground-status" style="margin:10px auto 18px auto;text-align:center;max-width:600px;color:#77f;">Ready</div>
    <div id="project-bar" style="display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:14px;">
      <select id="project-select" style="padding:8px 16px;border-radius:8px;background:#23233c;color:#fff;border:1.5px solid #444;font-size:1em;"></select>
      <button id="new-project-btn" style="padding:8px 18px;border-radius:8px;background:#346dad;color:#fff;font-weight:600;border:none;">New Project</button>
      <button id="delete-project-btn" style="padding:8px 14px;border-radius:8px;background:#e15656;color:#fff;border:none;">Delete</button>
    </div>
    <form id="playground-form" style="text-align:center;max-width:700px;margin:0 auto;">
      <input
        id="user-task"
        type="text"
        placeholder="Describe the code you want generated (e.g. 'Responsive navbar')"
        style="width:82%;max-width:480px;padding:11px 14px;border-radius:8px;border:1.5px solid #444;margin-bottom:12px;font-size:1.1em;box-shadow:0 2px 8px #18182844;"
        autocomplete="off"
        required
      >
      <button id="run-test-btn" style="padding:10px 32px;border-radius:8px;background:#3d4386;color:#fff;font-size:1.13em;cursor:pointer;border:none;box-shadow:0 2px 6px #15153355;">Run</button>
    </form>
    <div id="console-log" style="margin:16px auto 0 auto;max-width:700px;min-height:18px;background:#181828;border-radius:10px;padding:7px 18px;font-family:'Fira Mono',monospace;color:#aaa;overflow-x:auto;"></div>
    <div id="history-container" style="margin:22px auto 20px auto;max-width:730px;width:98vw;">
      <div id="history-list" style="font-family:'Fira Mono','Menlo',monospace;font-size:1.07em;color:#e0e0e0;"></div>
    </div>
  </div>
`;

const status = document.getElementById('playground-status');
const form = document.getElementById('playground-form');
const input = document.getElementById('user-task');
const button = document.getElementById('run-test-btn');
const projectSelect = document.getElementById('project-select');
const newProjectBtn = document.getElementById('new-project-btn');
const deleteProjectBtn = document.getElementById('delete-project-btn');
const logBox = document.getElementById('console-log');
const historyList = document.getElementById('history-list');

let projects = [];
let currentProject = null;

// --- Helpers ---
function setStatus(text, color="#77f") {
  status.textContent = text;
  status.style.color = color;
}

function log(text, isError = false) {
  logBox.innerHTML = `[${new Date().toLocaleTimeString()}] ${escapeHTML(text)}<br>` + logBox.innerHTML;
  if (isError) logBox.style.color = "#e15656";
  else logBox.style.color = "#aaa";
}

function optionHTML(val, label, selected=false) {
  return `<option value="${val}" ${selected?"selected":""}>${escapeHTML(label)}</option>`;
}

// --- Project UI ---
async function refreshProjects(selectedId=null) {
  projects = await listProjects();
  if (!projects.length) {
    // Create a default project on first load
    const def = await createProject({ name: "First Project", language: "JavaScript" });
    projects = [def];
  }
  projectSelect.innerHTML = projects.map(p => optionHTML(p.id, p.name, selectedId ? p.id === selectedId : false)).join("");
  if (!selectedId) selectProject(projects[0].id);
}

async function selectProject(id) {
  currentProject = await loadProject(id);
  setStatus(`Loaded: ${currentProject.name}`, "#3dfc8b");
  log(`Loaded project: ${currentProject.name}`);
  await showHistory();
}

newProjectBtn.onclick = async () => {
  const name = prompt("Project name?");
  if (!name) return;
  const proj = await createProject({ name });
  await refreshProjects(proj.id);
};

deleteProjectBtn.onclick = async () => {
  if (!currentProject) return;
  if (!confirm("Delete this project?")) return;
  await deleteProject(currentProject.id);
  await refreshProjects();
};

projectSelect.onchange = () => selectProject(projectSelect.value);

// --- History UI ---
async function showHistory() {
  const history = await listHistory(currentProject.id);
  if (!history.length) {
    historyList.innerHTML = `<div style="color:#a9aab8;text-align:center;">No history yet. Run a task to start.</div>`;
    return;
  }
  // Render each history entry
  historyList.innerHTML = history.map((h, i) => `
    <div style="margin-bottom:18px;border-radius:12px;border:2px solid ${h.isBest?"#4efd8b":"#26263e"};background:${h.isBest?"#162a1c":"#21212b"};box-shadow:${h.isBest?"0 0 12px #43ff8b44":"none"};padding:14px 14px 6px 16px;position:relative;">
      <div style="font-size:1.08em;">
        <b>Prompt:</b> ${escapeHTML(h.prompt)}
      </div>
      <div style="margin:10px 0 0 0;">
        <details open>
          <summary style="font-weight:600;font-size:1.02em;color:#b9ffb9;cursor:pointer;">Code</summary>
          <pre style="background:#1c202c;padding:10px 10px 10px 12px;border-radius:8px;color:#b9ffb9;font-size:1em;overflow-x:auto;">${escapeHTML(h.code)}</pre>
        </details>
        <details>
          <summary style="font-weight:600;font-size:1.02em;color:#e0c8f8;cursor:pointer;">Review</summary>
          <pre style="background:#232032;padding:10px 10px 10px 12px;border-radius:8px;color:#e0c8f8;font-size:1em;overflow-x:auto;">${escapeHTML(JSON.stringify(h.review, null, 2))}</pre>
        </details>
      </div>
      <div style="font-size:0.95em;color:#aaa;margin-top:8px;">
        <b>${h.isBest ? "⭐ Best Version" : ""}</b> 
        <b>Timestamp:</b> ${new Date(h.timestamp).toLocaleString()}
      </div>
      <div style="margin-top:8px;">
        <button data-idx="${h.id}" class="mark-best-btn" style="padding:3.5px 11px;border-radius:6px;background:${h.isBest?"#26263e":"#36e092"};color:#fff;border:none;font-size:0.99em;margin-right:8px;">Mark Best</button>
        <button data-idx="${h.id}" class="refine-btn" style="padding:3.5px 11px;border-radius:6px;background:#4951bb;color:#fff;border:none;font-size:0.99em;">Refine</button>
      </div>
    </div>
  `).join("");

  // Wire up Mark Best/Refine buttons
  historyList.querySelectorAll('.mark-best-btn').forEach(btn => {
    btn.onclick = async () => {
      await markBestVersion(currentProject.id, btn.dataset.idx);
      await showHistory();
    };
  });
  historyList.querySelectorAll('.refine-btn').forEach(btn => {
    btn.onclick = async () => {
      const entry = history.find(h => h.id === btn.dataset.idx);
      if (!entry) return;
      // Pre-fill input with last prompt + suggestion
      input.value = entry.prompt + " (Refine based on last review)";
      form.scrollIntoView({ behavior: "smooth", block: "center" });
    };
  });
}

// --- Run/Submit ---
form.onsubmit = async (e) => {
  e.preventDefault();
  logBox.innerHTML = "";
  setStatus("Running session...", "#fd6");
  button.disabled = true;

  const taskDescription = input.value.trim();
  if (!taskDescription || !currentProject) {
    setStatus("No input or project.", "#f55");
    button.disabled = false;
    return;
  }
  try {
    setStatus("Generating code with GPT-4o...");
    // Use best version as context if exists
    const best = await getBestVersion(currentProject.id);
    let seedPrompt = taskDescription;
    if (best) {
      seedPrompt =
        `Here is my best previous code:\n${best.code}\n\nHere is the last review:\n${JSON.stringify(best.review)}\n\nInstruction:\n${taskDescription}`;
    }
    const result = await runPlaygroundSession([
      {
        id: Date.now(),
        title: taskDescription,
        description: seedPrompt,
        language: currentProject.language,
        done: false
      }
    ]);
    await addHistory(currentProject.id, {
      code: result.draftCode.code,
      review: result.reviewNotes,
      prompt: taskDescription,
      isBest: false
    });
    setStatus("Session complete!", "#3dfc8b");
    log("Session complete.");
    await showHistory();
    input.value = "";
  } catch (err) {
    setStatus("Error: " + err.message, "#f55");
    log(err.message, true);
  } finally {
    button.disabled = false;
  }
};

// Initial load
refreshProjects();