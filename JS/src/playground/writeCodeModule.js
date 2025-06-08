import { loadJSON } from './fileHelpers.js';
import { callLLM } from './llmCore.js';

export default async function writeCodeModule(task) {
  // Correct path for HTML in html/ and JSON in JS/src/playground/
  const sessionConfig = await loadJSON("../JS/src/playground/sessionConfig.json");

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
    model: sessionConfig.model || "gpt-4o",
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