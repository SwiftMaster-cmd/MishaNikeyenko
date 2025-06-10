// tokenTracker.js – Just token counting and logging

import { init } from "https://cdn.jsdelivr.net/npm/@dqbd/tiktoken-web/dist/esm/index.js";
const tokenizerPromise = init();

async function countMsgTokens(message) {
  const tokenizer = await tokenizerPromise;
  return tokenizer.encode(message.content).length + 4;
}

export async function breakdownMessages(msgs) {
  const byRole = { system: 0, user: 0, assistant: 0 };
  let total = 0;
  for (const m of msgs) {
    const count = await countMsgTokens(m);
    byRole[m.role] += count;
    total += count;
  }
  return { byRole, total };
}

export async function trackedChat(url, options, logUsage = true) {
  try {
    const res = await fetch(url, options);
    const data = await res.json();

    if (logUsage && data.usage && window.debugLog) {
      const { prompt_tokens, completion_tokens, total_tokens } = data.usage;
      const model = JSON.parse(options.body).model || "unknown";
      window.debugLog(`[USAGE][${model}] prompt:${prompt_tokens} completion:${completion_tokens} total:${total_tokens}`);
    }

    return data;
  } catch (err) {
    window.debugLog?.(`[ERROR][trackedChat] ${err.message}`);
    return { choices: [{ message: { content: "[Error: GPT failed]" } }] };
  }
}