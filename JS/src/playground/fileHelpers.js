// fileHelpers.js

// Load a JSON file from relative path or URL
export async function loadJSON(file) {
  try {
    const res = await fetch(file, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load ${file}: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error("loadJSON error:", err);
    throw err;
  }
}

// Save JSON data (no-op in browser; logs to console for now)
// Replace this with real backend storage if needed
export async function saveJSON(file, data) {
  // Browser can't write files; this is a stub for dev/demo use
  console.warn(`[fileHelpers] Would save to ${file}:`, data);
  // Example: You could POST to an API endpoint here instead
  // await fetch('/api/save-json', { method: 'POST', body: JSON.stringify({ file, data }) });
  return true;
}

// Deep clone JSON-safe objects (prevents mutation bugs)
export function cloneJSON(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// Utility: Safely get nested property, returns defaultValue if not found
export function get(obj, path, defaultValue = undefined) {
  return path.split('.').reduce((acc, part) => {
    if (acc && Object.prototype.hasOwnProperty.call(acc, part)) return acc[part];
    return defaultValue;
  }, obj);
}

// Utility: Save error logs (replace with backend POST if needed)
export async function logError(error, context = "") {
  console.error("[fileHelpers] Error:", error, context);
  // Optionally, POST error details to a remote logging service here
}