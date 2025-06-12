// naturalCommands.js
// Fully dynamic natural language system with aliasing, teaching, and fallback intent detection

import { get, ref, push } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { db } from "./firebaseConfig.js";
import { getAssistantReply, saveMessageToChat } from "./backgpt.js";

export async function tryNatural(prompt, ctx) {
  const lower = prompt.toLowerCase().trim();

  // 🔁 Handle "when I say X do Y" alias teaching
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

  // 🧠 Command fix fallback (corrected mappings)
  const fixSnap = await get(ref(db, `commandFixes/${ctx.uid}`));
  if (fixSnap.exists()) {
    const fixes = Object.values(fixSnap.val());
    const matchFix = fixes.find(f => f.bad.toLowerCase() === lower);
    if (matchFix) {
      return await tryNatural(matchFix.fixed, ctx);
    }
  }

  // 🧱 Teach new commands: static or GPT-based
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

  // 🔄 Update command logic
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

  // 📥 Try matching stored patterns
  const patternSnap = await get(ref(db, `commandPatterns/${ctx.uid}`));
  if (patternSnap.exists()) {
    const patterns = Object.values(patternSnap.val());
    for (const entry of patterns) {
      const triggers = entry.match.map(t => t.toLowerCase());
      if (triggers.some(t => lower.includes(t))) {
        const action = entry.action;
        if (action.type === "static") {
          await saveMessageToChat("assistant", action.response, ctx.uid);
          return true;
        }
        if (action.type === "gpt") {
          const reply = await getAssistantReply([
            { role: "system", content: action.system || "Respond appropriately." },
            { role: "user", content: action.prompt }
          ]);
          await saveMessageToChat("assistant", reply, ctx.uid);
          return true;
        }
        if (action.type === "alias") {
          return await tryNatural(action.run, ctx); // recurse
        }
      }
    }
  }

  // 🔍 GPT fallback -- is it a command or dialog?
  const decision = await getAssistantReply([
    {
      role: "system",
      content: "Decide if this is a user instruction (command) or just regular dialog. Reply only with 'command' or 'dialog'."
    },
    { role: "user", content: prompt }
  ]);

  const result = decision.trim().toLowerCase();
  if (result === "command") {
    await saveMessageToChat("assistant", "⚠️ That seems like a command, but I didn’t recognize it. Want to teach it?", ctx.uid);
  } else {
    await saveMessageToChat("assistant", "💬 Got it. Just casual conversation.", ctx.uid);
  }

  // Log failure
  await push(ref(db, `commandFailures/${ctx.uid}`), {
    prompt,
    timestamp: Date.now()
  });

  return false;
}