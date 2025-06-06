// 🔹 storageDebug.js – Log storage events via addDebugMessage
import { db } from "./firebaseConfig.js";
import { ref, onValue } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

/**
 * Call `watchStorageDebug(uid, addDebugMessage)` after sign-in.
 * It listens to changes under:
 *   • notes/{uid}
 *   • reminders/{uid}
 *   • calendarEvents/{uid}
 *   • memory/{uid}
 * and calls `addDebugMessage` with a brief status update.
 */
export function watchStorageDebug(uid, addDebugMessage) {
  const today = () => new Date().toISOString().slice(0, 10);

  const configs = [
    { path: `notes/${uid}`,        label: "Notes (today)" },
    { path: `reminders/${uid}`,    label: "Reminders"     },
    { path: `calendarEvents/${uid}`, label: "Events"       },
    { path: `memory/${uid}`,       label: "Memory"        }
  ];

  configs.forEach(({ path, label }) => {
    const nodeRef = ref(db, path);
    onValue(nodeRef, (snap) => {
      const data = snap.val() || {};
      let count = 0;

      if (label === "Notes (today)") {
        const todayKey = today();
        if (data[todayKey]) {
          count = Object.keys(data[todayKey]).length;
        }
      } else {
        count = Object.keys(data).length;
      }

      addDebugMessage(`🔄 ${label}: ${count}`);
    });
  });
}