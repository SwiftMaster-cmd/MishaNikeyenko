import { loadJSON } from './fileHelpers.js';
import { callLLM } from './llmCore.js';

export default async function writeCodeModule(task) {
  const sessionConfig = await loadJSON("../JS/src/playground/sessionConfig.json");

  const prompt = `
Write a ${task.language || "JavaScript"} function or class as an ES module.

Description:
${task.description}

Requirements:
- The code must use "export default" (e.g. export default function ... or export default class ...)
- Output ONLY the code, nothing else--no comments, no usage examples, no code fences, no markdown.
- The exported value must be callable or constructible if appropriate.
`;

  let result = await callLLM({
    model: sessionConfig.model || "gpt-4o",
    messages: [
      { role: "system", content: "You are a coding assistant. Return only code." },
      { role: "user", content: prompt }
    ]
  });

  // Remove any possible code fences or markdown labels
  let code = result.replace(/```[\s\S]*?[\r\n]/g, '').trim();

  // If the code does not start with "export default", prepend it automatically (failsafe)
  if (!/^export\s+default/.test(code)) {
    // Attempt to auto-wrap the first function/class as export default
    code = code.replace(/^(function|class)\s+([a-zA-Z0-9_]+)\s*\(/, 'export default $1 $2(')
               .replace(/^(function|class)\s+([a-zA-Z0-9_]+)/, 'export default $1 $2');
  }

  return {
    taskId: task.id,
    description: task.description,
    code,
    language: task.language || "JavaScript",
    timestamp: Date.now()
  };
}