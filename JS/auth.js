import { initializeApp } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js";
import { getDatabase, ref, set } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-database.js";

// ENV-based config (must be injected at build by Vite or Netlify)
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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// Login Handler
const loginForm = document.getElementById('login-form');
if (loginForm) {
  loginForm.onsubmit = async e => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const msg = document.getElementById('login-message');
    msg.textContent = "";
    msg.className = "";

    try {
      await signInWithEmailAndPassword(auth, email, password);
      msg.textContent = "✅ Login successful!";
      msg.className = "success";
      setTimeout(() => (window.location.href = "HTML/welcome.html"), 800);
    } catch (err) {
      msg.textContent = err.message;
      msg.className = "error";
    }
  };
}

// Registration Handler
const registerForm = document.getElementById('register-form');
if (registerForm) {
  registerForm.onsubmit = async e => {
    e.preventDefault();
    const username = document.getElementById('reg-username')?.value.trim() || "";
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-password-confirm')?.value || "";
    const msg = document.getElementById('register-message');
    msg.textContent = "";
    msg.className = "";

    if (!email || !password || (confirm && password !== confirm)) {
      msg.textContent = confirm && password !== confirm
        ? "❌ Passwords don't match."
        : "❌ Fill in all required fields.";
      msg.className = "error";
      return;
    }

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      if (username) {
        await set(ref(db, `users/${cred.user.uid}/profile`), { email, username });
      }
      msg.textContent = "✅ Registered! You can now log in.";
      msg.className = "success";
      setTimeout(() => (window.location.href = "index.html"), 1200);
      registerForm.reset();
    } catch (err) {
      msg.textContent = err.message;
      msg.className = "error";
    }
  };
}