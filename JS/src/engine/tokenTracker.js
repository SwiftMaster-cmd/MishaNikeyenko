// 🔢 tokenTracker.js – Logs OpenAI token usage + writes to Firebase per user

import { getDatabase, ref, push } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Optional: external debug display
function logToDebugConsole(usage) {
  if (!window.debugLog || !usage) return;
  const { prompt_tokens, completion_tokens, total_tokens } = usage;
  window.debugLog(`[USAGE] prompt:${prompt_tokens} completion:${completion_tokens} total:${total_tokens}`);
}

export async function trackedChat(url, options) {
  const res = await fetch(url, options);
  const data = await res.json();

  const auth = getAuth();
  const db = getDatabase();

  if (data.usage) {
    logToDebugConsole(data.usage);

    try {
      const uid = auth.currentUser?.uid;
      if (uid) {
        await push(ref(db, `usageStats/${uid}`), {
          timestamp: Date.now(),
          url,
          model: data.model || "unknown",
          usage: data.usage,
          prompt: (() => {
            try {
              const body = JSON.parse(options.body || "{}");
              return body.messages?.at(-1)?.content || "(unknown)";
            } catch { return "(parse error)"; }
          })()
        });
      }
    } catch (e) {
      console.warn("[USAGE] Failed to log usage:", e.message);
    }
  }

  return data;
}