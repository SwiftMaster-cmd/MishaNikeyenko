// Firebase imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js";
import { getDatabase, ref, set, get, child } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-database.js";

// Your Firebase config
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
const formTitle = document.getElementById('auth-title');
const authForm = document.getElementById('auth-form');
const emailField = document.getElementById('auth-email');
const passwordField = document.getElementById('auth-password');
const usernameField = document.getElementById('auth-username');
const submitBtn = document.getElementById('auth-submit');
const toggleForm = document.getElementById('auth-toggle');
const toggleLink = document.getElementById('auth-toggle-link');
const authMessage = document.getElementById('auth-message');
const authStatus = document.getElementById('auth-status');

let mode = 'login';

function setMode(m) {
  mode = m;
  if (m === 'register') {
    formTitle.textContent = "Register";
    usernameField.classList.remove('hidden');
    submitBtn.textContent = "Register";
    toggleForm.innerHTML = 'Already have an account? <a href="#" id="auth-toggle-link">Login</a>';
  } else {
    formTitle.textContent = "Login";
    usernameField.classList.add('hidden');
    submitBtn.textContent = "Login";
    toggleForm.innerHTML = 'Need an account? <a href="#" id="auth-toggle-link">Register</a>';
  }
  document.getElementById('auth-toggle-link').onclick = (e) => {
    e.preventDefault();
    setMode(mode === 'login' ? 'register' : 'login');
    showMessage("");
  };
  showMessage("");
}
toggleLink.onclick = (e) => {
  e.preventDefault();
  setMode(mode === 'login' ? 'register' : 'login');
  showMessage("");
};

authForm.onsubmit = function(e) {
  e.preventDefault();
  const email = emailField.value.trim();
  const password = passwordField.value;
  const username = usernameField.value.trim();

  if (mode === 'register') {
    if (!email || !password || !username) {
      showMessage("Fill in all fields.", true);
      return;
    }
    createUserWithEmailAndPassword(auth, email, password)
      .then(userCredential => {
        // Save username to database
        return set(ref(db, 'users/' + userCredential.user.uid), { username, email });
      })
      .then(() => {
        showMessage("Registration successful! Please login.", false);
        setMode('login');
      })
      .catch(error => {
        showMessage(error.message, true);
      });
  } else {
    // Login
    signInWithEmailAndPassword(auth, email, password)
      .then(() => {
        showMessage("Login successful!");
      })
      .catch(error => {
        showMessage(error.message, true);
      });
  }
};

function showMessage(msg, isError = false) {
  authMessage.textContent = msg;
  authMessage.className = isError ? "error" : (msg ? "success" : "");
}

// Auth state changes (show user info)
onAuthStateChanged(auth, user => {
  if (user) {
    // Fetch username from DB
    get(child(ref(db), 'users/' + user.uid)).then(snapshot => {
      const data = snapshot.exists() ? snapshot.val() : {};
      authStatus.innerHTML = `
        <div style="margin-top:1em;">
          <strong>Logged in as:</strong><br>
          ${data.username ? data.username : user.email} <br>
          <button id="signout-btn">Sign Out</button>
        </div>
      `;
      document.getElementById('signout-btn').onclick = () => signOut(auth);
    });
  } else {
    authStatus.innerHTML = "";
  }
});