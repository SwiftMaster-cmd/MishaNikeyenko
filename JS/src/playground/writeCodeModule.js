import { loadJSON } from './fileHelpers.js';
import { callLLM } from './llmCore.js';

export default async function writeCodeModule(task) {
  const sessionConfig = await loadJSON("../JS/src/playground/sessionConfig.json");

  const prompt = `
Write a ${task.language || "JavaScript"} function or module.

Description:
${task.description}

Requirements:
- The output must start with "export" (e.g. export function or export default)
- Do NOT include any explanation, comments, or example usages--only code
- Do NOT use code fences or any markdown formatting. Output only the raw code.
`;

  let result = await callLLM({
    model: sessionConfig.model || "gpt-4o",
    messages: [
      { role: "system", content: "You are a coding assistant. Return only code." },
      { role: "user", content: prompt }
    ]
  });

  // Strip code fences or accidental markdown
  let code = result.replace(/```[\s\S]*?[\r\n]/g, '').trim();

  return {
    taskId: task.id,
    description: task.description,
    code,
    language: task.language || "JavaScript",
    timestamp: Date.now()
  };
}