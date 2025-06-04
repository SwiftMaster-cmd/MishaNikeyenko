/* /JS/profile.js  – unified profile / auth helper */
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js";
import { getDatabase, ref as dbRef, get, child } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-database.js";

/* -- Firebase Config -- */
const firebaseConfig = {
  apiKey: "AIzaSyCf_se10RUg8i_u8pdowHlQvrFViJ4jh_Q",
  authDomain: "mishanikeyenko.firebaseapp.com",
  databaseURL: "https://mishanikeyenko-default-rtdb.firebaseio.com",
  projectId: "mishanikeyenko",
  storageBucket: "mishanikeyenko.firebasestorage.app",
  messagingSenderId: "1089190937368",
  appId: "1:1089190937368:web:959c825fc596a5e3ae946d",
  measurementId: "G-L6CC27129C"
};

/* -- App singletons -- */
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getDatabase(app);

/* -- UI helpers -- */
export function showConfigStatus(db, uid, el) {
  get(child(dbRef(db), `users/${uid}/profile`))
    .then(snap => {
      el.innerHTML = snap.exists()
        ? "<span class='ok'>✅ Config works</span>"
        : "<span class='warn'>⚠️ Config OK, but no user data</span>";
    })
    .catch(err => {
      el.innerHTML = `<span class='bad'>❌ Config error: ${err.message}</span>`;
    });
}

export function showUserInfo(db, user, el) {
  get(child(dbRef(db), `users/${user.uid}/profile`))
    .then(snap => {
      const p = snap.exists() ? snap.val() : {};
      el.innerHTML = `
        <div>
          <strong>Username:</strong> ${p.username || "N/A"}<br>
          <strong>Email:</strong> ${user.email}
        </div>`;
    })
    .catch(() => {
      el.innerHTML = `<div><strong>Email:</strong> ${user.email}</div>`;
    });
}

export function setupLogoutButton(auth, btn) {
  btn.onclick = () => signOut(auth).then(() => (window.location.href = "../index.html"));
}

export function setupProfileDropdown(toggleBtn, card) {
  let open = false;

  function toggle(state = !open) {
    open = state;
    card.setAttribute("aria-hidden", String(!open));
    toggleBtn.textContent = open ? "Close Profile" : "Profile";
  }

  toggleBtn.addEventListener("click", () => toggle());

  document.addEventListener("mousedown", e => {
    if (open && !card.contains(e.target) && !toggleBtn.contains(e.target)) toggle(false);
  });
}

/* -- Auth gate + DOM bootstrap -- */
function initProfileUI() {
  const $toggle = document.getElementById("profile-toggle-btn");
  const $card   = document.getElementById("profile-card");
  const $info   = document.getElementById("user-info");
  const $status = document.getElementById("config-status");
  const $logout = document.getElementById("logout-btn");

  setupProfileDropdown($toggle, $card);
  setupLogoutButton(auth, $logout);

  onAuthStateChanged(auth, user => {
    if (!user) return (window.location.href = "../index.html");
    showUserInfo(db, user, $info);
    showConfigStatus(db, user.uid, $status);
    $toggle.disabled = false;
  });
}

document.addEventListener("DOMContentLoaded", initProfileUI);