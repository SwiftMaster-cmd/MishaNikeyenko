// runPlaygroundSession.js

import { loadJSON, saveJSON } from "./fileHelpers.js";
import writeCodeModule from "./writeCodeModule.js";
import reviewCodeModule from "./reviewCodeModule.js";

// Simple logger for the UI
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
 * Run the playground session for one or more tasks.
 * If tasksOverride is provided, it is used instead of loading from file.
 */
export default async function runPlaygroundSession(tasksOverride = null) {
  log("🔁 Session started");

  // Load data/config
  const config  = await loadJSON("../JS/src/playground/sessionConfig.json");
  const tasks   = tasksOverride || await loadJSON("../JS/src/playground/playgroundTasks.json");
  const logs    = await loadJSON("../JS/src/playground/pipelineLogs.json");
  const lessons = await loadJSON("../JS/src/playground/codeLessons.json");

  if (!Array.isArray(tasks) || tasks.length === 0) {
    log("⚠️ No tasks found.", "error");
    throw new Error("No tasks loaded.");
  }

  // Always just run the *first* active task for this interactive use
  const activeTask = tasks.find(t => !t.done) || tasks[0];
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

  // 3. Save run data and update task status (only for normal tasks, not user-typed)
  const runData = {
    taskId: activeTask.id,
    title: activeTask.title,
    timestamp: Date.now(),
    draftCode,
    reviewNotes
  };
  logs.push(runData);
  activeTask.done = true;

  // If using override, don't persist to file (you can skip this block)
  if (!tasksOverride) {
    await Promise.all([
      saveJSON("../JS/src/playground/codeLessons.json", lessons),
      saveJSON("../JS/src/playground/pipelineLogs.json", logs),
      saveJSON("../JS/src/playground/playgroundTasks.json", tasks)
    ]);
    log("💾 Session saved", "success");
  }

  return runData;
}