import { loadJSON } from './fileHelpers.js';
import { callLLM } from './llmCore.js';

export default async function writeCodeModule(task) {
  const sessionConfig = await loadJSON("../JS/src/playground/sessionConfig.json");

const prompt = `
You are writing JavaScript ES modules for a custom loader.

- Export only a function: "export default function()" or "export function run()".
- The function should output results appropriately for the requested task:
    - If visual or text output is needed, set the innerHTML of the element with id "js-output".
    - If only a result string is appropriate, return the string.
    - Otherwise, just perform the requested JS logic.
- Do NOT use alert, console.log, or modify any part of the DOM except document.getElementById("js-output").
- Do NOT include comments, usage examples, markdown, or code fences.
- Output only the JavaScript ES module code, nothing else.

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