// naturalCommands.js
// Centralizes all natural-language command patterns, auto-learns fixes,
// logs failures, supports aliasing, and re-routes corrected commands.

// ────────────────────────────────────────────────────────────────────────────
// Imports
// ────────────────────────────────────────────────────────────────────────────
import { ref, push, get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { db } from "../config/firebaseConfig.js";

import { webSearchBrave } from "./search.js";
import { getAssistantReply, saveMessageToChat } from "./backgpt.js";
import {
  learnAboutTopic,
  saveLastSummaryToMemory,
  getPastSearches
} from "./learnManager.js";
import {
  handleStaticCommand,
  listNotes,
  listReminders,
  listEvents
} from "./commandHandlers.js";

// ────────────────────────────────────────────────────────────────────────────
// tryNatural -- master dispatcher
// Returns true if a pattern handled the prompt, else false.
// Adds self-healing: applies saved fixes; logs failures; supports aliasing and teaching.
// ────────────────────────────────────────────────────────────────────────────
export async function tryNatural(prompt, ctx) {
  const lower = prompt.toLowerCase().trim();
  let handled = false;

  // 1️⃣  Check for user-defined fixes first with recursion prevention
  try {
    const fixSnap = await get(ref(db, `commandFixes/${ctx.uid}`));
    if (fixSnap.exists()) {
      const fixes = Object.values(fixSnap.val());
      const found = fixes.find(f => f.bad.toLowerCase() === lower);
      if (found) {
        if (found.fixed.toLowerCase().trim() !== lower) {
          return await tryNatural(found.fixed, ctx);
        }
      }
    }
  } catch (_) {}

  // 2️⃣  Handle alias teaching: when I say "X" do "Y"
  try {
    const aliasMatch = prompt.match(/^when i say\s+[""](.+?)[""]\s+do\s+[""](.+?)[""]$/i);
    if (aliasMatch) {
      const [, trigger, command] = aliasMatch;
      await push(ref(db, `commandPatterns/${ctx.uid}`), {
        match: [trigger],
        action: { type: "alias", run: command },
        timestamp: Date.now()
      });
      await saveMessageToChat("assistant", `✅ Got it. "${trigger}" will now trigger: ${command}`, ctx.uid);
      return true;
    }
  } catch (_) {}

  // 3️⃣  Teach new commands: static or GPT
  try {
    const teachMatch = prompt.match(/^teach command\s+[""](.+?)[""]\s+to\s+(reply|gpt)\s+[""](.+?)[""]$/i);
    if (teachMatch) {
      const [, trigger, type, content] = teachMatch;
      const action = type === "reply"
        ? { type: "static", response: content }
        : { type: "gpt", prompt: content };
      await push(ref(db, `commandPatterns/${ctx.uid}`), {
        match: [trigger],
        action,
        timestamp: Date.now()
      });
      await saveMessageToChat("assistant", `✅ Learned: "${trigger}"`, ctx.uid);
      return true;
    }
  } catch (_) {}

  // 4️⃣  Update existing command
  try {
    const updateMatch = prompt.match(/^update command\s+[""](.+?)[""]\s+to\s+(reply|gpt)\s+[""](.+?)[""]$/i);
    if (updateMatch) {
      const [, trigger, type, content] = updateMatch;
      const snap = await get(ref(db, `commandPatterns/${ctx.uid}`));
      if (snap.exists()) {
        const all = snap.val();
        for (const key in all) {
          const entry = all[key];
          const triggers = entry.match.map(t => t.toLowerCase());
          if (triggers.includes(trigger.toLowerCase())) {
            const updateRef = ref(db, `commandPatterns/${ctx.uid}/${key}`);
            await push(updateRef, {
              match: [trigger],
              action: type === "reply"
                ? { type: "static", response: content }
                : { type: "gpt", prompt: content },
              updated: Date.now()
            });
            await saveMessageToChat("assistant", `🔄 Updated: "${trigger}"`, ctx.uid);
            return true;
          }
        }
      }
      await saveMessageToChat("assistant", `❌ Command not found to update.`, ctx.uid);
      return true;
    }
  } catch (_) {}

  // 5️⃣  Standard pattern loop with fuzzy includes() matching
  try {
    const patternSnap = await get(ref(db, `commandPatterns/${ctx.uid}`));
    if (patternSnap.exists()) {
      const patterns = Object.values(patternSnap.val());
      for (const entry of patterns) {
        const triggers = entry.match.map(t => t.toLowerCase());
        if (triggers.some(t => lower.includes(t))) {
          const action = entry.action;
          if (action.type === "static") {
            await saveMessageToChat("assistant", action.response, ctx.uid);
            handled = true;
            break;
          }
          if (action.type === "gpt") {
            const reply = await getAssistantReply([
              { role: "system", content: action.system || "Respond appropriately." },
              { role: "user", content: action.prompt }
            ]);
            await saveMessageToChat("assistant", reply, ctx.uid);
            handled = true;
            break;
          }
          if (action.type === "alias") {
            handled = await tryNatural(action.run, ctx);
            break;
          }
        }
      }
    }
  } catch (_) {}

  // 6️⃣  Fallback GPT classifier: command vs dialog
  if (!handled) {
    try {
      const decision = await getAssistantReply([
        {
          role: "system",
          content: "Decide if this message is a user instruction (command) or just regular dialog. Reply only with 'command' or 'dialog'."
        },
        { role: "user", content: prompt }
      ]);
      const result = decision.trim().toLowerCase();

      if (result === "command") {
        await saveMessageToChat("assistant", "⚠️ That seems like a command, but I didn’t recognize it. Want to teach it?", ctx.uid);
      }
      // no reply for dialog
    } catch (_) {}
  }

  // 7️⃣  Log failure only if no command matched
  if (!handled) {
    try {
      await push(ref(db, `commandFailures/${ctx.uid}`), {
        prompt,
        timestamp: Date.now()
      });
    } catch (_) {}
  }

  return handled;
}

// ────────────────────────────────────────────────────────────────────────────
// Pattern registry (legacy, minimal, if needed; you can remove or disable)
// ────────────────────────────────────────────────────────────────────────────
const patterns = [
  // Minimal or fallback patterns if you want
];