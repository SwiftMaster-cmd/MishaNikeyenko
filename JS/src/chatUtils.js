// 🔹 chatUtils.js – JSON extractors + memory type detection

// Extracts clean JSON block from GPT output
export function extractJson(raw) {
  if (!raw || typeof raw !== "string") return null;

  try {
    // Remove code block wrappers like ```json ... ```
    const clean = raw
      .replace(/```json\s*([\s\S]*?)```/gi, "$1")
      .replace(/```([\s\S]*?)```/gi, "$1")
      .replace(/^[\s\S]*?{/, "{")   // Trim before first {
      .replace(/}[\s\S]*$/, "}")    // Trim after last }
      .trim();

    return JSON.parse(clean);
  } catch (err) {
    console.error("[extractJson] Invalid JSON:", err.message);
    return null;
  }
}

// Detects memory type and extracts cleaned prompt
export function detectMemoryType(prompt) {
  const lower = prompt.toLowerCase().trim();

  const isNote     = lower.startsWith("/note ");
  const isReminder = lower.startsWith("/reminder ");
  const isCalendar = lower.startsWith("/calendar ");
  const isLog      = lower.startsWith("/log ");

  const hasSlash = isNote || isReminder || isCalendar || isLog;

  const rawPrompt = prompt.replace(/^\/(note|reminder|calendar|log)\s*/i, "").trim();

  let inferredType = null;

  if (!hasSlash) {
    if (/\b(remind me|reminder|remember)\b/i.test(prompt)) {
      inferredType = "reminder";
    } else if (/\b(on\s+\w+|tomorrow|today|at\s+\d{1,2}(:\d{2})?\s?(am|pm)?|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i.test(prompt)) {
      inferredType = "calendar";
    } else if (/\b(log|journal|diary)\b/i.test(prompt)) {
      inferredType = "log";
    }
  }

  const memoryType = hasSlash
    ? (isNote ? "note"
      : isReminder ? "reminder"
      : isCalendar ? "calendar"
      : isLog ? "log"
      : null)
    : inferredType;

  return { memoryType, rawPrompt };
}