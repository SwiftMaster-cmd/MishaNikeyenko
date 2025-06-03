import { getDatabase, ref, get, child } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-database.js";

export function showUserInfo(db, user, element) {
  get(child(ref(db), `users/${user.uid}/profile`)).then(snap => {
    const profile = snap.exists() ? snap.val() : {};
    element.innerHTML = `
      <div>
        <strong>Username:</strong> ${profile.username || "N/A"}<br>
        <strong>Email:</strong> ${user.email}
      </div>
    `;
  }).catch(() => {
    element.innerHTML = `<div><strong>Email:</strong> ${user.email}</div>`;
  });
}