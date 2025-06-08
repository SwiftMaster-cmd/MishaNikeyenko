// runPlaygroundSession.js

import { loadJSON, saveJSON } from "./fileHelpers.js";
import writeCodeModule from "./writeCodeModule.js";
import reviewCodeModule from "./reviewCodeModule.js";

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

export default async function runPlaygroundSession() {
  log("🔁 Session started");

const config  = await loadJSON("JS/src/playground/sessionConfig.json");
const tasks   = await loadJSON("JS/src/playground/playgroundTasks.json");
const logs    = await loadJSON("JS/src/playground/pipelineLogs.json");
const lessons = await loadJSON("JS/src/playground/codeLessons.json");

  if (!Array.isArray(tasks) || tasks.length === 0) {
    log("⚠️ No tasks found.", "error");
    throw new Error("No tasks loaded.");
  }

  const activeTask = tasks.find(t => !t.done);
  if (!activeTask) {
    log("✅ All tasks completed.", "success");
    return { message: "All tasks completed", tasksRun: tasks.length };
  }

  log(`🧠 Running task: "${activeTask.title}"`);

  // 1. Write code
  const draftCode = await writeCodeModule(activeTask);
  log("📄 Code written");

  // 2. Review and improve
  const reviewNotes = await reviewCodeModule(draftCode);
  log("🔍 Review completed");

  // 3. Save to log
  const runData = {
    taskId: activeTask.id,
    title: activeTask.title,
    timestamp: Date.now(),
    draftCode,
    reviewNotes
  };
  logs.push(runData);
  activeTask.done = true;

await Promise.all([
  saveJSON("JS/src/playground/codeLessons.json", lessons),
  saveJSON("JS/src/playground/pipelineLogs.json", logs),
  saveJSON("JS/src/playground/playgroundTasks.json", tasks)
]);
  log("💾 Session saved", "success");
  return runData;
}