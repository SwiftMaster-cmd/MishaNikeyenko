// runPlaygroundSession.js

import writeCodeModule from "./writeCodeModule.js";
import reviewCodeModule from "./reviewCodeModule.js";

// UI logger (safe fallback)
const log = (msg, type = "info") => {
  const logBox = document.getElementById("console-log");
  if (!logBox) return;
  const line = document.createElement("div");
  line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  if (type === "error") line.style.color = "#f55";
  if (type === "success") line.style.color = "#5f5";
  logBox.appendChild(line);
  logBox.scrollTop = logBox.scrollHeight;
};

/**
 * Run a single playground session with one task object:
 * @param {Array} tasksOverride - An array with one {id, title, description, language, done}
 * @returns {Object} runData { taskId, title, timestamp, draftCode, reviewNotes }
 */
export default async function runPlaygroundSession(tasksOverride = null) {
  log("🔁 Session started");

  const tasks = tasksOverride;
  if (!Array.isArray(tasks) || tasks.length === 0) {
    log("⚠️ No tasks found.", "error");
    throw new Error("No tasks loaded.");
  }

  const activeTask = tasks[0];
  if (!activeTask) {
    log("✅ All tasks completed.", "success");
    return { message: "All tasks completed", tasksRun: tasks.length };
  }

  log(`🧠 Running task: "${activeTask.title}"`);

  // 1. Write code for the active task
  const draftCode = await writeCodeModule(activeTask);
  log("📄 Code written");

  // 2. Review and improve the code
  const reviewNotes = await reviewCodeModule(draftCode);
  log("🔍 Review completed");

  // 3. Prepare run data for saving
  const runData = {
    taskId: activeTask.id,
    title: activeTask.title,
    timestamp: Date.now(),
    draftCode,
    reviewNotes
  };

  log("✅ Session run complete.", "success");
  return runData;
}