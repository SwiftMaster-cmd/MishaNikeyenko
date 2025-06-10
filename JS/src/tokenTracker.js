// tokenTracker.js
import { init } from "https://cdn.jsdelivr.net/npm/@dqbd/tiktoken-web/dist/esm/index.js";
const tokenizerPromise = init();

async function countMsgTokens(message) {
  const tokenizer = await tokenizerPromise;
  return tokenizer.encode(message.content).length + 4;
}

async function breakdownMessages(msgs) {
  const byRole = { system: 0, user: 0, assistant: 0 };
  let total = 0;
  for (const m of msgs) {
    const c = await countMsgTokens(m);
    byRole[m.role] += c;
    total += c;
  }
  return { byRole, total };
}

/**
 * @param {boolean} logUsage  -- if false, skip any logging
 */
export async function trackedChat(url, options, logUsage = true) {
  let msgs = [];
  try {
    msgs = JSON.parse(options.body).messages || [];
  } catch {}
  if (logUsage && window.debugLog) {
    const { byRole, total } = await breakdownMessages(msgs);
    window.debugLog(
      `[TOKENS PRE] sys:${byRole.system} usr:${byRole.user}` +
      ` ast:${byRole.assistant} tot:${total}`,
      `bodyChars:${options.body?.length||0}`
    );
  }

  const res = await fetch(url, options);
  const data = await res.json();

  if (logUsage && data.usage && window.debugLog) {
    window.debugLog("[USAGE POST]", data.usage);
  }
  return data;
}