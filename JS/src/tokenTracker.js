// tokenTracker.js
// Standalone module to count tokens client-side and log both pre-count and actual usage to your on-screen console.

// 1. Import tokenizer from CDN
import { init } from "https://cdn.jsdelivr.net/npm/@dqbd/tiktoken-web/dist/esm/index.js";

// 2. Initialize tokenizer once
const tokenizerPromise = init();

// 3. Helper to count tokens in a single message
async function countMsgTokens(message) {
  const tokenizer = await tokenizerPromise;
  // rough +4 token overhead for role & JSON framing
  return tokenizer.encode(message.content).length + 4;
}

// 4. Breakdown function: totals by role and overall
async function breakdownMessages(messages) {
  const byRole = { system: 0, user: 0, assistant: 0 };
  let total = 0;
  for (const m of messages) {
    const c = await countMsgTokens(m);
    byRole[m.role] = (byRole[m.role] || 0) + c;
    total += c;
  }
  return { byRole, total };
}

// 5. trackedChat: logs pre-counts, makes the call, then logs actual usage
export async function trackedChat(url, options) {
  let msgs = [];
  try {
    const body = JSON.parse(options.body);
    msgs = Array.isArray(body.messages) ? body.messages : [];
  } catch {
    /* ignore parse errors */
  }

  // count before sending
  const { byRole, total: preTotal } = await breakdownMessages(msgs);
  if (window.debugLog) {
    window.debugLog(
      `[TOKENS PRE] system:${byRole.system}` +
      ` user:${byRole.user}` +
      ` assistant:${byRole.assistant}` +
      ` total:${preTotal}`,
      `bodyChars:${options.body?.length || 0}`
    );
  }

  // actual API call
  const res = await fetch(url, options);
  const data = await res.json();

  // log the usage object
  if (data.usage && window.debugLog) {
    window.debugLog("[USAGE POST]", data.usage);
  }

  return data;
}