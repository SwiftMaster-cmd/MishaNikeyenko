// writeCodeModule.js

import { loadJSON } from './fileHelpers.js';
import { callLLM } from './llmCore.js';

/**
 * Generate code for a task, injecting project/task history/context as needed.
 * @param {Object} task - Task object (should include description, language, context, etc.)
 * @returns {Promise<Object>} - { taskId, description, code, language, timestamp }
 */
export default async function writeCodeModule(task) {
  // Load config if needed (e.g. for model selection)
  const sessionConfig = await loadJSON("../JS/src/playground/sessionConfig.json");

  // Build a prompt with context/history if available
  const contextBlock = (task.context || "").trim();

  // Full prompt sent to the LLM
  const prompt = `
${contextBlock ? `Context:\n${contextBlock}\n\n` : ""}
Write a ${task.language || "JavaScript"} function or module for the following:

Description:
${task.description}

Requirements:
- Write clean, modular code
- Include helpful comments
- Do not include any extra explanation outside the code block
  `.trim();

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