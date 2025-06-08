import { loadJSON } from './fileHelpers.js';
import { callLLM } from './llmCore.js';

export default async function writeCodeModule(task) {
  const sessionConfig = await loadJSON("../JS/src/playground/sessionConfig.json");

const prompt = `
Write a JavaScript ES module that works with the following loader rules:

- It must export a function as "export default function(...)" OR as a named export "export function run(...)", "export function init(...)", or "export function showModuleDemo(...)".
- The function must not be a class.
- Do not include any comments, example usage, code fences, or markdown--only the code.
- The function should be immediately callable (no arguments or with sensible defaults).
- Do not export classes or objects, only functions as described above.
- Output only valid ES module code.
`;

let result = await callLLM({
  model: sessionConfig.model || "gpt-4o",
  messages: [
    { role: "system", content: "You are a coding assistant. Return only code." },
    { role: "user", content: prompt }
  ]
});

// Remove code fences, markdown, etc
let code = result.replace(/```[\s\S]*?[\r\n]/g, '').trim();

return {
  taskId: task.id,
  description: task.description,
  code,
  language: task.language || "JavaScript",
  timestamp: Date.now()
};

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