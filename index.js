import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js";
import { getDatabase, ref, set, get, child } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-database.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

const loginBtn = document.getElementById('show-login');
const registerBtn = document.getElementById('show-register');
const form = document.getElementById('auth-form');
const submitBtn = document.getElementById('auth-submit');
const regFields = document.getElementById('reg-fields');
const regUsername = document.getElementById('reg-username');
const regFirstName = document.getElementById('reg-firstname');
const regLastName = document.getElementById('reg-lastname');
const emailInput = document.getElementById('auth-email');
const passwordInput = document.getElementById('auth-password');
const passwordConfirm = document.getElementById('reg-password-confirm');
const message = document.getElementById('auth-message');
const status = document.getElementById('auth-status');

let mode = "login";

function switchMode(newMode) {
  mode = newMode;
  // Top buttons
  if (mode === "login") {
    loginBtn.classList.add("active");
    registerBtn.classList.remove("active");
    regFields.classList.add("hidden");
    passwordConfirm.classList.add("hidden");
    submitBtn.textContent = "Login";
    submitBtn.classList.remove("register");
    submitBtn.classList.add("login");
    form.reset();
  } else {
    registerBtn.classList.add("active");
    loginBtn.classList.remove("active");
    regFields.classList.remove("hidden");
    passwordConfirm.classList.remove("hidden");
    submitBtn.textContent = "Register";
    submitBtn.classList.remove("login");
    submitBtn.classList.add("register");
    form.reset();
  }
  message.textContent = "";
}

loginBtn.addEventListener("click", (e) => {
  e.preventDefault();
  switchMode("login");
});
registerBtn.addEventListener("click", (e) => {
  e.preventDefault();
  switchMode("register");
});

form.onsubmit = function(e) {
  e.preventDefault();
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (mode === "register") {
    const username = regUsername.value.trim();
    const firstname = regFirstName.value.trim();
    const lastname = regLastName.value.trim();
    const confirm = passwordConfirm.value;

    if (!username || !firstname || !lastname || !email || !password || !confirm) {
      showMessage("Fill in all fields.", true);
      return;
    }
    if (password !== confirm) {
      showMessage("Passwords do not match.", true);
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
        showMessage("Registration successful! You can now log in.", false);
        switchMode("login");
        form.reset();
      })
      .catch(error => showMessage(error.message, true));
  } else {
    if (!email || !password) {
      showMessage("Enter email and password.", true);
      return;
    }
    signInWithEmailAndPassword(auth, email, password)
      .then(() => {
        showMessage("Login successful!", false);
        setTimeout(() => window.location.href = "welcome.html", 600);
      })
      .catch(error => showMessage(error.message, true));
  }
};

function showMessage(msg, isError = false) {
  message.textContent = msg;
  message.className = isError ? "error" : "success";
  setTimeout(() => { message.className = ""; }, 2500);
}

onAuthStateChanged(auth, user => {
  if (user) {
    get(child(ref(db), 'users/' + user.uid)).then(snapshot => {
      const data = snapshot.exists() ? snapshot.val() : {};
      status.innerHTML = `
        <div style="margin-top:1em;">
          <strong>Logged in as:</strong><br>
          ${data.username ? data.username : user.email} <br>
          ${data.firstname || ""} ${data.lastname || ""}<br>
          <button id="signout-btn">Sign Out</button>
        </div>
      `;
      document.getElementById('signout-btn').onclick = () => signOut(auth);
    });
  } else {
    status.innerHTML = "";
  }
});