// tokenTracker.js – Smart token-aware GPT calls w/ auto model switching

import { init } from "https://cdn.jsdelivr.net/npm/@dqbd/tiktoken-web/dist/esm/index.js";
const tokenizerPromise = init();

/**
 * Count estimated tokens in a message.
 */
async function countMsgTokens(message) {
  const tokenizer = await tokenizerPromise;
  return tokenizer.encode(message.content).length + 4;
}

/**
 * Breaks down token count by role.
 */
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

/**
 * trackedChat – handles GPT calls with smart model switching.
 * - Uses `gpt-4o` for user-visible chats
 * - Uses `gpt-3.5-turbo` for summaries, memory extraction, etc.
 */
export async function trackedChat(url, options, logUsage = true) {
  let msgs = [];

  try {
    const body = JSON.parse(options.body);
    msgs = body.messages || [];

    // Smart model selection
    const isVisible = msgs.some(m => m.role === "user" || m.role === "assistant");
    const model = isVisible ? "gpt-4o" : "gpt-3.5-turbo";

    // Apply model and stringify
    body.model = model;
    options.body = JSON.stringify(body);

    const res = await fetch(url, options);
    const data = await res.json();

    if (logUsage && data.usage && window.debugLog) {
      const { prompt_tokens, completion_tokens, total_tokens } = data.usage;
      window.debugLog(
        `[USAGE][${model}] prompt:${prompt_tokens} completion:${completion_tokens} total:${total_tokens}`
      );
    }

    return data;
  } catch (err) {
    if (window.debugLog) {
      window.debugLog(`[ERROR][trackedChat] ${err.message}`);
    }
    return { choices: [{ message: { content: "[Error: GPT request failed]" } }] };
  }
}