import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-database.js";

import { showConfigStatus } from "./modules/configStatus.js";
import { showUserInfo } from "./modules/userInfo.js";
import { setupLogoutButton } from "./modules/logoutButton.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

const configStatus = document.getElementById('config-status');
const userInfo = document.getElementById('user-info');
const logoutBtn = document.getElementById('logout-btn');

onAuthStateChanged(auth, user => {
  if (user) {
    showConfigStatus(db, user.uid, configStatus);
    showUserInfo(db, user, userInfo);
    setupLogoutButton(auth, logoutBtn);
  } else {
    window.location.href = "index.html";
  }
});