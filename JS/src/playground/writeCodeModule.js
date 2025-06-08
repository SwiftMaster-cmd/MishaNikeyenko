import { loadJSON } from './fileHelpers.js';
import { callLLM } from './llmCore.js';

export default async function writeCodeModule(task) {
  const sessionConfig = await loadJSON("../JS/src/playground/sessionConfig.json");

  const prompt = `
Write a JavaScript ES module that works with the following loader rules:

- You must export a function as "export default function()" OR as a named export "export function run()", "export function init()", or "export function showModuleDemo()".
- Do NOT export a class, object, or anything except a function.
- The exported function must be immediately callable, with no required arguments.
- Do NOT include any comments, example usage, code fences, or markdown--output ONLY the code.
- Output only valid ES module code and nothing else.
`;

  let result = await callLLM({
    model: sessionConfig.model || "gpt-4o",
    messages: [
      { role: "system", content: "You are a coding assistant. Return only code." },
      { role: "user", content: prompt }
    ]
  });

  // Remove any code fences, markdown, or accidental extra text
  let code = result.replace(/```[\s\S]*?[\r\n]/g, '').trim();

  return {
    taskId: task.id,
    description: task.description,
    code,
    language: task.language || "JavaScript",
    timestamp: Date.now()
  };
}