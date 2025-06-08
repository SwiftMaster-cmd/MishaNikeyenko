// playground/writeCodeModule.js

import { sessionConfig } from './sessionConfig.js';
import { callLLM } from './llmCore.js'; // You must have a callLLM() defined elsewhere

export async function writeCodeModule(task) {
  const prompt = `
Write a ${task.language || "JavaScript"} function or module.

Description:
${task.description}

Requirements:
- Write clean, modular code
- Include helpful comments
- Do not include any extra explanation outside the code block
  `;

  const result = await callLLM({
    model: sessionConfig.model,
    messages: [
      { role: "system", content: "You are a coding assistant. Return only code." },
      { role: "user", content: prompt }
    ]
  });

  return {
    taskId: task.id,
    description: task.description,
    code: result,
    language: task.language || "JavaScript",
    timestamp: Date.now()
  };
}