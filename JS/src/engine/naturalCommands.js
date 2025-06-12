// 🔹 naturalCommands.js – Handles natural-language command interpretation & teaching
import { ref, push, get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { db } from "../config/firebaseConfig.js";
import { webSearchBrave } from "./search.js";
import { getAssistantReply, saveMessageToChat } from "./backgpt.js";
import { handleStaticCommand } from "./commandHandlers.js";

export async function tryNatural(prompt, ctx) {
  const lower = prompt.toLowerCase().trim();
  let handled = false;

  // 1️⃣ Command Fix Mapping
  try {
    const fixSnap = await get(ref(db, `commandFixes/${ctx.uid}`));
    if (fixSnap.exists()) {
      const fixes = Object.values(fixSnap.val());
      const found = fixes.find(f => f.bad.toLowerCase() === lower);
      if (found && found.fixed.toLowerCase().trim() !== lower) {
        return await tryNatural(found.fixed, ctx);
      }
    }
  } catch (_) {}

  // 2️⃣ Alias Teaching
  const aliasTeach = prompt.match(/^when i say\s+[""']?(.+?)[""']?\s+do\s+[""']?(.+?)[""']?$/i);
  if (aliasTeach) {
    const [, trigger, command] = aliasTeach;
    await push(ref(db, `commandPatterns/${ctx.uid}`), {
      match: [trigger],
      action: { type: "alias", run: command },
      timestamp: Date.now()
    });
    await saveMessageToChat("assistant", `✅ Got it. "${trigger}" will now trigger: ${command}`, ctx.uid);
    return true;
  }

  // 3️⃣ Teach new command
  const teachMatch = prompt.match(/^teach command\s+[""']?(.+?)[""']?\s+to\s+(reply|gpt)\s+[""']?(.+?)[""']?$/i);
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

  // 4️⃣ Update command
  const updateMatch = prompt.match(/^update command\s+[""']?(.+?)[""']?\s+to\s+(reply|gpt)\s+[""']?(.+?)[""']?$/i);
  if (updateMatch) {
    const [, trigger, type, content] = updateMatch;
    const snap = await get(ref(db, `commandPatterns/${ctx.uid}`));
    if (snap.exists()) {
      const all = snap.val();
      for (const key in all) {
        const entry = all[key];
        const triggers = entry.match.map(t => t.toLowerCase());
        if (triggers.includes(trigger.toLowerCase())) {
          await push(ref(db, `commandPatterns/${ctx.uid}`), {
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

  // 5️⃣ Load all command patterns
  let userPatterns = [];
  try {
    const patternSnap = await get(ref(db, `commandPatterns/${ctx.uid}`));
    if (patternSnap.exists()) {
      userPatterns = Object.values(patternSnap.val());
    }
  } catch (_) {}

  // 6️⃣ Wildcard alias
  if (!handled && userPatterns.length) {
    for (const entry of userPatterns) {
      if (entry.action?.type === "alias" && entry.match[0].includes('*')) {
        const regex = new RegExp('^' + entry.match[0].replace('*', '(.+)') + '$', 'i');
        const m = prompt.match(regex);
        if (m) {
          const arg = m[1].trim();
          const realCmd = entry.action.run.replace('*', arg);
          return await tryNatural(realCmd, ctx);
        }
      }
    }
  }

  // 7️⃣ System command mapping
  const sysCommands = [
    { triggers: ["clear chat", "reset chat"], cmd: "/clearchat" },
    { triggers: ["time", "current time"], cmd: "/time" },
    { triggers: ["date", "what date"], cmd: "/date" }
  ];
  for (const s of sysCommands) {
    if (s.triggers.some(t => lower.includes(t))) {
      await handleStaticCommand(s.cmd, ctx.chatRef, ctx.uid);
      handled = true;
      break;
    }
  }

  // 8️⃣ Fuzzy match taught commands
  if (!handled && userPatterns.length) {
    for (const entry of userPatterns) {
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

  // 9️⃣ GPT classification fallback
  if (!handled) {
    try {
      const decision = await getAssistantReply([
        {
          role: "system",
          content: "Decide if this message is a user instruction (command) or just dialog. Reply only with 'command' or 'dialog'."
        },
        { role: "user", content: prompt }
      ]);
      if (decision.trim().toLowerCase() === "command") {
        await saveMessageToChat("assistant", "⚠️ That seems like a command, but I didn’t recognize it. Want to teach it?", ctx.uid);
      }
    } catch (_) {}
  }

  // 🔟 Log unmatched input
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