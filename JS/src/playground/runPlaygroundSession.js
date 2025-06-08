// runPlaygroundSession.js

import { loadJSON, saveJSON } from "./fileHelpers.js";
import writeCodeModule from "./writeCodeModule.js";
import reviewCodeModule from "./reviewCodeModule.js";
import { callLLM } from "./llmCore.js";

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

// === Helper to summarize a run for the history ===
async function summarizeRun(task, code, review) {
  const previousSummaries = (task.history || []).slice(-5).map(
    h => `- [${new Date(h.timestamp).toLocaleDateString()}] ${h.summary}`
  ).join("\n");

  const prompt = `
Summarize this project run for the task "${task.title}".
${task.favorite ? "This is a FAVORITE task." : ""}
Recent history:
${previousSummaries || "None."}

Latest code:
${code.code}

Review:
${JSON.stringify(review)}

Summary should be concise, specific, and highlight improvements or issues.
  `.trim();

  const result = await callLLM({
    model: "gpt-4o",
    messages: [
      { role: "system", content: "You are a project manager. Return only the summary." },
      { role: "user", content: prompt }
    ]
  });
  return result.trim();
}

// === Main session runner ===
export default async function runPlaygroundSession({ projectId, taskId = null, tasksOverride = null }) {
  log("🔁 Session started");

  // Load data
  const config  = await loadJSON("../JS/src/playground/sessionConfig.json");
  const tasks   = tasksOverride || await loadJSON("../JS/src/playground/playgroundTasks.json");
  const logs    = await loadJSON("../JS/src/playground/pipelineLogs.json");
  const lessons = await loadJSON("../JS/src/playground/codeLessons.json");

  // Find active project + task
  const projectTasks = tasks.filter(t => t.projectId === projectId);
  if (!projectTasks.length) {
    log("⚠️ No tasks for this project.", "error");
    throw new Error("No tasks for selected project.");
  }

  let activeTask;
  if (taskId) {
    activeTask = projectTasks.find(t => t.id === taskId);
  } else {
    activeTask = projectTasks.find(t => !t.done) || projectTasks[0];
  }
  if (!activeTask) {
    log("✅ All tasks completed.", "success");
    return { message: "All tasks completed", tasksRun: projectTasks.length };
  }

  // Build context from task history
  const history = activeTask.history || [];
  const contextSummary = history.slice(-5).map(
    h => `- [${new Date(h.timestamp).toLocaleDateString()}] ${h.summary}`
  ).join("\n");
  const contextBlock = `
Task: ${activeTask.title}
${activeTask.favorite ? "[FAVORITE]" : ""}
History:
${contextSummary || "None yet."}
`.trim();

  log(`🧠 Running task: "${activeTask.title}"`);

  // 1. Generate new code
  const draftCode = await writeCodeModule({
    ...activeTask,
    context: contextBlock
  });
  log("📄 Code written");

  // 2. Review the code
  const reviewNotes = await reviewCodeModule(draftCode);
  log("🔍 Review completed");

  // 3. Summarize
  const summary = await summarizeRun(activeTask, draftCode, reviewNotes);

  // 4. Log the run to history
  const runData = {
    projectId,
    taskId: activeTask.id,
    title: activeTask.title,
    timestamp: Date.now(),
    draftCode,
    reviewNotes,
    summary,
    rating: null // like/dislike (user set via UI)
  };

  // Save in pipelineLogs.json (project run log)
  logs.push(runData);

  // Save in task history (full chain)
  if (!activeTask.history) activeTask.history = [];
  activeTask.history.push({
    timestamp: runData.timestamp,
    summary,
    code: draftCode.code,
    review: reviewNotes,
    rating: null // UI sets this later
  });

  activeTask.done = true;

  // Save changes unless running override
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

// === CONTINUE LOGIC ===

// Continue a task with most recent run (1 step)
export async function continueTask({ projectId, taskId }) {
  const tasks = await loadJSON("../JS/src/playground/playgroundTasks.json");
  const task = tasks.find(t => t.projectId === projectId && t.id === taskId);
  if (!task) throw new Error("Task not found");
  // Unset 'done' so it can be run again
  task.done = false;
  return await runPlaygroundSession({ projectId, taskId });
}

// Continue X times (up to 10)
export async function continueTaskX({ projectId, taskId, count = 3 }) {
  let output = null;
  count = Math.min(count, 10);
  for (let i = 0; i < count; ++i) {
    output = await continueTask({ projectId, taskId });
  }
  return output;
}

// Rate a run in task history (UI calls this)
export async function rateRun({ projectId, taskId, timestamp, rating }) {
  const tasks = await loadJSON("../JS/src/playground/playgroundTasks.json");
  const task = tasks.find(t => t.projectId === projectId && t.id === taskId);
  if (!task || !task.history) return false;
  const run = task.history.find(h => h.timestamp === timestamp);
  if (!run) return false;
  run.rating = rating; // 'like' | 'dislike'
  await saveJSON("../JS/src/playground/playgroundTasks.json", tasks);
  return true;
}

// Get run history for a project or a single task
export async function getProjectHistory(projectId) {
  const logs = await loadJSON("../JS/src/playground/pipelineLogs.json");
  return logs.filter(log => log.projectId === projectId);
}
export async function getTaskHistory(projectId, taskId) {
  const tasks = await loadJSON("../JS/src/playground/playgroundTasks.json");
  const task = tasks.find(t => t.projectId === projectId && t.id === taskId);
  return task?.history || [];
}