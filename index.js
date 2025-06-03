import { initializeApp } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js";
import { getDatabase, ref, set, get, child } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-database.js";

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

// Elements
const loginBtn = document.getElementById('show-login');
const registerBtn = document.getElementById('show-register');
const form = document.getElementById('auth-form');
const submitBtn = document.getElementById('auth-submit');
const usernameField = document.getElementById('username-field');
const usernameInput = document.getElementById('auth-username');
const emailInput = document.getElementById('auth-email');
const passwordInput = document.getElementById('auth-password');
const message = document.getElementById('auth-message');
const status = document.getElementById('auth-status');

let mode = "login";
function switchMode(newMode) {
  if (mode === newMode) return;
  // Fade out animation
  form.classList.remove('fade-in');
  form.classList.add('fade-out');
  setTimeout(() => {
    mode = newMode;
    if (mode === "register") {
      usernameField.classList.remove('hidden');
      submitBtn.textContent = "Register";
      registerBtn.classList.add('active');
      loginBtn.classList.remove('active');
    } else {
      usernameField.classList.add('hidden');
      submitBtn.textContent = "Login";
      loginBtn.classList.add('active');
      registerBtn.classList.remove('active');
    }
    message.textContent = "";
    // Fade in
    form.classList.remove('fade-out');
    form.classList.add('fade-in');
  }, 320);
}

loginBtn.onclick = () => switchMode("login");
registerBtn.onclick = () => switchMode("register");

form.onsubmit = function(e) {
  e.preventDefault();
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const username = usernameInput.value.trim();

  if (mode === "register") {
    if (!email || !password || !username) {
      showMessage("Please fill in all fields.", true);
      return;
    }
    createUserWithEmailAndPassword(auth, email, password)
      .then(userCredential => {
        return set(ref(db, 'users/' + userCredential.user.uid), { username, email });
      })
      .then(() => {
        showMessage("Registration successful! You can now log in.", false);
        switchMode("login");
      })
      .catch(error => showMessage(error.message, true));
  } else {
    if (!email || !password) {
      showMessage("Enter email and password.", true);
      return;
    }
    signInWithEmailAndPassword(auth, email, password)
      .then(() => showMessage("Login successful!", false))
      .catch(error => showMessage(error.message, true));
  }
};

function showMessage(msg, isError = false) {
  message.textContent = msg;
  message.className = isError ? "error" : "success";
  setTimeout(() => { message.className = ""; }, 2500);
}

// Auth state changes (show user info)
onAuthStateChanged(auth, user => {
  if (user) {
    get(child(ref(db), 'users/' + user.uid)).then(snapshot => {
      const data = snapshot.exists() ? snapshot.val() : {};
      status.innerHTML = `
        <div style="margin-top:1em;">
          <strong>Logged in as:</strong><br>
          ${data.username ? data.username : user.email} <br>
          <button id="signout-btn">Sign Out</button>
        </div>
      `;
      document.getElementById('signout-btn').onclick = () => signOut(auth);
    });
  } else {
    status.innerHTML = "";
  }
});