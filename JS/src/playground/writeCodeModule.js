import { loadJSON } from './fileHelpers.js';
import { callLLM } from './llmCore.js';

export default async function writeCodeModule(task) {
  const sessionConfig = await loadJSON("../JS/src/playground/sessionConfig.json");

  const prompt = `
You are writing JavaScript ES modules for a code loader with these requirements:

- Only export a function: either "export default function()" or "export function run()".
- Never use classes, objects, or anything else.
- No comments, no usage examples, no markdown, no code fences.
- The exported function must be immediately callable with no arguments.
- Output only valid JavaScript ES module code, nothing else.

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

  // Clean up ALL markdown/code-fence slop, stray backticks, etc
  let code = result
    .replace(/```[\s\S]*?```/g, '') // Remove ```fenced blocks```
    .replace(/```/g, '')            // Remove any single ```
    .replace(/'''/g, '')            // Remove any '''
    .replace(/^`+|`+$/gm, '')       // Remove stray backticks at line start/end
    .replace(/^\s+|\s+$/g, '');     // Trim any extra whitespace

  return {
    taskId: task.id,
    description: task.description,
    code,
    language: task.language || "JavaScript",
    timestamp: Date.now()
  };
}