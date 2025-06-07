// 🔹 selfEvolve.js – Assistant Progression & Suggestion Engine

import { db } from "./firebaseConfig.js";
import { ref, push, get, set } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { fetchNode } from "./firebaseHelpers.js";
import { getNotes, getReminders, getCalendar, getMemory } from "./memoryManager.js";

// Log a usage event (call this from chat/commands/backgpt)
export async function logUsage(uid, { type, command, success, detail }) {
  const usageRef = ref(db, `usageStats/${uid}`);
  await push(usageRef, {
    type,       // "command" | "prompt" | "error" | "feature"
    command,    // string: command text, prompt type, or error
    success,    // true/false/null
    detail,     // string: extra info if needed
    timestamp: Date.now()
  });
}

// Analyze usage logs for self-improvement suggestions
export async function getSelfImprovementSuggestions(uid) {
  // 1. Load last 100 usage events
  const logsRaw = await fetchNode(`usageStats/${uid}`);
  const logs = Object.values(logsRaw || {});
  if (!logs.length) return { title: "Self-Improvement Suggestions", items: ["No usage data found."] };

  // 2. Count commands/prompts and errors
  const commandCounts = {};
  const failureCounts = {};
  logs.forEach(log => {
    if (!log.command) return;
    const cmd = log.command.toLowerCase();
    commandCounts[cmd] = (commandCounts[cmd] || 0) + 1;
    if (log.success === false) failureCounts[cmd] = (failureCounts[cmd] || 0) + 1;
  });

  // 3. Find most common and most failed
  const topCommands = Object.entries(commandCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  const topFailures = Object.entries(failureCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  // 4. Build suggestion items
  const items = [];
  topCommands.forEach(([cmd, count]) => {
    if (count > 3) items.push(`You often use "${cmd}" (${count} times). Consider making this a shortcut or automating it.`);
  });
  topFailures.forEach(([cmd, count]) => {
    if (count > 1) items.push(`"${cmd}" failed ${count} times. Suggest improving or supporting this command.`);
  });
  if (!items.length) items.push("No repetitive or failed actions found. Bot is running efficiently!");

  // 5. Optionally: scan memory/notes for patterns
  // (extend here if you want deep analysis)

  // 6. Return [LIST] block structure
  return {
    title: "Self-Improvement Suggestions",
    items
  };
}

// Accept or reject a suggestion for tracking
export async function markSuggestion(uid, suggestion, accepted) {
  const suggestionId = suggestion.replace(/\W+/g, "_").toLowerCase().slice(0, 48); // simple ID
  await set(ref(db, `selfSuggestions/${uid}/${suggestionId}`), {
    suggestion,
    accepted,
    timestamp: Date.now()
  });
}