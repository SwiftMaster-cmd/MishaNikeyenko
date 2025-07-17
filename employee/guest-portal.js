// employee/guest-portal.js  (Weighted Completion Version)

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
   CONFIG: Weighted Completion
   -----------------------------------------------------------------------
   You may override any/all of these by setting
       window.GUEST_COMPLETION_WEIGHTS = { ... }
   *before* this script loads. Missing pieces fall back to defaults.
   Weights add to 100 total (not required, we'll scale if not).
   Each step has:
     weight: number (portion of total score)
     fields: { fieldName: number (portion of step weight) }
   Any field absent from the config contributes 0.
   ======================================================================= */
const DEFAULT_COMPLETION_WEIGHTS = {
  step1: {
    weight: 30,
    fields: {
      custName: 50,
      custPhone: 50
    }
  },
  step2: {
    weight: 40,
    fields: {
      serviceType: 25,
      situation: 37.5,
      carrierInfo: 12.5,
      requirements: 25
    }
  },
  step3: {
    weight: 30,
    fields: {
      solutionText: 100
    }
  }
};
function getCompletionWeights() {
  const cfg = window.GUEST_COMPLETION_WEIGHTS || {};
  // shallow merge steps; deeper merge fields
  const out = JSON.parse(JSON.stringify(DEFAULT_COMPLETION_WEIGHTS));
  for (const k of Object.keys(cfg)) {
    if (!out[k]) out[k] = {};
    if (typeof cfg[k].weight === "number") out[k].weight = cfg[k].weight;
    if (cfg[k].fields) {
      out[k].fields = { ...out[k].fields, ...cfg[k].fields };
    }
  }
  return out;
}

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

/* -----------------------------------------------------------------------
   Progress indicator (Pitch Quality)
   -----------------------------------------------------------------------
   Inject once; subsequent calls update.
   Markup inserted above currently visible step form.
   ----------------------------------------------------------------------- */
function ensureProgressBarContainer() {
  let bar = document.getElementById('gp-progress');
  if (bar) return bar;
  bar = document.createElement('div');
  bar.id = 'gp-progress';
  bar.className = 'gp-progress';
  bar.innerHTML = `
    <div class="gp-progress-label">Pitch Quality: <span id="gp-progress-pct">0%</span></div>
    <div class="gp-progress-bar"><div id="gp-progress-fill" class="gp-progress-fill" style="width:0%;"></div></div>
  `;
  // place at top of page body just under header OR top of step1?
  const hook = document.getElementById('gp-progress-hook') ||
               document.querySelector('.guest-portal-progress-hook') ||
               document.body.firstElementChild;
  (hook?.parentNode || document.body).insertBefore(bar, hook || document.body.firstChild);
  return bar;
}
function updateProgressBar(pct) {
  ensureProgressBarContainer();
  const pctClamped = Math.max(0, Math.min(100, Math.round(pct)));
  const pctEl  = document.getElementById('gp-progress-pct');
  const fillEl = document.getElementById('gp-progress-fill');
  if (pctEl)  pctEl.textContent = pctClamped + '%';
  if (fillEl) fillEl.style.width = pctClamped + '%';
  // color cue simple: >75 success, >40 warn, else base
  if (fillEl) {
    fillEl.classList.remove('gp-progress-green','gp-progress-yellow','gp-progress-red');
    if (pctClamped >= 75) fillEl.classList.add('gp-progress-green');
    else if (pctClamped >= 40) fillEl.classList.add('gp-progress-yellow');
    else fillEl.classList.add('gp-progress-red');
  }
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
   Completion scoring
   ======================================================================= */
function _hasValue(v){
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "object") {
    // for nested objects, consider "has any non-empty leaf"
    for (const k in v){
      if (_hasValue(v[k])) return true;
    }
    return false;
  }
  // numbers, booleans count as present
  return true;
}

/**
 * computeCompletionFromObj(guest) -> { pct, steps: {step1:{pct,weight}, ...}, fields:{fieldName:{pct,weight}} }
 *
 * pct is 0..100.
 * steps[].pct is 0..100 within that step; field weight applied.
 * A field counts 100% if _hasValue is true.
 */
function computeCompletionFromObj(guest) {
  const weights = getCompletionWeights();
  // gather step weights & sum
  const stepKeys = Object.keys(weights);
  let totalStepWeight = 0;
  for (const sk of stepKeys) totalStepWeight += Number(weights[sk].weight || 0);
  if (!totalStepWeight) totalStepWeight = 1; // avoid /0

  let totalScore = 0;
  const stepsOut = {};
  const fieldsOut = {};

  for (const sk of stepKeys) {
    const stepCfg = weights[sk];
    const stepWeight = Number(stepCfg.weight || 0);
    const fieldCfg = stepCfg.fields || {};

    // Step object mapping
    let stepObj;
    if (sk === "step1") {
      stepObj = guest;
    } else if (sk === "step2") {
      stepObj = guest?.evaluate;
    } else if (sk === "step3") {
      stepObj = guest?.solution;
    } else {
      // custom steps? Just look at top-level subobject
      stepObj = guest?.[sk];
    }

    // field internal total
    let stepFieldTotal = 0;
    let stepFieldScore = 0;

    for (const fk of Object.keys(fieldCfg)) {
      const fieldWeight = Number(fieldCfg[fk] || 0);
      stepFieldTotal += fieldWeight;

      // determine value path
      let val;
      if (sk === "step1") {
        if (fk === "custName") val = stepObj?.custName;
        else if (fk === "custPhone") val = stepObj?.custPhone;
        else val = stepObj?.[fk];
      } else if (sk === "step2") {
        if (fk === "serviceType") val = stepObj?.serviceType;
        else if (fk === "situation") val = stepObj?.situation;
        else if (fk === "carrierInfo") val = stepObj?.carrierInfo;
        else if (fk === "requirements") val = stepObj?.requirements;
        else val = stepObj?.[fk];
      } else if (sk === "step3") {
        if (fk === "solutionText") {
          // canonical solution text; your stored structure is {text,completedAt}
          val = stepObj?.text;
        } else {
          val = stepObj?.[fk];
        }
      } else {
        val = stepObj?.[fk];
      }

      const filled = _hasValue(val);
      if (filled) stepFieldScore += fieldWeight;

      fieldsOut[`${sk}.${fk}`] = {
        filled,
        weight: fieldWeight
      };
    }

    const stepPctWithin = stepFieldTotal ? (stepFieldScore / stepFieldTotal) : 0;
    const stepScore = stepPctWithin * stepWeight;

    stepsOut[sk] = {
      pct: stepPctWithin * 100,
      weight: stepWeight,
      filledWeight: stepFieldScore
    };

    totalScore += stepScore;
  }

  // scale to 100
  const pct = (totalScore / totalStepWeight) * 100;

  return { pct, steps: stepsOut, fields: fieldsOut };
}

/* Persist computed completion to DB */
async function writeCompletionPct(key, guestObj) {
  const comp = computeCompletionFromObj(guestObj || {});
  try {
    await db.ref(`guestinfo/${key}/completion`).set({
      pct: Math.round(comp.pct),
      steps: comp.steps,
      fields: comp.fields,
      updatedAt: Date.now()
    });
  } catch (err) {
    console.warn("guest-portal: completion write failed", err);
  }
  updateProgressBar(comp.pct);
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

  ensureProgressBarContainer();
  // Update progress bar with current record state
  updateProgressBar(computeCompletionFromObj(currentGuestObj).pct);

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
  ensureProgressBarContainer();
  updateProgressBar(0);
  show('step1Form');
});

/* =======================================================================
   STEP 1 Handler
   Capture basics (not required). Always create record if missing.
   ======================================================================= */
document.getElementById('step1Form')
  .addEventListener('submit', async e => {
    e.preventDefault();
    statusMsg('status1', '', '');

    const custName  = document.getElementById('custName').value.trim();
    const custPhone = document.getElementById('custPhone').value.trim();

    try {
      if (currentEntryKey) {
        // update existing Step 1 fields (blank allowed)
        await db.ref(`guestinfo/${currentEntryKey}`).update({
          custName,
          custPhone,
          updatedAt: Date.now()
        });
      } else {
        // create new guestinfo record (blanks allowed)
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

      statusMsg('status1','Saved.','success');

      // update completion
      await writeCompletionPct(currentEntryKey, currentGuestObj);

      // advance UI
      hide('step1Form');
      show('step2Form');
      injectPrefillSummary(custName, custPhone);
    } catch (err) {
      statusMsg('status1','Error: ' + err.message,'error');
    }
  });

/* =======================================================================
   STEP 2 Handler
   Save /evaluate & status "working" (even if blanks)
   ======================================================================= */
document.getElementById('step2Form')
  .addEventListener('submit', async e => {
    e.preventDefault();
    statusMsg('status2','', '');

    const serviceType  = document.getElementById('serviceType').value;
    const situation    = document.getElementById('situation').value.trim();
    const carrierInfo  = document.getElementById('evalCarrier').value.trim();
    const requirements = document.getElementById('evalRequirements').value.trim();

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

      statusMsg('status2','Saved.','success');

      // update completion
      await writeCompletionPct(currentEntryKey, currentGuestObj);

      hide('step2Form');
      show('step3Form');
    } catch (err) {
      statusMsg('status2','Error: ' + err.message,'error');
    }
  });

/* =======================================================================
   STEP 3 Handler
   Save /solution & status "proposal" (even if blank)
   ======================================================================= */
document.getElementById('step3Form')
  .addEventListener('submit', async e => {
    e.preventDefault();
    statusMsg('status3','', '');

    const solutionText = document.getElementById('solutionText').value.trim();
    if (!currentEntryKey) {
      statusMsg('status3','Missing guest record.','error');
      return;
    }

    try {
      const now = Date.now();
      const updates = {};
      updates[`guestinfo/${currentEntryKey}/solution`] = {
        text: solutionText,
        completedAt: now
      };
      updates[`guestinfo/${currentEntryKey}/status`]    = "proposal";
      updates[`guestinfo/${currentEntryKey}/updatedAt`] = now;
      await db.ref().update(updates);

      // local reflect
      if (!currentGuestObj) currentGuestObj = {};
      currentGuestObj.solution = {text:solutionText,completedAt:now};
      currentGuestObj.status   = "proposal";

      statusMsg('status3','Saved.','success');

      // update completion
      await writeCompletionPct(currentEntryKey, currentGuestObj);
    } catch (err) {
      statusMsg('status3','Error: ' + err.message,'error');
    }
  });

/* =======================================================================
   OPTIONAL: expose manual recompute (useful if edits outside portal)
   ======================================================================= */
window.gpRecomputeCompletion = async function(gid){
  const key = gid || currentEntryKey;
  if (!key) return;
  const snap = await db.ref(`guestinfo/${key}`).get();
  const data = snap.val() || {};
  currentGuestObj = data;
  await writeCompletionPct(key, data);
};

/* =======================================================================
   Minimal CSS injection (only if site CSS lacks gp-progress styles)
   You can move to static stylesheet; left inline for portability.
   ======================================================================= */
(function injectGpProgressCss(){
  if (document.getElementById('gp-progress-css')) return;
  const css = `
    .gp-progress{
      width:100%;
      margin:1rem auto 1.5rem;
      max-width:480px;
      text-align:center;
      font-family:inherit;
    }
    .gp-progress-label{margin-bottom:.25rem;font-weight:600;}
    .gp-progress-bar{
      width:100%;
      height:8px;
      border-radius:4px;
      background:rgba(255,255,255,.15);
      overflow:hidden;
      position:relative;
    }
    .gp-progress-fill{
      height:100%;
      width:0%;
      transition:width .25s;
      background:#82caff;
    }
    .gp-progress-fill.gp-progress-green{background:#00c853;}
    .gp-progress-fill.gp-progress-yellow{background:#ffb300;}
    .gp-progress-fill.gp-progress-red{background:#ff5252;}
  `;
  const tag = document.createElement('style');
  tag.id = 'gp-progress-css';
  tag.textContent = css;
  document.head.appendChild(tag);
})();