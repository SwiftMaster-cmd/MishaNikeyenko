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

// Redirect based on auth/role
auth.onAuthStateChanged(async user => {
  if (!user) {
    return void (window.location.href = "login.html");
  }
  const snap = await db.ref(`users/${user.uid}`).get();
  const profile = snap.val();
  // only true guests stay here
  if (!profile || profile.role === 'dm' || profile.role === 'lead') {
    window.location.href = "dashboard.html";
  }
});

// Handle form submission
document.getElementById('guestInfoForm').addEventListener('submit', async e => {
  e.preventDefault();
  gStatus.textContent = '';
  const custName    = document.getElementById('custName').value.trim();
  const custPhone   = document.getElementById('custPhone').value.trim();
  const serviceType = document.getElementById('serviceType').value;
  const situation   = document.getElementById('situation').value.trim();

  if (!custName || !custPhone || !serviceType) {
    gStatus.style.color = "#b00";
    return void (gStatus.textContent = 'Please fill all required fields.');
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
    gStatus.style.color = "#2c7a13";
    gStatus.textContent = 'Info submitted! You may now assist your customer.';
    e.target.reset();
  } catch (err) {
    gStatus.style.color = "#b00";
   