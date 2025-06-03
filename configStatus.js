import { getDatabase, ref, get, child } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-database.js";

export function showConfigStatus(db, uid, element) {
  // Try to read the user's profile node
  get(child(ref(db), `users/${uid}/profile`))
    .then(snap => {
      if (snap.exists()) {
        element.innerHTML = "<span style='color:#00ff88'>✅ Config Works</span>";
      } else {
        element.innerHTML = "<span style='color:orange'>⚠️ Config OK, but no user data found</span>";
      }
    })
    .catch(err => {
      element.innerHTML = "<span style='color:#ff4d4d'>❌ Config Error: " + err.message + "</span>";
    });
}