// 🔁 runPlaygroundSession.js – Core runner for Playground tasks

import { loadJSON, saveJSON } from "./fileHelpers.js";
import runCodeTask from "./writeCodeModule.js";
import reviewCodeTask from "./reviewCodeModule.js";

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

  const config = await loadJSON("playground/sessionConfig.json");
  const tasks = await loadJSON("playground/playgroundTasks.json");
  const logs = await loadJSON("playground/pipelineLogs.json");
  const lessons = await loadJSON("playground/codeLessons.json");

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
  const draftCode = await runCodeTask(activeTask, lessons, config);
  log("📄 Code written");

  // 2. Review and improve
  const reviewNotes = await reviewCodeTask(activeTask, draftCode, lessons, config);
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

  // 4. Save everything
  await Promise.all([
    saveJSON("playground/codeLessons.json", lessons),
    saveJSON("playground/pipelineLogs.json", logs),
    saveJSON("playground/playgroundTasks.json", tasks)
  ]);

  log("💾 Session saved", "success");
  return runData;
}