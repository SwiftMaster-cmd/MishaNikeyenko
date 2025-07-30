// login.js

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

const auth          = firebase.auth();
const db            = firebase.database();
const loginForm     = document.getElementById('loginForm');
const emailInput    = document.getElementById('email');
const passwordInput = document.getElementById('password');
const statusDiv     = document.getElementById('loginStatus');
const submitBtn     = document.getElementById('submitBtn');
const forgotBtn     = document.getElementById('forgotLink');
const registerBtn   = document.getElementById('registerLink');

let registering = false;

loginForm.addEventListener('submit', async e => {
  e.preventDefault();
  statusDiv.textContent = '';
  submitBtn.disabled = true;

  const email    = emailInput.value.trim();
  const password = passwordInput.value;

  try {
    if (registering) {
      await auth.createUserWithEmailAndPassword(email, password);
      const user = auth.currentUser;
      await db.ref(`users/${user.uid}`).set({ email, role: 'guest' });
      statusDiv.style.color   = 'var(--success)';
      statusDiv.textContent   = 'Account created! Redirecting…';
    } else {
      await auth.signInWithEmailAndPassword(email, password);
      statusDiv.style.color   = 'var(--success)';
      statusDiv.textContent   = 'Sign-in successful! Redirecting…';
    }
  } catch (err) {
    statusDiv.style.color = 'var(--danger)';
    statusDiv.textContent = err.message.replace('Firebase:', '').trim();
    submitBtn.disabled    = false;
    return;
  }

  setTimeout(async () => {
    const user = auth.currentUser;
    if (!user) return;
    const snap  = await db.ref(`users/${user.uid}`).get();
    const role  = (snap.val() || {}).role;
    const dest  = (role === 'dm' || role === 'lead')
      ? 'v1/html/admin.html'
      : 'v1/html/guestinfo.html';
    window.location.href = dest;
  }, 800);
});

registerBtn.addEventListener('click', () => {
  registering = !registering;
  submitBtn.textContent    = registering ? 'Register' : 'Sign In';
  registerBtn.textContent  = registering
    ? 'Already have an account? Sign in'
    : 'Register new account';
  statusDiv.textContent     = '';
});

forgotBtn.addEventListener('click', async () => {
  const email = emailInput.value.trim();
  if (!email) {
    statusDiv.style.color   = 'var(--warning)';
    statusDiv.textContent   = 'Enter your email above to reset password.';
    return;
  }
  try {
    await auth.sendPasswordResetEmail(email);
    statusDiv.style.color   = 'var(--success)';
    statusDiv.textContent   = 'Password reset link sent!';
  } catch (err) {
    statusDiv.style.color   = 'var(--danger)';
    statusDiv.textContent   = err.message.replace('Firebase:', '').trim();
  }
});

auth.onAuthStateChanged(async user => {
  if (!user) return;
  const snap  = await db.ref(`users/${user.uid}`).get();
  const role  = (snap.val() || {}).role;
  const dest  = (role === 'dm' || role === 'lead')
    ? 'v1/html/admin.html'
    : 'v1/html/guestinfo.html';
  window.location.href = dest;
});