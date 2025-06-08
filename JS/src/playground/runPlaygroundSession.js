// runPlaygroundSession.js

import { writeCodeModule } from './writeCodeModule.js';
import { reviewCodeModule } from './reviewCodeModule.js';
import playgroundTasks from './playgroundTasks.json' assert { type: "json" };
import sessionConfig from './sessionConfig.json' assert { type: "json" };

// Optional: file write logic (if you're using Node or fs-based system)
// Commented out for browser use only

// import fs from 'fs';

export default async function runPlaygroundSession() {
  try {
    // 1. Pick random task
    const task = playgroundTasks[Math.floor(Math.random() * playgroundTasks.length)];
    console.log("📌 Task:", task);

    // 2. Generate code
    const codeOutput = await writeCodeModule(task);
    console.log("🧠 Code Output:\n", codeOutput.code);

    // 3. Review it
    const review = await reviewCodeModule(codeOutput);
    console.log("🧪 Review Score:", review.score);
    console.log("✅ Strengths:", review.strengths);
    console.log("⚠️ Weaknesses:", review.weaknesses);

    // 4. Bundle log for return
    const sessionLog = {
      taskId: task.id,
      description: task.description,
      language: codeOutput.language,
      code: codeOutput.code,
      review: {
        score: review.score,
        strengths: review.strengths,
        weaknesses: review.weaknesses,
        suggestions: review.suggestions
      },
      timestamp: new Date().toISOString()
    };

    // Optional save (uncomment if using Node)
    // const logs = JSON.parse(fs.readFileSync("./playground/pipelineLogs.json"));
    // logs.push(sessionLog);
    // fs.writeFileSync("./playground/pipelineLogs.json", JSON.stringify(logs, null, 2));

    return sessionLog;
  } catch (err) {
    console.error("❌ runPlaygroundSession error:", err);
    return { error: true, message: err.message };
  }
}