export function extractJson(raw) {
  if (!raw) return null;
  const clean = raw
    .replace(/```json\s*([\s\S]*?)```/gi, "$1")
    .replace(/```([\s\S]*?)```/gi, "$1")
    .trim();
  try {
    return JSON.parse(clean);
  } catch {
    return null;
  }
}

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
    } else if (/\b(on\s+\w+|tomorrow|today|at\s+\d{1,2}(:\d{2})?|am|pm|Monday|Tuesday|Friday|Saturday|Sunday)\b/i.test(prompt)) {
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