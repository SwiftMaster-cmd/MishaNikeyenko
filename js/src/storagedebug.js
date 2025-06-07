// 🔹 storageDebug.js – Log storage events via addDebugMessage
import { db } from "./firebaseConfig.js";
import { ref, onValue } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

/**
 * Call `watchStorageDebug(uid, addDebugMessage)` after sign-in.
 * It listens to changes under:
 *   • notes/{uid}/{today}
 *   • reminders/{uid}
 *   • calendarEvents/{uid}
 *   • memory/{uid}
 * and calls `addDebugMessage` with a brief status update whenever any of those nodes change.
 */
export function watchStorageDebug(uid, addDebugMessage) {
  // Helper to get "YYYY-MM-DD" for today
  const todayKey = new Date().toISOString().slice(0, 10);

  const configs = [
    // Only look at "today" under notes
    {
      path: `notes/${uid}/${todayKey}`,
      label: "Notes (today)",
    },
    {
      path: `reminders/${uid}`,
      label: "Reminders",
    },
    {
      path: `calendarEvents/${uid}`,
      label: "Events",
    },
    {
      path: `memory/${uid}`,
      label: "Memory",
    },
  ];

  configs.forEach(({ path, label }) => {
    const nodeRef = ref(db, path);

    onValue(nodeRef, (snapshot) => {
      const data = snapshot.val();
      let count = 0;

      if (data && typeof data === "object") {
        count = Object.keys(data).length;
      } else {
        // If node does not exist or is null, count remains 0
        count = 0;
      }

      addDebugMessage(`🔄 ${label}: ${count}`);
    }, (error) => {
      // In case of permission or network errors, still log something
      addDebugMessage(`⚠️ ${label} watch error: ${error.message}`);
    });
  });
}// 🔹 storageDebug.js – Log storage events via addDebugMessage
import { db } from "./firebaseConfig.js";
import { ref, onValue } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

/**
 * Call `watchStorageDebug(uid, addDebugMessage)` after sign-in.
 * It listens to changes under:
 *   • notes/{uid}/{today}
 *   • reminders/{uid}
 *   • calendarEvents/{uid}
 *   • memory/{uid}
 * and calls `addDebugMessage` with a brief status update whenever any of those nodes change.
 */
export function watchStorageDebug(uid, addDebugMessage) {
  // Helper to get "YYYY-MM-DD" for today
  const todayKey = new Date().toISOString().slice(0, 10);

  const configs = [
    // Only look at "today" under notes
    {
      path: `notes/${uid}/${todayKey}`,
      label: "Notes (today)",
    },
    {
      path: `reminders/${uid}`,
      label: "Reminders",
    },
    {
      path: `calendarEvents/${uid}`,
      label: "Events",
    },
    {
      path: `memory/${uid}`,
      label: "Memory",
    },
  ];

  configs.forEach(({ path, label }) => {
    const nodeRef = ref(db, path);

    onValue(nodeRef, (snapshot) => {
      const data = snapshot.val();
      let count = 0;

      if (data && typeof data === "object") {
        count = Object.keys(data).length;
      } else {
        // If node does not exist or is null, count remains 0
        count = 0;
      }

      addDebugMessage(`🔄 ${label}: ${count}`);
    }, (error) => {
      // In case of permission or network errors, still log something
      addDebugMessage(`⚠️ ${label} watch error: ${error.message}`);
    });
  });
}