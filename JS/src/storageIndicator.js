// 🔹 storageIndicator.js – Visual indicator for stored items and their locations
import { db } from "./firebaseConfig.js";
import {
  ref,
  onValue
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

/**
 * Call `mountStorageIndicator(uid, parentElement)` after user sign-in.
 * It creates a fixed panel showing counts for:
 *  - Notes (today)
 *  - Reminders (all)
 *  - Calendar events (all)
 *  - Memory entries (all)
 *
 * Usage example in your main `chat.js` after auth:
 *   import { mountStorageIndicator } from "./storageIndicator.js";
 *   mountStorageIndicator(uid, document.body);
 */
export function mountStorageIndicator(uid, parentElement) {
  // Create container
  const container = document.createElement("div");
  container.id = "storage-indicator";
  Object.assign(container.style, {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    color: "#fff",
    padding: "10px 12px",
    borderRadius: "8px",
    fontFamily: "sans-serif",
    fontSize: "14px",
    lineHeight: "1.4",
    zIndex: 9999,
    maxWidth: "200px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.3)"
  });

  // Title
  const title = document.createElement("div");
  title.textContent = "Storage Indicator";
  title.style.fontWeight = "bold";
  title.style.marginBottom = "6px";
  container.appendChild(title);

  // Create lines for each category
  const notesLine = createLine("Notes (Today):", "0");
  const remLine   = createLine("Reminders:", "0");
  const evLine    = createLine("Events:", "0");
  const memLine   = createLine("Memory:", "0");

  container.appendChild(notesLine.row);
  container.appendChild(remLine.row);
  container.appendChild(evLine.row);
  container.appendChild(memLine.row);

  // Append to parent
  parentElement.appendChild(container);

  // Listen for changes under notes/{uid}/{today}
  const todayDate = new Date().toISOString().slice(0, 10);
  const notesRef = ref(db, `notes/${uid}/${todayDate}`);
  onValue(notesRef, (snap) => {
    const data = snap.val() || {};
    const count = Object.keys(data).length;
    notesLine.value.textContent = String(count);
  });

  // Reminders (all under reminders/{uid})
  const remRef = ref(db, `reminders/${uid}`);
  onValue(remRef, (snap) => {
    const data = snap.val() || {};
    const count = Object.keys(data).length;
    remLine.value.textContent = String(count);
  });

  // Calendar events (all under calendarEvents/{uid})
  const evRef = ref(db, `calendarEvents/${uid}`);
  onValue(evRef, (snap) => {
    const data = snap.val() || {};
    const count = Object.keys(data).length;
    evLine.value.textContent = String(count);
  });

  // Memory entries (all under memory/{uid})
  const memRef = ref(db, `memory/${uid}`);
  onValue(memRef, (snap) => {
    const data = snap.val() || {};
    const count = Object.keys(data).length;
    memLine.value.textContent = String(count);
  });

  // Helper to create a label + value row
  function createLine(labelText, initialValue) {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.marginBottom = "4px";

    const label = document.createElement("span");
    label.textContent = labelText;
    label.style.opacity = "0.9";

    const value = document.createElement("span");
    value.textContent = initialValue;
    value.style.fontWeight = "bold";

    row.appendChild(label);
    row.appendChild(value);
    return { row, value };
  }
}