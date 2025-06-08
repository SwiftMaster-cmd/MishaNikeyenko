// reviewCodeModule.js

import { loadJSON } from './fileHelpers.js';
import { callLLM } from './llmCore.js';

/**
 * Reviews a code output for a task, with context if provided.
 * @param {Object} codeOutput - Output from writeCodeModule
 * @returns {Promise<Object>} - { score, strengths, weaknesses, suggestions, taskId, timestamp }
 */
export default async function reviewCodeModule(codeOutput) {
  // Load session config (model selection, etc.)
  const sessionConfig = await loadJSON("../JS/src/playground/sessionConfig.json");

  // Build context block if present
  const contextBlock = (codeOutput.context || "").trim();

  // Build the review prompt for the LLM
  const prompt = `
${contextBlock ? `Context:\n${contextBlock}\n\n` : ""}
Review the following ${codeOutput.language} code.

Goals:
- Check for correctness, clarity, and efficiency
- Suggest improvements if needed
- Rate the code from 1 to 10
- Do NOT rewrite the code

Code:
\`\`\`${codeOutput.language}
${codeOutput.code}
\`\`\`

Return your review as strict JSON:
{
  "score": 0-10,
  "strengths": [],
  "weaknesses": [],
  "suggestions": []
}
`.trim();

  const result = await callLLM({
    model: sessionConfig.model || "gpt-4o",
    messages: [
      { role: "system", content: "You are a code reviewer. Respond with structured feedback only." },
      { role: "user", content: prompt }
    ]
  });

  // Parse and return structured review
  try {
    const parsed = JSON.parse(result);
    return { ...parsed, taskId: codeOutput.taskId, timestamp: Date.now() };
  } catch (e) {
    return {
      score: 0,
      strengths: [],
      weaknesses: ["Could not parse review output."],
      suggestions: [],
      taskId: codeOutput.taskId,
      timestamp: Date.now()
    };
  }
}