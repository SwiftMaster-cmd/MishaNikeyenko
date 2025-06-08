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

  // Debug: Log raw output to catch prompt or LLM issues
  console.log("LLM RAW OUTPUT:", result);

  // Strip code fences/markdown only, not real code
  let code = result
    .replace(/```[\s\S]*?```/g, '') // Remove fenced code blocks
    .replace(/```/g, '')            // Remove stray ```
    .replace(/'''/g, '')            // Remove stray '''
    .replace(/^`+|`+$/gm, '')       // Remove stray backticks at line start/end
    .trim();

  // Handle empty output
  if (!code) {
    code = 'export default function() { document.getElementById("js-output").innerHTML = "⚠️ No code was generated." }';
    console.error("LLM returned empty code.");
  }

  return {
    taskId: task.id,
    description: task.description,
    code,
    language: task.language || "JavaScript",
    timestamp: Date.now()
  };
}