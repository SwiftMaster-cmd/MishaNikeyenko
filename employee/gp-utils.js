/* gp-app.js =================================================================
 * OSL Guest Portal main controller
 * ---------------------------------------------------------------------------
 * Responsibilities
 *  • Initialize Firebase (guarded; reuse existing app if present)
 *  • Determine context: ?gid (existing), ?entry (seed from kiosk), or new
 *  • Normalize + push data into DOM (via gpUI) and keep local state
 *  • Live preview & autosave (idle + blur debounces)
 *  • Status escalation (optional)
 *  • Link kiosk intake record → guestinfo on first save
 *  • Write /completion scoring snapshot
 *  • Revert-to-step actions
 *  • Expose small API under window.gpApp
 * ---------------------------------------------------------------------------
 * DEPENDS ON:
 *    - gp-core.js (scoring + data utils)
 *    - gp-ui.js   (DOM helpers, progress bar, step nav, NBQ, etc.)
 * ------------------------------------------------------------------------ */

/* ---------------------------------------------------------------------------
 * Firebase init (guarded)
 * ------------------------------------------------------------------------ */
(function initFirebase(){
  const cfg = window.GP_FIREBASE_CONFIG || {
    apiKey: "AIzaSyD9fILTNJQ0wsPftUsPkdLrhRGV9dslMzE",
    authDomain: "osls-644fd.firebaseapp.com",
    databaseURL: "https://osls-644fd-default-rtdb.firebaseio.com",
    projectId: "osls-644fd",
    storageBucket: "osls-644fd.appspot.com",
    messagingSenderId: "798578046321",
    appId: "1:798578046321:web:8758776701786a2fccf2d0",
    measurementId: "G-9HWXNSBE1T"
  };
  if (!firebase.apps.length) firebase.initializeApp(cfg);
})();

const gpDb   = firebase.database();
const gpAuth = firebase.auth();

/* ---------------------------------------------------------------------------
 * Local state
 * ------------------------------------------------------------------------ */
let currentGuestObj = null;   // normalized
let currentGuestKey = null;   // guestinfo/<gid>
let seedEntryId     = null;   // guestEntries/<eid> if we arrived from kiosk only

/* timers */
let _idleTO        = null;
let _autosaveTO    = null;
let _completionTO  = null;

/* tunables */
const AUTO_STATUS_ESCALATE   = true;
const AUTOSAVE_DEBOUNCE_MS   = 600;
const AUTOSAVE_IDLE_MS       = 3000;
const COMPLETION_DEBOUNCE_MS = 900;

/* ---------------------------------------------------------------------------
 * URL helpers
 * ------------------------------------------------------------------------ */
function qs(name){
  return new URLSearchParams(window.location.search).get(name);
}

/* ---------------------------------------------------------------------------
 * Build *guest* object from DOM (using gpUI.readDomFields())
 * - merges into a *copy* of currentGuestObj to preserve unmodeled keys
 * ------------------------------------------------------------------------ */
function buildGuestFromDom(){
  const raw = gpUI.readDomFields();
  const base = currentGuestObj
    ? JSON.parse(JSON.stringify(currentGuestObj))
    : { status:"new", evaluate:{}, solution:{} };

  base.custName  = raw.custName  || "";
  base.custPhone = raw.custPhone || "";

  base.evaluate = base.evaluate || {};
  base.evaluate.currentCarrier = raw.currentCarrier || "";
  base.evaluate.numLines       = raw.numLines;
  base.evaluate.coverageZip    = raw.coverageZip || "";
  base.evaluate.deviceStatus   = raw.deviceStatus || "";
  base.evaluate.finPath        = raw.finPath || "";
  base.evaluate.billPain       = raw.billPain || "";
  base.evaluate.dataNeed       = raw.dataNeed || "";
  base.evaluate.hotspotNeed    = raw.hotspotNeed;
  base.evaluate.intlNeed       = raw.intlNeed;
  base.evaluate.serviceType    = raw.serviceType || "";
  base.evaluate.situation      = raw.situation || "";
  base.evaluate.carrierInfo    = raw.carrierInfo || "";
  base.evaluate.requirements   = raw.requirements || "";

  if (!base.solution) base.solution = {};
  base.solution.text = raw.solutionText || "";

  // escalate / preserve status
  if (AUTO_STATUS_ESCALATE){
    base.status = gpCore.detectStatus(base);
  } else {
    base.status = currentGuestObj?.status || gpCore.detectStatus(base);
  }
  return base;
}

/* ---------------------------------------------------------------------------
 * AUTOSAVE orchestration
 * ------------------------------------------------------------------------ */
function scheduleIdleAutosave(){
  if (_idleTO) clearTimeout(_idleTO);
  _idleTO = setTimeout(commitAutosaveDebounced, AUTOSAVE_IDLE_MS);
}
function scheduleBlurAutosave(){
  commitAutosaveDebounced(); // faster path
}
function commitAutosaveDebounced(){
  if (_idleTO){ clearTimeout(_idleTO); _idleTO=null; }
  if (_autosaveTO) clearTimeout(_autosaveTO);
  _autosaveTO = setTimeout(doAutosaveNow, AUTOSAVE_DEBOUNCE_MS);
}

/* Called after debounce ---------------------------------------------- */
async function doAutosaveNow(){
  _autosaveTO = null;

  const g = buildGuestFromDom();
  const uid = gpAuth.currentUser?.uid || null;
  const now = Date.now();

  /* create record if needed */
  if (!currentGuestKey){
    const pushRef = await gpDb.ref("guestinfo").push({
      custName:    g.custName || "",
      custPhone:   g.custPhone || "",
      submittedAt: now,
      userUid:     uid,
      status:      gpCore.detectStatus(g) || "new",
      evaluate:    g.evaluate || {},
      solution:    gpCore.hasVal(g.solution?.text)
                     ? {text:g.solution.text,completedAt:now}
                     : null,
      source:      seedEntryId ? {type:"guestForm",entryId:seedEntryId} : null
    });
    currentGuestKey = pushRef.key;
    currentGuestObj = gpCore.normGuest(g);
    gpUI.statusMsg("status1","Saved.","success");
    gpUI.statusMsg("status2","Saved.","success");
    gpUI.statusMsg("status3","Saved.","success");

    /* link kiosk entry if present */
    if (seedEntryId){
      try{
        await gpDb.ref(`guestEntries/${seedEntryId}`).update({
          guestinfoKey: currentGuestKey,
          consumedBy: uid,
          consumedAt: now
        });
      }catch(err){
        console.warn("Link guestEntries→guestinfo failed",err);
      }
    }
  } else {
    /* patch existing */
    const updates = {};
    updates[`guestinfo/${currentGuestKey}/custName`]  = g.custName || "";
    updates[`guestinfo/${currentGuestKey}/custPhone`] = g.custPhone || "";
    updates[`guestinfo/${currentGuestKey}/evaluate`]  = g.evaluate || {};
    if (gpCore.hasVal(g.solution?.text)){
      updates[`guestinfo/${currentGuestKey}/solution`] =
        { text:g.solution.text,
          completedAt: currentGuestObj?.solution?.completedAt || now };
    } else {
      updates[`guestinfo/${currentGuestKey}/solution`] = null;
    }
    updates[`guestinfo/${currentGuestKey}/status`]    = gpCore.detectStatus(g);
    updates[`guestinfo/${currentGuestKey}/updatedAt`] = now;

    try{
      await gpDb.ref().update(updates);
      gpUI.statusMsg("status1","Saved.","success");
      gpUI.statusMsg("status2","Saved.","success");
      gpUI.statusMsg("status3","Saved.","success");
    }catch(err){
      console.warn("Autosave update failed",err);
      gpUI.statusMsg("status1","Autosave error","error");
      gpUI.statusMsg("status2","Autosave error","error");
      gpUI.statusMsg("status3","Autosave error","error");
    }
    currentGuestObj = gpCore.normGuest(g);
  }

  // update progress + NBQ
  const comp = gpCore.computePitchFull(currentGuestObj);
  gpUI.setProgressSaved(comp.pctFull);
  gpUI.setProgressPreview(null);
  gpUI.updateNbqChips(currentGuestObj);

  // schedule /completion write
  if (_completionTO) clearTimeout(_completionTO);
  _completionTO = setTimeout(()=>writeCompletion(currentGuestKey,currentGuestObj),
                             COMPLETION_DEBOUNCE_MS);

  // adjust step nav highlight
  const st = gpCore.detectStatus(currentGuestObj);
  gpUI.markStepActive(st==="new"?"step1":(st==="working"?"step2":"step3"));
}

/* ---------------------------------------------------------------------------
 * /completion writer
 * ------------------------------------------------------------------------ */
async function writeCompletion(gid, g){
  if (!gid) return;
  const comp = gpCore.computePitchFull(g);
  try{
    await gpDb.ref(`guestinfo/${gid}/completion`).set({
      pct: comp.pctFull,
      steps: comp.steps,
      fields: comp.fields,
      updatedAt: Date.now()
    });
  }catch(err){
    console.warn("completion write failed",err);
  }
  gpUI.setProgressPreview(null);
  gpUI.setProgressSaved(comp.pctFull);
  gpUI.updateNbqChips(g);
}

/* ---------------------------------------------------------------------------
 * Revert actions
 * ------------------------------------------------------------------------ */
async function revertTo(step){
  if(!currentGuestKey) return;
  const now = Date.now();
  const ref = gpDb.ref(`guestinfo/${currentGuestKey}`);

  if (step === "step1"){
    if(!confirm("Revert to Step 1? Evaluation & Solution will be cleared.")) return;
    await ref.update({evaluate:null,solution:null,status:"new",updatedAt:now});
    currentGuestObj.evaluate = {};
    delete currentGuestObj.solution;
    currentGuestObj.status = "new";
    syncUi();
    gpUI.gotoStep("step1");
    gpUI.setProgressPreview(null);
    await writeCompletion(currentGuestKey,currentGuestObj);
  }else if(step === "step2"){
    if(!confirm("Revert to Step 2? Solution will be cleared.")) return;
    await ref.update({solution:null,status:"working",updatedAt:now});
    delete currentGuestObj.solution;
    currentGuestObj.solution = {};
    currentGuestObj.status = "working";
    syncUi();
    gpUI.gotoStep("step2");
    gpUI.setProgressPreview(null);
    await writeCompletion(currentGuestKey,currentGuestObj);
  }
}
window.gpRevertTo = revertTo; // for gpUI revert link hooks

/* ---------------------------------------------------------------------------
 * Sync UI from currentGuestObj
 * ------------------------------------------------------------------------ */
function syncUi(){
  // ensure UI chrome
  gpUI.ensureProgressBar();
  gpUI.ensureStepNav();
  gpUI.ensureEvalExtrasWrap();
  gpUI.ensureRevertLinks();

  const g = currentGuestObj || {};
  gpUI.writeDomFields(g);
  gpUI.injectPrefillSummary(g.custName, g.custPhone);

  const comp = gpCore.computePitchFull(g);
  gpUI.setProgressSaved(comp.pctFull);
  gpUI.setProgressPreview(null);
  gpUI.updateNbqChips(g);

  const s = gpCore.detectStatus(g);
  gpUI.markStepActive(s==="new"?"step1":(s==="working"?"step2":"step3"));
  gpUI.gotoStep(s==="new"?"step1":(s==="working"?"step2":"step3"));
}

/* ---------------------------------------------------------------------------
 * Context bootstrap (gid > entry > new)
 * Returns one of: "guestinfo" | "seed-entry" | "new"
 * ------------------------------------------------------------------------ */
async function loadContext(){
  const gid   = qs("gid");
  const entry = qs("entry");

  // 1) explicit guestinfo key
  if (gid){
    try{
      const snap = await gpDb.ref(`guestinfo/${gid}`).get();
      const data = snap.val();
      if (data){
        currentGuestKey = gid;
        currentGuestObj = gpCore.normGuest(data);
        // backfill source if entry param present
        if (entry && !data?.source?.entryId){
          gpDb.ref(`guestinfo/${gid}/source`).set({type:"guestForm",entryId:entry}).catch(()=>{});
        }
        return "guestinfo";
      }
    }catch(err){
      console.error("Guest Portal: load gid error",err);
    }
  }

  // 2) kiosk entry seed
  if (entry){
    try{
      const esnap = await gpDb.ref(`guestEntries/${entry}`).get();
      const e = esnap.val();
      if (e){
        seedEntryId = entry;
        currentGuestObj = {
          status: "new",
          custName:  e.guestName  || "",
          custPhone: e.guestPhone || "",
          submittedAt: e.timestamp || Date.now(),
          userUid: gpAuth.currentUser?.uid || null,
          evaluate: {},
          solution: {},
          source: {type:"guestForm",entryId:entry}
        };
        return "seed-entry";
      }
    }catch(err){
      console.error("Guest Portal: load entry error",err);
    }
  }

  // 3) brand new
  currentGuestObj = { status:"new", evaluate:{}, solution:{} };
  return "new";
}

/* ---------------------------------------------------------------------------
 * Auth
 * ------------------------------------------------------------------------ */
gpAuth.onAuthStateChanged(async user=>{
  if(!user){
    window.location.href = "../login.html";
    return;
  }

  // UI chrome immediately
  gpUI.ensureProgressBar();
  gpUI.ensureStepNav();
  gpUI.ensureEvalExtrasWrap();
  gpUI.ensureRevertLinks();

  // Bind live events (only once) -> preview/autosave
  gpUI.bindLiveEvents({
    onInput: ()=>{
      const live = buildGuestFromDom();
      const comp = gpCore.computePitchFull(live);
      const savedPct = currentGuestObj ? gpCore.computePitchFull(currentGuestObj).pctFull : 0;
      const diff = Math.abs(comp.pctFull - savedPct);
      gpUI.setProgressPreview(diff>1 ? comp.pctFull : null);
      gpUI.updateNbqChips(live);
      scheduleIdleAutosave();
    },
    onBlur: scheduleBlurAutosave
  });

  // Load context + sync
  const ctx = await loadContext();
  syncUi();

  // If we *didn't* load an existing guestinfo, start at step1 explicitly
  if (ctx !== "guestinfo"){
    gpUI.gotoStep("step1");
  }
});

/* ---------------------------------------------------------------------------
 * Manual form submit fallbacks
 * (Autosave should normally have already created/updated.)
 * ------------------------------------------------------------------------ */
function wireSubmitFallback(id, nextStep){
  const frm = document.getElementById(id);
  if(!frm) return;
  frm.addEventListener("submit", async e=>{
    e.preventDefault();
    await doAutosaveNow();
    gpUI.gotoStep(nextStep);
  });
}
wireSubmitFallback("step1Form","step2");
wireSubmitFallback("step2Form","step3");
wireSubmitFallback("step3Form","step3"); // stays

/* ---------------------------------------------------------------------------
 * Manual recompute / debug
 * ------------------------------------------------------------------------ */
async function gpRecomputeCompletion(gid){
  const key = gid || currentGuestKey;
  if(!key) return;
  const snap = await gpDb.ref(`guestinfo/${key}`).get();
  const data = snap.val() || {};
  currentGuestObj = gpCore.normGuest(data);
  await writeCompletion(key, currentGuestObj);
}
window.gpRecomputeCompletion = gpRecomputeCompletion;

/* ---------------------------------------------------------------------------
 * Public API (optional)
 * ------------------------------------------------------------------------ */
window.gpApp = {
  get guestKey(){ return currentGuestKey; },
  get guest(){ return currentGuestObj; },
  saveNow: doAutosaveNow,
  writeCompletion,
  revertTo,
  syncUi,
  buildGuestFromDom
};