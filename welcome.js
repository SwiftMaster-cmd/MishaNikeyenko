import { initializeApp } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js";
import { getDatabase, ref, get, child } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-database.js";

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

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

const configStatus = document.getElementById('config-status');
const userInfo = document.getElementById('user-info');
const logoutBtn = document.getElementById('logout-btn');

function checkConfig(user) {
  // Try to read the current user's profile node
  get(child(ref(db), `users/${user.uid}/profile`))
    .then(snap => {
      if (snap.exists()) {
        configStatus.innerHTML = "<span style='color:#00ff88'>✅ Config Works</span>";
      } else {
        configStatus.innerHTML = "<span style='color:orange'>⚠️ Config OK, but no user data found</span>";
      }
    })
    .catch(err => {
      configStatus.innerHTML = "<span style='color:#ff4d4d'>❌ Config Error: " + err.message + "</span>";
    });
}

onAuthStateChanged(auth, user => {
  if (user) {
    // Get/display more profile info if desired
    get(child(ref(db), `users/${user.uid}/profile`)).then(snap => {
      const profile = snap.exists() ? snap.val() : {};
      userInfo.innerHTML = `
        <div>
          <strong>Username:</strong> ${profile.username || "N/A"}<br>
          <strong>Email:</strong> ${user.email}
        </div>
      `;
      checkConfig(user);
    }).catch(() => {
      userInfo.innerHTML = `<div><strong>Email:</strong> ${user.email}</div>`;
      checkConfig(user);
    });
  } else {
    window.location.href = "index.html";
  }
});

logoutBtn.onclick = () => signOut(auth).then(() => window.location.href = "index.html");