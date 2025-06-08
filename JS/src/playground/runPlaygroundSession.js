// playground/runPlaygroundSession.js

import { writeCodeModule } from './writeCodeModule.js';
import { reviewCodeModule } from './reviewCodeModule.js';

import playgroundTasks from './playgroundTasks.json' assert { type: "json" };
import sessionConfig from './sessionConfig.json' assert { type: "json" };

const fs = window.require?.("fs") || null;

async function runPlaygroundSession() {
  const task = playgroundTasks[Math.floor(Math.random() * playgroundTasks.length)];
  console.log("🧠 Running Playground Task:", task.description);

  // 1. Generate code
  const codeOutput = await writeCodeModule(task);
  console.log("📦 Generated Code:\n", codeOutput.code);

  // 2. Review code
  const review = await reviewCodeModule(codeOutput);
  console.log("🔍 Review Score:", review.score);
  console.log("✅ Strengths:", review.strengths);
  console.log("⚠️ Weaknesses:", review.weaknesses);

  // 3. Save log entry
  const logEntry = {
    taskId: task.id,
    description: task.description,
    code: codeOutput.code,
    language: codeOutput.language,
    score: review.score,
    suggestions: review.suggestions,
    timestamp: Date.now()
  };

  if (fs) {
    const logs = JSON.parse(fs.readFileSync("./playground/pipelineLogs.json"));
    logs.push(logEntry);
    fs.writeFileSync("./playground/pipelineLogs.json", JSON.stringify(logs, null, 2));

    const lessons = JSON.parse(fs.readFileSync("./playground/codeLessons.json"));
    lessons.push(...review.suggestions.map((s) => ({
      lesson: s,
      sourceTask: task.description,
      timestamp: Date.now()
    })));
    fs.writeFileSync("./playground/codeLessons.json", JSON.stringify(lessons, null, 2));
  } else {
    console.warn("⚠️ Local save skipped (no fs available).");
  }
}

export default runPlaygroundSession;