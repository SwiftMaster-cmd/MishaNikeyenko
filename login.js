// Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyD9fILTNJQ0wsPftUsPkdLrhRGV9dslMzE",
  authDomain: "osls-644fd.firebaseapp.com",
  databaseURL: "https://osls-644fd-default-rtdb.firebaseio.com",
  projectId: "osls-644fd",
  storageBucket: "osls-644fd.appspot.com",
  messagingSenderId: "798578046321",
  appId: "1:798578046321:web:8758776701786a2fccf2d0",
  measurementId: "G-9HWXNSBE1T"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

const loginForm = document.getElementById('loginForm');
const statusDiv = document.getElementById('loginStatus');
let registering = false;

loginForm.onsubmit = async function(e) {
  e.preventDefault();
  statusDiv.textContent = "";
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  try {
    if (registering) {
      await auth.createUserWithEmailAndPassword(email, password);
      const user = auth.currentUser;
      await db.ref('users/' + user.uid).set({ email, role: 'guest' });
      statusDiv.style.color = "#2c7a13";
      statusDiv.textContent = "Account created! Redirecting...";
    } else {
      await auth.signInWithEmailAndPassword(email, password);
      statusDiv.style.color = "#2c7a13";
      statusDiv.textContent = "Sign-in successful! Redirecting...";
    }
  } catch (err) {
    statusDiv.style.color = "#a00";
    statusDiv.textContent = err.message.replace("Firebase:", "");
    return;
  }

  setTimeout(async () => {
    const user = auth.currentUser;
    if (!user) return;
    const snap = await db.ref('users/' + user.uid).get();
    const profile = snap.val();
    if (profile && profile.role === 'dm') {
      window.location.href = "v1/html/admin.html";
    } else if (profile && profile.role === 'lead') {
      window.location.href = "v1/html/admin.html";
    } else {
      window.location.href = "v1/html/guestinfo.html";
    }
  }, 800);
};

document.getElementById('registerLink').onclick = function() {
  registering = !registering;
  loginForm.querySelector('button').textContent = registering ? "Register" : "Sign In";
  this.textContent = registering ? "Already have an account? Sign in" : "Register new account";
  statusDiv.textContent = "";
};

document.getElementById('forgotLink').onclick = async function() {
  const email = document.getElementById('email').value.trim();
  if (!email) {
    statusDiv.textContent = "Enter your email above to reset password.";
    return;
  }
  try {
    await auth.sendPasswordResetEmail(email);
    statusDiv.style.color = "#2c7a13";
    statusDiv.textContent = "Password reset link sent!";
  } catch (err) {
    statusDiv.style.color = "#a00";
    statusDiv.textContent = err.message.replace("Firebase:", "");
  }
};

auth.onAuthStateChanged(async user => {
  if (user) {
    const snap = await db.ref('users/' + user.uid).get();
    const profile = snap.val();
    if (profile && profile.role === 'dm') {
      window.location.href = "v1/html/admin.html";
    } else if (profile && profile.role === 'lead') {
      window.location.href = "v1/html/admin.html";
    } else {
      window.location.href = "v1/html/guestinfo.html";
    }
  }
});