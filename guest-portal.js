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

let currentEntryKey = null;

// redirect logic (unchanged)
auth.onAuthStateChanged(async user => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  try {
    const snap = await db.ref(`users/${user.uid}`).get();
    const profile = snap.val() || {};
    if (profile.role === 'dm' || profile.role === 'lead') {
      window.location.href = "dashboard.html";
    }
  } catch (err) {
    console.error("Role check failed:", err);
  }
});

// STEP 1
document.getElementById('step1Form')
  .addEventListener('submit', async e => {
    e.preventDefault();
    const s1 = document.getElementById('status1');
    s1.textContent = '';
    const custName    = document.getElementById('custName').value.trim();
    const custPhone   = document.getElementById('custPhone').value.trim();
    const serviceType = document.getElementById('serviceType').value;
    const situation   = document.getElementById('situation').value.trim();

    if (!custName || !custPhone || !serviceType) {
      s1.textContent = 'Please fill all required fields.';
      s1.classList.add('error');
      return;
    }

    try {
      const pushRef = await db.ref('guestinfo').push({
        custName,
        custPhone,
        serviceType,
        situation,
        submittedAt: Date.now(),
        userUid: auth.currentUser.uid
      });
      currentEntryKey = pushRef.key;
      s1.textContent = 'Step 1 saved!';
      s1.classList.remove('error');
      s1.classList.add('success');

      // show Step 2
      document.getElementById('step1Form').classList.add('hidden');
      document.getElementById('step2Form').classList.remove('hidden');
    } catch (err) {
      s1.textContent = 'Error: ' + err.message;
      s1.classList.add('error');
    }
  });

// STEP 2
document.getElementById('step2Form')
  .addEventListener('submit', async e => {
    e.preventDefault();
    const s2 = document.getElementById('status2');
    s2.textContent = '';
    const carrierInfo  = document.getElementById('evalCarrier').value.trim();
    const requirements = document.getElementById('evalRequirements').value.trim();

    if (!carrierInfo && !requirements) {
      s2.textContent = 'Enter at least one evaluation detail.';
      s2.classList.add('error');
      return;
    }

    try {
      await db.ref(`guestinfo/${currentEntryKey}/evaluate`).set({
        carrierInfo,
        requirements
      });
      s2.textContent = 'Step 2 saved!';
      s2.classList.remove('error');
      s2.classList.add('success');

      // show Step 3
      document.getElementById('step2Form').classList.add('hidden');
      document.getElementById('step3Form').classList.remove('hidden');
    } catch (err) {
      s2.textContent = 'Error: ' + err.message;
      s2.classList.add('error');
    }
  });

// STEP 3
document.getElementById('step3Form')
  .addEventListener('submit', async e => {
    e.preventDefault();
    const s3 = document.getElementById('status3');
    s3.textContent = '';
    const solution = document.getElementById('solutionText').value.trim();

    if (!solution) {
      s3.textContent = 'Please describe the solution.';
      s3.classList.add('error');
      return;
    }

    try {
      await db.ref(`guestinfo/${currentEntryKey}/solution`).set({
        text: solution,
        completedAt: Date.now()
      });
      s3.textContent = 'All steps completed! Thank you.';
      s3.classList.remove('error');
      s3.classList.add('success');

      // optionally hide the form
      // document.getElementById('step3Form').classList.add('hidden');
    } catch (err) {
      s3.textContent = 'Error: ' + err.message;
      s3.classList.add('error');
    }
  });