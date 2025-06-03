// ---- Firebase config ----
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
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js";
import { getDatabase, ref, set } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-database.js";

// ---- Firebase init ----
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// LOGIN PAGE LOGIC
const loginForm = document.getElementById('login-form');
if (loginForm) {
  loginForm.addEventListener("submit", function(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const msg = document.getElementById('login-message');
    msg.textContent = "";
    if (!email || !password) {
      msg.textContent = "Enter email and password.";
      msg.className = "error";
      return;
    }
    signInWithEmailAndPassword(auth, email, password)
      .then(() => {
        msg.textContent = "Login successful!";
        msg.className = "success";
        setTimeout(() => window.location.href = "welcome.html", 600);
      })
      .catch(error => {
        msg.textContent = error.message;
        msg.className = "error";
      });
  });
}

// REGISTER PAGE LOGIC
const registerForm = document.getElementById('register-form');
if (registerForm) {
  registerForm.addEventListener("submit", function(e) {
    e.preventDefault();
    const username = document.getElementById('reg-username').value.trim();
    const firstname = document.getElementById('reg-firstname').value.trim();
    const lastname = document.getElementById('reg-lastname').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-password-confirm').value;
    const msg = document.getElementById('register-message');
    msg.textContent = "";

    if (!username || !firstname || !lastname || !email || !password || !confirm) {
      msg.textContent = "Fill in all fields.";
      msg.className = "error";
      return;
    }
    if (password !== confirm) {
      msg.textContent = "Passwords do not match.";
      msg.className = "error";
      return;
    }
    createUserWithEmailAndPassword(auth, email, password)
      .then(userCredential => {
        return set(ref(db, 'users/' + userCredential.user.uid), {
          username,
          firstname,
          lastname,
          email
        });
      })
      .then(() => {
        msg.textContent = "Registration successful! You can now log in.";
        msg.className = "success";
        setTimeout(() => window.location.href = "login.html", 1200);
        registerForm.reset();
      })
      .catch(error => {
        msg.textContent = error.message;
        msg.className = "error";
      });
  });
}