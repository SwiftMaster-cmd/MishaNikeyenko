// guest-portal.js

// Initialize Firebase
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

const db = firebase.database();
const auth = firebase.auth();
const gStatus = document.getElementById('gStatus');
const form = document.getElementById('guestInfoForm');

// Redirect based on explicit role
auth.onAuthStateChanged(async user => {
  if (!user) {
    // not signed in → go to login
    window.location.href = "login.html";
    return;
  }

  try {
    const snap = await db.ref(`users/${user.uid}`).get();
    const profile = snap.val() || {};
    // only send DMs/Leads to dashboard
    if (profile.role === 'dm' || profile.role === 'lead') {
      window.location.href = "dashboard.html";
    }
    // otherwise stay on guest portal
  } catch (err) {
    console.error("Role check error:", err);
    // allow guest to continue even if we can't fetch profile
  }
});

// Handle form submission
form.addEventListener('submit', async e => {
  e.preventDefault();
  gStatus.textContent = "";
  gStatus.className = "";

  const custName    = document.getElementById('custName').value.trim();
  const custPhone   = document.getElementById('custPhone').value.trim();
  const serviceType = document.getElementById('serviceType').value;
  const situation   = document.getElementById('situation').value.trim();

  if (!custName || !custPhone || !serviceType) {
    gStatus.classList.add("error");
    gStatus.textContent = "Please fill all required fields.";
    return;
  }

  try {
    await db.ref('guestinfo').push({
      custName,
      custPhone,
      serviceType,
      situation,
      submittedAt: Date.now(),
      userUid: auth.currentUser.uid
    });
    gStatus.classList.add("success");
    gStatus.textContent = "Info submitted! You may now assist your customer.";
    form.reset();
  } catch (err) {
    gStatus.classList.add("error");
    gStatus.textContent = "Error: " + err.message;
  }
});