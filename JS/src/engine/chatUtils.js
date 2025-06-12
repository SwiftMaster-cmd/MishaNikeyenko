// chatUtils.js – Enhanced for encrypted memory handling

// Strip JSON code block and parse cleanly
export function extractJson(raw) {
  if (!raw) return null;
  const clean = raw
    .replace(/```json\\s*([\\s\\S]*?)```/gi, "$1")
    .replace(/```([\\s\\S]*?)```/gi, "$1")
    .trim();
  try {
    return JSON.parse(clean);
  } catch {
    return null;
  }
}

// Detect memory type based on prompt
export function detectMemoryType(prompt) {
  const lower = prompt.toLowerCase();
  const isNote     = lower.startsWith("/note ");
  const isReminder = lower.startsWith("/reminder ");
  const isCalendar = lower.startsWith("/calendar ");
  const isLog      = lower.startsWith("/log ");
  const hasSlash   = isNote || isReminder || isCalendar || isLog;
  const rawPrompt  = prompt.replace(/^\\/(note|reminder|calendar|log)\\s*/i, "").trim();

  let inferredType = null;
  if (!hasSlash) {
    if (/\\b(remind me|reminder|remember)\\b/i.test(prompt)) {
      inferredType = "reminder";
    } else if (/\\b(on\\s+\\w+|tomorrow|today|at\\s+\\d{1,2}(:\\d{2})?|am|pm|monday|tuesday|friday|saturday|sunday)\\b/i.test(prompt)) {
      inferredType = "calendar";
    } else if (/\\b(log|journal)\\b/i.test(prompt)) {
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

// New ID for memory summary
export function generateEntryId() {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

// Summarize for GPT-safe context
export async function summarizeForContext(content) {
  const res = await fetch("/.netlify/functions/chatgpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-3.5-turbo",
      temperature: 0.3,
      messages: [
        { role: "system", content: "Summarize the following text in one clear sentence." },
        { role: "user", content }
      ]
    })
  });
  const json = await res.json();
  return json.choices?.[0]?.message?.content ?? "unsummarized";
}

// Very basic category guesser
export function categorizeMemory(content) {
  const lower = content.toLowerCase();
  if (lower.includes("call") || lower.includes("meet")) return "communication";
  if (lower.includes("buy") || lower.includes("money")) return "finance";
  if (lower.includes("eat") || lower.includes("gym") || lower.includes("sleep")) return "health";
  if (lower.includes("read") || lower.includes("idea")) return "learning";
  return "general";
}

// Topic guesser
export function extractTopic(content) {
  const match = content.match(/\\b(?:about|regarding|concerning)\\s+([\\w\\s]+)/i);
  return match ? match[1].trim().toLowerCase() : "general";
}

// Simple keyword tagging
export function autoTagMemory(content) {
  const tags = [];
  const lower = content.toLowerCase();
  if (lower.includes("today")) tags.push("today");
  if (lower.includes("urgent")) tags.push("urgent");
  if (lower.includes("family")) tags.push("family");
  if (lower.includes("project")) tags.push("project");
  if (lower.includes("ai") || lower.includes("assistant")) tags.push("ai");
  if (lower.includes("money") || lower.includes("pay")) tags.push("finance");
  return tags;
}