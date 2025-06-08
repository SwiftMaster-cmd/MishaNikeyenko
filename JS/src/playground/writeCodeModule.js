import { loadJSON } from './fileHelpers.js';
import { callLLM } from './llmCore.js';

export default async function writeCodeModule(task) {
  const sessionConfig = await loadJSON("../JS/src/playground/sessionConfig.json");

  const prompt = `
You are writing JavaScript ES modules for a code loader with these requirements:

- Only export a function: "export default function()" or "export function run()".
- The exported function must set the innerHTML of the element with id "js-output" to the result.
- Do NOT use console.log, alert, or modify any other part of the DOM.
- Do NOT use document.body, document.documentElement, or any global selectors.
- Do NOT return anything, only set document.getElementById("js-output").innerHTML = ...;
- Do NOT include any comments, usage examples, markdown, or code fences.
- Output only the code.

Now, generate a working module for this request:
"${task.description}"
`;

  let result = await callLLM({
    model: sessionConfig.model || "gpt-4o",
    messages: [
      { role: "system", content: "You are a coding assistant. Return only code." },
      { role: "user", content: prompt }
    ]
  });

  // Strip all code fences, stray backticks, etc
  let code = result
    .replace(/```[\s\S]*?```/g, '') // Remove ```fenced blocks```
    .replace(/```/g, '')            // Remove any single ```
    .replace(/'''/g, '')            // Remove any '''
    .replace(/^`+|`+$/gm, '')       // Remove stray backticks at line start/end
    .replace(/^\s+|\s+$/g, '');     // Trim extra whitespace

  return {
    taskId: task.id,
    description: task.description,
    code,
    language: task.language || "JavaScript",
    timestamp: Date.now()
  };
}