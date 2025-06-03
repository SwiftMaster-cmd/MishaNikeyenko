// --- Firebase Config and Init (keep only in one JS file if you split further) ---
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

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js";
import { getDatabase, ref as dbRef, get, child } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-database.js";

// --- MODULE: Config Status ---
export function showConfigStatus(db, uid, element) {
  get(child(dbRef(db), `users/${uid}/profile`))
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

// --- MODULE: User Info ---
export function showUserInfo(db, user, element) {
  get(child(dbRef(db), `users/${user.uid}/profile`)).then(snap => {
    const profile = snap.exists() ? snap.val() : {};
    element.innerHTML = `
      <div style="margin-bottom:0.7em;">
        <strong>Username:</strong> ${profile.username || "N/A"}<br>
        <strong>Email:</strong> ${user.email}
      </div>
    `;
  }).catch(() => {
    element.innerHTML = `<div><strong>Email:</strong> ${user.email}</div>`;
  });
}

// --- MODULE: Logout Button ---
export function setupLogoutButton(auth, button) {
  button.onclick = () => signOut(auth).then(() => window.location.href = "index.html");
}

// --- Profile Dropdown Logic ---
export function setupProfileDropdown(profileToggleBtn, profileCard) {
  let profileVisible = false;
  function hideProfileCardOnClickOutside(event) {
    if (
      profileCard &&
      !profileCard.contains(event.target) &&
      !profileToggleBtn.contains(event.target)
    ) {
      profileCard.style.display = "none";
      profileVisible = false;
      profileToggleBtn.textContent = "Profile";
      document.removeEventListener('mousedown', hideProfileCardOnClickOutside);
    }
  }
  if (profileToggleBtn && profileCard) {
    profileToggleBtn.onclick = () => {
      profileVisible = !profileVisible;
      profileCard.style.display = profileVisible ? "block" : "none";
      profileToggleBtn.textContent = profileVisible ? "Close Profile" : "Profile";
      if (profileVisible) {
        document.addEventListener('mousedown', hideProfileCardOnClickOutside);
      } else {
        document.removeEventListener('mousedown', hideProfileCardOnClickOutside);
      }
    };
  }
}

// --- Shared Firebase App/Auth/DB Export ---
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);

// --- Auth State Handler (exported for use in links.js if needed) ---
export function onUserReady(cb) {
  onAuthStateChanged(auth, user => {
    if (user) {
      cb(user);
    } else {
      window.location.href = "index.html";
    }
  });
}