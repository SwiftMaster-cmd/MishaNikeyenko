// employee/guest-portal.js

/* =======================================================================
   Firebase init (guarded in case dashboard loaded first)
   ======================================================================= */
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

/* =======================================================================
   DOM helpers
   ======================================================================= */
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

/* =======================================================================
   State
   ======================================================================= */
let currentEntryKey = null;         // guestinfo/<key>
let currentGuestObj = null;         // loaded guestinfo snapshot data

/* =======================================================================
   Load existing guestinfo if query param present
   Accepts ?gid=<key> (new) or ?entry=<key> (back compat)
   ======================================================================= */
async function loadExistingGuestIfParam() {
  const gidParam   = qs('gid');
  const entryParam = qs('entry');
  const key = gidParam || entryParam;
  if (!key) return false;

  try {
    const snap = await db.ref(`guestinfo/${key}`).get();
    const data = snap.val();
    if (data) {
      currentEntryKey = key;
      currentGuestObj = data;
      return true;
    }
  } catch (e) {
    console.error("guest-portal: load error", e);
  }
  return false;
}

/* =======================================================================
   Prefill UI based on loaded guestinfo record
   Steps:
     Step1 always hidden (already done)
     Step2 shown if no evaluate; else Step3
     Step2 fields prefilled if evaluate exists (let user edit)
     Step3 field prefilled if solution exists (let user edit)
   ======================================================================= */
function syncUiToLoadedGuest() {
  if (!currentGuestObj) return;

  // Hide Step 1 always when editing existing guest
  hide('step1Form');
  injectPrefillSummary(currentGuestObj.custName, currentGuestObj.custPhone);

  const hasEval     = !!currentGuestObj.evaluate;
  const hasSolution = !!currentGuestObj.solution;

  // Prefill Step 2 values
  if (hasEval) {
    const ev = currentGuestObj.evaluate;
    const stEl  = document.getElementById('serviceType');
    const sitEl = document.getElementById('situation');
    const carEl = document.getElementById('evalCarrier');
    const reqEl = document.getElementById('evalRequirements');
    if (stEl)  stEl.value  = ev.serviceType  || '';
    if (sitEl) sitEl.value = ev.situation    || '';
    if (carEl) carEl.value = ev.carrierInfo  || '';
    if (reqEl) reqEl.value = ev.requirements || '';
  }

  // Prefill Step 3
  if (hasSolution) {
    const solEl = document.getElementById('solutionText');
    if (solEl) solEl.value = currentGuestObj.solution.text || '';
  }

  // Show correct step
  if (!hasEval) {
    show('step2Form');
    hide('step3Form');
  } else {
    hide('step2Form');
    show('step3Form');
  }
}

/* =======================================================================
   Auth guard
   ======================================================================= */
auth.onAuthStateChanged(async user => {
  if (!user) {
    window.location.href = "../login.html";
    return;
  }

  const found = await loadExistingGuestIfParam();
  if (found) {
    syncUiToLoadedGuest();
    return;
  }

  // no existing record param -> start Step 1
  show('step1Form');
});

/* =======================================================================
   STEP 1 Handler
   If editing an existing record (currentEntryKey set), update Step 1 fields
   instead of pushing a new record.
   ======================================================================= */
document.getElementById('step1Form')
  .addEventListener('submit', async e => {
    e.preventDefault();
    statusMsg('status1', '', '');

    const custName  = document.getElementById('custName').value.trim();
    const custPhone = document.getElementById('custPhone').value.trim();

    if (!custName || !custPhone) {
      statusMsg('status1','Please fill both name and phone.','error');
      return;
    }

    try {
      if (currentEntryKey) {
        // update existing Step 1
        await db.ref(`guestinfo/${currentEntryKey}`).update({
          custName,
          custPhone,
          updatedAt: Date.now()
        });
      } else {
        // create new guestinfo record
        const refPush = await db.ref('guestinfo').push({
          custName,
          custPhone,
          submittedAt: Date.now(),
          userUid: auth.currentUser?.uid || null,
          status: "new"
        });
        currentEntryKey = refPush.key;
      }

      // reflect local state
      if (!currentGuestObj) currentGuestObj = {};
      currentGuestObj.custName  = custName;
      currentGuestObj.custPhone = custPhone;

      statusMsg('status1','Step 1 saved!','success');
      hide('step1Form');
      show('step2Form');
      injectPrefillSummary(custName, custPhone);
    } catch (err) {
      statusMsg('status1','Error: ' + err.message,'error');
    }
  });

/* =======================================================================
   STEP 2 Handler
   Writes /evaluate + status "working"
   ======================================================================= */
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
      const updates = {};
      updates[`guestinfo/${currentEntryKey}/evaluate`] = {
        serviceType,
        situation,
        carrierInfo,
        requirements
      };
      updates[`guestinfo/${currentEntryKey}/status`]    = "working";
      updates[`guestinfo/${currentEntryKey}/updatedAt`] = Date.now();
      await db.ref().update(updates);

      // local reflect
      if (!currentGuestObj) currentGuestObj = {};
      currentGuestObj.evaluate = {serviceType,situation,carrierInfo,requirements};
      currentGuestObj.status   = "working";

      statusMsg('status2','Step 2 saved!','success');
      hide('step2Form');
      show('step3Form');
    } catch (err) {
      statusMsg('status2','Error: ' + err.message,'error');
    }
  });

/* =======================================================================
   STEP 3 Handler
   Writes /solution + status "proposal"
   ======================================================================= */
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
      const now = Date.now();
      const updates = {};
      updates[`guestinfo/${currentEntryKey}/solution`] = {
        text: solution,
        completedAt: now
      };
      updates[`guestinfo/${currentEntryKey}/status`]    = "proposal";
      updates[`guestinfo/${currentEntryKey}/updatedAt`] = now;
      await db.ref().update(updates);

      // local reflect
      if (!currentGuestObj) currentGuestObj = {};
      currentGuestObj.solution = {text:solution,completedAt:now};
      currentGuestObj.status   = "proposal";

      statusMsg('status3','All steps completed! Thanks.','success');
    } catch (err) {
      statusMsg('status3','Error: ' + err.message,'error');
    }
  });