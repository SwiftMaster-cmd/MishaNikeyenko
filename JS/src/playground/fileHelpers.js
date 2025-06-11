// fileHelpers.js

export async function loadJSON(file) {
  const res = await fetch(file);
  if (!res.ok) throw new Error(`Failed to load ${file}`);
  return await res.json();
}

export async function saveJSON(file, data) {
  // For demo: can't save to disk directly in browser!
  // Replace with a real backend call if you want persistence.
  console.warn(`Would save to ${file}:`, data);
}