import { db } from "./firebaseConfig.js";
import { ref, onValue } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { addDebugMessage, setDebugNodeData } from "./debugOverlay.js"; // <-- import

export function watchStorageDebug(uid, addDebugMessage) {
  const todayKey = new Date().toISOString().slice(0, 10);

  const configs = [
    { path: `notes/${uid}/${todayKey}`, label: "Notes (today)" },
    { path: `reminders/${uid}`, label: "Reminders" },
    { path: `calendarEvents/${uid}`, label: "Events" },
    { path: `memory/${uid}`, label: "Memory" },
  ];

  configs.forEach(({ path, label }) => {
    const nodeRef = ref(db, path);

    onValue(nodeRef, (snapshot) => {
      const data = snapshot.val();
      let count = 0;
      if (data && typeof data === "object") {
        count = Object.keys(data).length;
      } else {
        count = 0;
      }

      addDebugMessage(`🔄 ${label}: ${count}`);
      setDebugNodeData(label, data || {}); // <-- add snapshot for overlay
    }, (error) => {
      addDebugMessage(`⚠️ ${label} watch error: ${error.message}`);
      setDebugNodeData(label, { error: error.message }); // show error
    });
  });
}