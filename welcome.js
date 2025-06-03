import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js";
import { getDatabase, ref, get, child } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-database.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

const userInfo = document.getElementById('user-info');
const signoutBtn = document.getElementById('signout-btn');

onAuthStateChanged(auth, (user) => {
  if (user) {
    get(child(ref(db), 'users/' + user.uid)).then(snapshot => {
      const data = snapshot.exists() ? snapshot.val() : {};
      userInfo.innerHTML = `
        <strong>Welcome, ${data.firstname || ""} ${data.lastname || ""}!</strong><br>
        <strong>Username:</strong> ${data.username || ""}<br>
        <strong>Email:</strong> ${user.email}
      `;
    });
  } else {
    // Not logged in, redirect to login page
    window.location.href = "index.html";
  }
});

signoutBtn.onclick = () => signOut(auth).then(() => window.location.href = "index.html");