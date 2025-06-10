// tokenTracker.js – Smart model switcher for visible vs background GPT calls

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
  let msgs = [];

  try {
    const body = JSON.parse(options.body);
    msgs = body.messages || [];

    const isVisible = msgs.some(m => m.role === "user" || m.role === "assistant");
    const model = isVisible ? "gpt-4o" : "gpt-3.5-turbo";

    body.model = model;
    options.body = JSON.stringify(body);

    const res = await fetch(url, options);
    const data = await res.json();

    if (logUsage && data.usage && window.debugLog) {
      const { prompt_tokens, completion_tokens, total_tokens } = data.usage;
      window.debugLog(`[USAGE][${model}] prompt:${prompt_tokens} completion:${completion_tokens} total:${total_tokens}`);
    }

    return data;
  } catch (err) {
    if (window.debugLog) {
      window.debugLog(`[ERROR][trackedChat] ${err.message}`);
    }
    return { choices: [{ message: { content: "[Error: GPT call failed]" } }] };
  }
}