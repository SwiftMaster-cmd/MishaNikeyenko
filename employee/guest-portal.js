// employee/guest-portal.js

// Firebase init guard (employee pages may load after dashboard)
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
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const db   = firebase.database();
const auth = firebase.auth();

let currentEntryKey = null; // guestinfo/<key>

function qs(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}
function show(id) { document.getElementById(id)?.classList.remove('hidden'); }
function hide(id) { document.getElementById(id)?.classList.add('hidden'); }
function statusMsg(id, msg, cls='') {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className   = 'g-status';
  if (cls) el.classList.add(cls);
}
function injectPrefillSummary(name, phone) {
  const step2 = document.getElementById('step2Form');
  if (!step2) return;
  let summary = document.getElementById('prefillSummary');
  if (!summary) {
    summary = document.createElement('div');
    summary.id = 'prefillSummary';
    summary.className = 'prefill-summary';
    summary.style.marginBottom = '1rem';
    step2.insertBefore(summary, step2.firstChild);
  }
  summary.innerHTML = `<b>Customer:</b> ${name || '-'} &nbsp; <b>Phone:</b> ${phone || '-'}`;
}

// Auth guard
auth.onAuthStateChanged(async user => {
  if (!user) {
    window.location.href = "../login.html";
    return;
  }
  const entryParam = qs('entry');
  if (entryParam) {
    try {
      const snap = await db.ref(`guestinfo/${entryParam}`).get();
      const data = snap.val();
      if (data) {
        currentEntryKey = entryParam;
        // hide Step 1, show Step 2, prefill summary
        hide('step1Form');
        show('step2Form');
        injectPrefillSummary(data.custName, data.custPhone);
        return;
      }
    } catch (e) {
      console.error("guest-portal: load error", e);
    }
  }
  // fallback: show Step 1
  show('step1Form');
});

/* -------------------------------------------------------------
   STEP 1 (only used if no ?entry= param)
------------------------------------------------------------- */
document.getElementById('step1Form')
  .addEventListener('submit', async e => {
    e.preventDefault();
    const s1 = document.getElementById('status1');
    statusMsg('status1', '', '');

    const custName  = document.getElementById('custName').value.trim();
    const custPhone = document.getElementById('custPhone').value.trim();

    if (!custName || !custPhone) {
      statusMsg('status1','Please fill both name and phone.','error');
      return;
    }

    try {
      const refPush = await db.ref('guestinfo').push({
        custName,
        custPhone,
        submittedAt: Date.now(),
        userUid: auth.currentUser?.uid || null
      });
      currentEntryKey = refPush.key;
      statusMsg('status1','Step 1 saved!','success');
      hide('step1Form');
      show('step2Form');
      injectPrefillSummary(custName, custPhone);
    } catch (err) {
      statusMsg('status1','Error: ' + err.message,'error');
    }
  });

/* -------------------------------------------------------------
   STEP 2
------------------------------------------------------------- */
document.getElementById('step2Form')
  .addEventListener('submit', async e => {
    e.preventDefault();
    statusMsg('status2','', '');

    const serviceType  = document.getElementById('serviceType').value;
    const situation    = document.getElementById('situation').value.trim();
    const carrierInfo  = document.getElementById('evalCarrier').value.trim();
    const requirements = document.getElementById('evalRequirements').value.trim();

    if (!serviceType || !situation) {
      statusMsg('status2','Service type & situation are required.','error');
      return;
    }
    if (!currentEntryKey) {
      statusMsg('status2','Missing guest record.','error');
      return;
    }

    try {
      await db.ref(`guestinfo/${currentEntryKey}/evaluate`).set({
        serviceType,
        situation,
        carrierInfo,
        requirements
      });
      statusMsg('status2','Step 2 saved!','success');
      hide('step2Form');
      show('step3Form');
    } catch (err) {
      statusMsg('status2','Error: ' + err.message,'error');
    }
  });

/* -------------------------------------------------------------
   STEP 3
------------------------------------------------------------- */
document.getElementById('step3Form')
  .addEventListener('submit', async e => {
    e.preventDefault();
    statusMsg('status3','', '');

    const solution = document.getElementById('solutionText').value.trim();
    if (!solution) {
      statusMsg('status3','Please describe the solution.','error');
      return;
    }
    if (!currentEntryKey) {
      statusMsg('status3','Missing guest record.','error');
      return;
    }

    try {
      await db.ref(`guestinfo/${currentEntryKey}/solution`).set({
        text: solution,
        completedAt: Date.now()
      });
      statusMsg('status3','All steps completed! Thanks.','success');
    } catch (err) {
      statusMsg('status3','Error: ' + err.message,'error');
    }
  });