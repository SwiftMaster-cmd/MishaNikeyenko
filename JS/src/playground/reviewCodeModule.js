// playground/reviewCodeModule.js

import { sessionConfig } from './sessionConfig.js';
import { callLLM } from './llmCore.js'; // You must have a callLLM() defined elsewhere

export async function reviewCodeModule(codeOutput) {
  const prompt = `
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

Return your review like this:
{
  "score": 0-10,
  "strengths": [],
  "weaknesses": [],
  "suggestions": []
}
`;

  const result = await callLLM({
    model: sessionConfig.model,
    messages: [
      { role: "system", content: "You are a code reviewer. Respond with structured feedback only." },
      { role: "user", content: prompt }
    ]
  });

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