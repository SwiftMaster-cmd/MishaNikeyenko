/* gp-app.js =================================================================
 * OSL Guest Portal main controller (NO AUTOSAVE VERSION)
 * ---------------------------------------------------------------------------
 * - Autosave removed: data persists ONLY on explicit form submit
 *   (Step buttons) or gpApp.saveNow() calls.
 * - Step state decoupled from status; dashboard can prefill & jump.
 * - Duplicate prevention: only push new record once; afterwards update.
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
let seedEntryId     = null;   // guestEntries/<eid> if we arrived from intake only

/* current UI step (user navigation wins; never auto-downgrade) */
const GP_STEPS = ["step1","step2","step3"];
let _uiStep    = "step1";

/* tunables */
const AUTO_STATUS_ESCALATE = true; // still escalate status when saving

/* ---------------------------------------------------------------------------
 * Small helpers
 * ------------------------------------------------------------------------ */
const stepRank = s => Math.max(0, GP_STEPS.indexOf(s));
function nextStep(s){
  const i = stepRank(s);
  return GP_STEPS[Math.min(i+1, GP_STEPS.length-1)] || "step3";
}

/* Map status -> *minimum* step that should be visible */
function statusToStep(status){
  switch((status||"").toLowerCase()){
    case "working":  return "step2";
    case "proposal":
    case "sold":     return "step3";
    default:         return "step1";
  }
}

/* Determine initial UI step w/ overrides for intake-prefill */
function initialUiStepForRecord(g, ctx){
  let st = statusToStep(g?.status || "new");
  // If we arrived from intake seed OR record flagged prefilledStep1, allow Step2 jump.
  const hasPrefill = !!(g?.prefilledStep1 || g?.custName || g?.custPhone);
  if ((ctx === "seed-entry" || hasPrefill) && stepRank("step2") > stepRank(st)){
    st = "step2";
  }
  return st;
}

/* Advance UI if status implies *later* step than user is on; never downgrade */
function maybeAdvanceUiStepFromStatus(status){
  const minStep = statusToStep(status);
  if (stepRank(minStep) > stepRank(_uiStep)){
    _uiStep = minStep;
    gpUI.markStepActive(_uiStep);
    gpUI.gotoStep(_uiStep);
  } else {
    gpUI.markStepActive(_uiStep);
  }
}

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
 * Save (explicit)  ----------------------------------------------------------
 * Call when user submits a step or presses Save.
 * Creates record if needed; else patches existing.
 * Writes completion immediately.
 * ------------------------------------------------------------------------ */
async function saveGuestNow(){
  const g   = buildGuestFromDom();
  const uid = gpAuth.currentUser?.uid || null;
  const now = Date.now();

  if (!currentGuestKey){
    // CREATE ---------------------------------------------------------
    const payload = {
      custName:    g.custName || "",
      custPhone:   g.custPhone || "",
      submittedAt: now,
      userUid:     uid,
      status:      gpCore.detectStatus(g) || "new",
      evaluate:    g.evaluate || {},
      solution:    gpCore.hasVal(g.solution?.text)
                     ? {text:g.solution.text,completedAt:now}
                     : null,
      source:      seedEntryId ? {type:"guestForm",entryId:seedEntryId} : null,
      prefilledStep1: !!(g.custName || g.custPhone) // remember we got Step1 data
    };
    try{
      const pushRef = await gpDb.ref("guestinfo").push(payload);
      currentGuestKey = pushRef.key;
    }catch(err){
      console.error("[gp-app] create guestinfo failed",err);
      gpUI.statusMsg("status1","Save error","error");
      gpUI.statusMsg("status2","Save error","error");
      gpUI.statusMsg("status3","Save error","error");
      return;
    }

    // link kiosk entry if present
    if (seedEntryId){
      try{
        await gpDb.ref(`guestEntries/${seedEntryId}`).update({
          guestinfoKey: currentGuestKey,
          consumedBy: uid,
          consumedAt: now
        });
      }catch(err){
        console.warn("[gp-app] link guestEntries→guestinfo failed",err);
      }
    }

    currentGuestObj = gpCore.normGuest(g);
  } else {
    // UPDATE ---------------------------------------------------------
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
    // maintain prefilledStep1 once true
    if (g.custName || g.custPhone){
      updates[`guestinfo/${currentGuestKey}/prefilledStep1`] = true;
    }

    try{
      await gpDb.ref().update(updates);
    }catch(err){
      console.error("[gp-app] update guestinfo failed",err);
      gpUI.statusMsg("status1","Save error","error");
      gpUI.statusMsg("status2","Save error","error");
      gpUI.statusMsg("status3","Save error","error");
      return;
    }

    currentGuestObj = gpCore.normGuest(g);
  }

  // persist completion immediately
  await writeCompletion(currentGuestKey, currentGuestObj);

  // user feedback
  gpUI.statusMsg("status1","Saved.","success");
  gpUI.statusMsg("status2","Saved.","success");
  gpUI.statusMsg("status3","Saved.","success");

  // remember last guest
  try{ localStorage.setItem("last_guestinfo_key", currentGuestKey||""); }catch(_){}

  // *** IMPORTANT: don't snap backwards! ***
  maybeAdvanceUiStepFromStatus(currentGuestObj.status);
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
    console.warn("[gp-app] completion write failed",err);
  }
  gpUI.setProgressSaved(comp.pctFull);
  gpUI.setProgressPreview(null);
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
    _uiStep = "step1";
    syncUi();
    await writeCompletion(currentGuestKey,currentGuestObj);
  }else if(step === "step2"){
    if(!confirm("Revert to Step 2? Solution will be cleared.")) return;
    await ref.update({solution:null,status:"working",updatedAt:now});
    delete currentGuestObj.solution;
    currentGuestObj.solution = {};
    currentGuestObj.status = "working";
    _uiStep = "step2";
    syncUi();
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

  // Don't override user step; only bump forward if status demands it.
  maybeAdvanceUiStepFromStatus(g.status);
  gpUI.gotoStep(_uiStep);
}

/* ---------------------------------------------------------------------------
 * Context bootstrap (gid > entry > new)
 * Returns {ctx:"guestinfo"|"seed-entry"|"new"}
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
          gpDb.ref(`guestinfo/${gid}/source`)
              .set({type:"guestForm",entryId:entry})
              .catch(()=>{});
        }
        _uiStep = initialUiStepForRecord(currentGuestObj, "guestinfo");
        return {ctx:"guestinfo"};
      }
    }catch(err){
      console.error("Guest Portal: load gid error",err);
    }
  }

  // 2) intake seed (no linked guestinfo yet)
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
          prefilledStep1: !!(e.guestName || e.guestPhone),
          source: {type:"guestForm",entryId:entry}
        };
        currentGuestKey = null; // will create on first explicit save
        _uiStep = initialUiStepForRecord(currentGuestObj, "seed-entry");
        return {ctx:"seed-entry"};
      }
    }catch(err){
      console.error("Guest Portal: load entry error",err);
    }
  }

  // 3) brand new
  currentGuestObj = { status:"new", evaluate:{}, solution:{} };
  currentGuestKey = null;
  seedEntryId     = null;
  _uiStep         = "step1";
  return {ctx:"new"};
}

/* ---------------------------------------------------------------------------
 * Auth
 * ------------------------------------------------------------------------ */
gpAuth.onAuthStateChanged(async user=>{
  if(!user){
    window.location.href = "../index.html";
    return;
  }

  // UI chrome immediately
  gpUI.ensureProgressBar();
  gpUI.ensureStepNav();
  gpUI.ensureEvalExtrasWrap();
  gpUI.ensureRevertLinks();

  // Bind live events (ONLY PREVIEW -- NO AUTOSAVE)
  gpUI.bindLiveEvents({
    onInput: ()=>{
      const live = buildGuestFromDom();
      const comp = gpCore.computePitchFull(live);
      const savedPct = currentGuestObj ? gpCore.computePitchFull(currentGuestObj).pctFull : 0;
      const diff = Math.abs(comp.pctFull - savedPct);
      gpUI.setProgressPreview(diff>1 ? comp.pctFull : null);
      gpUI.updateNbqChips(live);
    },
    // we ignore blur (no autosave)
    onBlur: null,
    onNav: step=>{
      if (!GP_STEPS.includes(step)) return;
      _uiStep = step;
      gpUI.markStepActive(_uiStep);
      gpUI.gotoStep(_uiStep);
    }
  });

  // Load context + sync
  const {ctx} = await loadContext();
  syncUi();

  // If we *didn't* load an existing guestinfo, ensure step1 or initial override already set.
  if (ctx !== "guestinfo"){
    gpUI.markStepActive(_uiStep);
    gpUI.gotoStep(_uiStep);
  }
});

/* ---------------------------------------------------------------------------
 * Manual form submit handlers (primary persistence path)
 * Each step's <form> should have id step1Form/step2Form/step3Form.
 * On submit we save, then advance to next step (except step3 stays).
 * ------------------------------------------------------------------------ */
function wireSubmitHandler(id, advance=true){
  const frm = document.getElementById(id);
  if(!frm) return;
  frm.addEventListener("submit", async e=>{
    e.preventDefault();
    await saveGuestNow();
    if (advance){
      _uiStep = nextStep(_uiStep);
      gpUI.markStepActive(_uiStep);
      gpUI.gotoStep(_uiStep);
    }else{
      gpUI.markStepActive(_uiStep);
      gpUI.gotoStep(_uiStep);
    }
  });
}
wireSubmitHandler("step1Form", true);
wireSubmitHandler("step2Form", true);
wireSubmitHandler("step3Form", false); // stays on step3

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
  get uiStep(){ return _uiStep; },
  saveNow: saveGuestNow,
  writeCompletion,
  revertTo,
  syncUi,
  buildGuestFromDom,
  gotoStep(step){
    if (!GP_STEPS.includes(step)) return;
    _uiStep = step;
    gpUI.markStepActive(_uiStep);
    gpUI.gotoStep(_uiStep);
  }
};