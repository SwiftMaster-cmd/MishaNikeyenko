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

// 1️⃣ Auth guard: only redirect if NOT signed in
auth.onAuthStateChanged(user => {
  if (!user) {
    window.location.href = "login.html";
  }
  // otherwise stay on this page, regardless of role
});

// 2️⃣ STEP 1 → push only name & phone
document.getElementById('step1Form')
  .addEventListener('submit', async e => {
    e.preventDefault();
    const s1 = document.getElementById('status1');
    s1.textContent = '';
    s1.className = 'g-status';

    const custName  = document.getElementById('custName').value.trim();
    const custPhone = document.getElementById('custPhone').value.trim();

    if (!custName || !custPhone) {
      s1.classList.add('error');
      s1.textContent = 'Please fill both name and phone.';
      return;
    }

    try {
      const refPush = await db.ref('guestinfo').push({
        custName,
        custPhone,
        submittedAt: Date.now(),
        userUid: auth.currentUser.uid
      });
      currentEntryKey = refPush.key;
      s1.classList.add('success');
      s1.textContent = 'Step 1 saved!';
      // advance to Step 2
      document.getElementById('step1Form').classList.add('hidden');
      document.getElementById('step2Form').classList.remove('hidden');
    } catch (err) {
      s1.classList.add('error');
      s1.textContent = 'Error: ' + err.message;
    }
  });

// 3️⃣ STEP 2 → captures serviceType, situation, carrierInfo, requirements
document.getElementById('step2Form')
  .addEventListener('submit', async e => {
    e.preventDefault();
    const s2 = document.getElementById('status2');
    s2.textContent = '';
    s2.className = 'g-status';

    const serviceType  = document.getElementById('serviceType').value;
    const situation    = document.getElementById('situation').value.trim();
    const carrierInfo  = document.getElementById('evalCarrier').value.trim();
    const requirements = document.getElementById('evalRequirements').value.trim();

    if (!serviceType || !situation) {
      s2.classList.add('error');
      s2.textContent = 'Service type & situation are required.';
      return;
    }

    try {
      await db.ref(`guestinfo/${currentEntryKey}/evaluate`).set({
        serviceType,
        situation,
        carrierInfo,
        requirements
      });
      s2.classList.add('success');
      s2.textContent = 'Step 2 saved!';
      // advance to Step 3
      document.getElementById('step2Form').classList.add('hidden');
      document.getElementById('step3Form').classList.remove('hidden');
    } catch (err) {
      s2.classList.add('error');
      s2.textContent = 'Error: ' + err.message;
    }
  });

// 4️⃣ STEP 3 → solution
document.getElementById('step3Form')
  .addEventListener('submit', async e => {
    e.preventDefault();
    const s3 = document.getElementById('status3');
    s3.textContent = '';
    s3.className = 'g-status';

    const solution = document.getElementById('solutionText').value.trim();
    if (!solution) {
      s3.classList.add('error');
      s3.textContent = 'Please describe the solution.';
      return;
    }

    try {
      await db.ref(`guestinfo/${currentEntryKey}/solution`).set({
        text: solution,
        completedAt: Date.now()
      });
      s3.classList.add('success');
      s3.textContent = 'All steps completed! Thanks.';
      // you could hide the form here if desired
    } catch (err) {
      s3.classList.add('error');
      s3.textContent = 'Error: ' + err.message;
    }
  });