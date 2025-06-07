// 🔹 chatUtils.js – JSON parsing and memory type detection

/**
 * Extracts the most valid JSON object from any string, robust to extra text/markdown.
 * Returns only if it has .type and .content properties.
 */
export function extractJson(raw) {
  if (!raw) return null;

  // Find all JSON objects in the string (greedy match)
  const matches = raw.match(/\{[\s\S]*?\}/g);
  if (!matches || !matches.length) return null;

  // Parse each, prefer the last (GPT tends to append correct object last)
  for (let match of matches.reverse()) {
    try {
      const obj = JSON.parse(match);
      if (typeof obj === "object" && obj.type && obj.content) return obj;
    } catch (err) {
      continue;
    }
  }
  return null;
}

/**
 * Detects intended memory type and cleans up the raw prompt.
 * Supports slashes, natural language, and day/date inference.
 */
export function detectMemoryType(prompt) {
  const lower = prompt.toLowerCase();
  const isNote     = lower.startsWith("/note ");
  const isReminder = lower.startsWith("/reminder ");
  const isCalendar = lower.startsWith("/calendar ");
  const isLog      = lower.startsWith("/log ");
  const hasSlash   = isNote || isReminder || isCalendar || isLog;
  const rawPrompt  = prompt.replace(/^\/(note|reminder|calendar|log)\s*/i, "").trim();

  let inferredType = null;
  if (!hasSlash) {
    if (/\b(remind me|reminder|remember)\b/i.test(prompt)) {
      inferredType = "reminder";
    } else if (/\b(on\s+\w+|tomorrow|today|at\s+\d{1,2}(:\d{2})?\s*(am|pm)?|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(prompt)) {
      inferredType = "calendar";
    } else if (/\b(log|journal)\b/i.test(prompt)) {
      inferredType = "log";
    }
  }

  const memoryType = hasSlash
    ? (isNote     ? "note"
     : isReminder ? "reminder"
     : isCalendar ? "calendar"
     : isLog      ? "log"
     : null)
    : inferredType;

  return { memoryType, rawPrompt };
}