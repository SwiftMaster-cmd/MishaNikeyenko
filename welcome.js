// --- Firebase Config ---
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
import { getDatabase, ref, get, child } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-database.js";

// --- MODULE: Config Status ---
function showConfigStatus(db, uid, element) {
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

// --- MODULE: User Info ---
function showUserInfo(db, user, element) {
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

// --- MODULE: Logout Button ---
function setupLogoutButton(auth, button) {
  button.onclick = () => signOut(auth).then(() => window.location.href = "index.html");
}

// --- APP INIT ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

const configStatus = document.getElementById('config-status');
const userInfo = document.getElementById('user-info');
const logoutBtn = document.getElementById('logout-btn');

// Snapchat button (main card)
const snapchatBtn = document.getElementById('snapchat-btn');
if (snapchatBtn) {
  snapchatBtn.onclick = () => {
    window.open('https://www.snapchat.com/web/f378013e-3442-57bb-b9e7-4b03a1ba0e5d/', '_blank', 'noopener,noreferrer');
  };
}

// Profile toggle
const profileToggleBtn = document.getElementById('profile-toggle-btn');
const profileCard = document.getElementById('profile-card');
let profileVisible = false;
if (profileToggleBtn && profileCard) {
  profileToggleBtn.onclick = () => {
    profileVisible = !profileVisible;
    profileCard.style.display = profileVisible ? "block" : "none";
    profileToggleBtn.textContent = profileVisible ? "Hide Profile" : "Show Profile";
  };
}

onAuthStateChanged(auth, user => {
  if (user) {
    showConfigStatus(db, user.uid, configStatus);
    showUserInfo(db, user, userInfo);
    setupLogoutButton(auth, logoutBtn);
  } else {
    window.location.href = "index.html";
  }
});