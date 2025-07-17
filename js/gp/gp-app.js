/* gp-app.js =================================================================
 * OSL Guest Portal main controller
 * ---------------------------------------------------------------------------
 * Decoupled UI step from status so reps can advance freely.
 * This rev adds:
 *   • Respect for ?uistart=step1|step2|step3 (dashboard hint).
 *   • Safer initial context load & autosave guards to prevent duplicate
 *     guestinfo records when opening an existing lead.
 *   • LocalStorage salvage: if page launched w/out gid but we still have a
 *     remembered last_guestinfo_key that exists in DB, we hydrate that instead
 *     of pushing a fresh record.
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
let currentGuestObj = null;   // normalized object
let currentGuestKey = null;   // guestinfo/<gid>
let seedEntryId     = null;   // guestEntries/<eid> if we arrived from kiosk only

/* track context + load readiness */
let _ctxType   = "new";       // "guestinfo" | "seed-entry" | "new"
let _ctxLoaded = false;       // flips true after loadContext completes

/* current UI step (user navigation wins; never auto-downgrade) */
const GP_STEPS = ["step1","step2","step3"];
let _uiStep    = "step1";

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

/* Choose initial UI step.
 * Pref order: explicit query uistart (validated) > status mapping > Step1 data.
 */
function pickStartStep(g, qsUi){
  if (GP_STEPS.includes(qsUi)) return qsUi;

  // escalate on status
  const stFromStatus = statusToStep(g?.status);
  if (stFromStatus === "step3") return "step3";

  // if we have basic Step1 data, start step2
  const hasStep1 = gpCore.hasVal(g?.custName) || gpCore.hasVal(g?.custPhone) || g?.prefilledStep1;
  if (hasStep1) return "step2";

  return "step1";
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

/* remember last opened guest locally (helps resume; reduces dupes) */
function rememberLastGuestKey(gid){
  try{ localStorage.setItem("last_guestinfo_key", gid || ""); }catch(_){}
}

/* ---------------------------------------------------------------------------
 * Build *guest* object from DOM
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
  if (!_ctxLoaded) return;   // don't autosave before we know context
  if (_idleTO) clearTimeout(_idleTO);
  _idleTO = setTimeout(commitAutosaveDebounced, AUTOSAVE_IDLE_MS);
}
function scheduleBlurAutosave(){
  if (!_ctxLoaded) return;
  commitAutosaveDebounced();
}
function commitAutosaveDebounced(){
  if (_idleTO){ clearTimeout(_idleTO); _idleTO=null; }
  if (_autosaveTO) clearTimeout(_autosaveTO);
  _autosaveTO = setTimeout(doAutosaveNow, AUTOSAVE_DEBOUNCE_MS);
}

/* Called after debounce ---------------------------------------------- */
async function doAutosaveNow(){
  if (!_ctxLoaded){
    console.warn("[gp-app] autosave skipped; context not loaded yet.");
    return;
  }

  _autosaveTO = null;

  const g = buildGuestFromDom();
  const uid = gpAuth.currentUser?.uid || null;
  const now = Date.now();

  /* create record if needed */
  if (!currentGuestKey){
    // Final guard: if we expected an existing guest (ctxType==="guestinfo")
    // but somehow lost the key, bail rather than create a dupe.
    if (_ctxType === "guestinfo"){
      console.warn("[gp-app] refusing to create new guest; expected existing gid.");
      return;
    }

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
    rememberLastGuestKey(currentGuestKey);
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
      rememberLastGuestKey(currentGuestKey);
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
window.gpRevertTo = revertTo;

/* ---------------------------------------------------------------------------
 * Sync UI from currentGuestObj
 * ------------------------------------------------------------------------ */
function syncUi(){
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

  maybeAdvanceUiStepFromStatus(g.status);
  gpUI.gotoStep(_uiStep);
}

/* ---------------------------------------------------------------------------
 * Context bootstrap
 * Order: explicit gid > entry > salvage localStorage > new
 * Returns ctxType string.
 * ------------------------------------------------------------------------ */
async function loadContext(){
  const gid     = qs("gid");
  const entry   = qs("entry");
  const qsStart = qs("uistart"); // optional step hint from dashboard

  // 1) explicit guestinfo key
  if (gid){
    try{
      const snap = await gpDb.ref(`guestinfo/${gid}`).get();
      const data = snap.val();
      if (data){
        currentGuestKey = gid;
        currentGuestObj = gpCore.normGuest(data);
        rememberLastGuestKey(gid);
        if (entry && !data?.source?.entryId){
          gpDb.ref(`guestinfo/${gid}/source`)
              .set({type:"guestForm",entryId:entry})
              .catch(()=>{});
        }
        _uiStep = pickStartStep(currentGuestObj, qsStart);
        _ctxType = "guestinfo";
        return _ctxType;
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
          prefilledStep1: !!(e.guestName || e.guestPhone),
          source: {type:"guestForm",entryId:entry}
        };
        currentGuestKey = null; // will create on first save
        _uiStep = pickStartStep(currentGuestObj, qsStart); // usually step2 if prefilled
        _ctxType = "seed-entry";
        return _ctxType;
      }
    }catch(err){
      console.error("Guest Portal: load entry error",err);
    }
  }

  // 3) salvage last_guestinfo_key if present (helps resume + prevents dupes)
  try{
    const lastKey = localStorage.getItem("last_guestinfo_key");
    if (lastKey){
      const snap = await gpDb.ref(`guestinfo/${lastKey}`).get();
      const data = snap.val();
      if (data){
        currentGuestKey = lastKey;
        currentGuestObj = gpCore.normGuest(data);
        _uiStep = pickStartStep(currentGuestObj, qsStart);
        _ctxType = "guestinfo";
        return _ctxType;
      }else{
        localStorage.removeItem("last_guestinfo_key");
      }
    }
  }catch(_ignore){}

  // 4) brand new
  currentGuestObj = { status:"new", evaluate:{}, solution:{} };
  currentGuestKey = null;
  seedEntryId     = null;
  _uiStep         = pickStartStep(currentGuestObj, qsStart); // step1
  _ctxType        = "new";
  return _ctxType;
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

  // Bind live events (only once) -> preview/autosave
  gpUI.bindLiveEvents({
    onInput: ()=>{
      if (!_ctxLoaded) return;
      const live = buildGuestFromDom();
      const comp = gpCore.computePitchFull(live);
      const savedPct = currentGuestObj ? gpCore.computePitchFull(currentGuestObj).pctFull : 0;
      const diff = Math.abs(comp.pctFull - savedPct);
      gpUI.setProgressPreview(diff>1 ? comp.pctFull : null);
      gpUI.updateNbqChips(live);
      scheduleIdleAutosave();
    },
    onBlur: scheduleBlurAutosave,
    // Optional nav callback if gpUI supports; keep UI state in sync:
    onNav: step=>{
      if (!GP_STEPS.includes(step)) return;
      _uiStep = step;
      gpUI.markStepActive(_uiStep);
      gpUI.gotoStep(_uiStep);
    }
  });

  // Load context + sync
  _ctxType = await loadContext();
  _ctxLoaded = true;  // allow autosaves
  syncUi();

  // If we *didn't* load an existing guestinfo, ensure we start on pickStart
  if (_ctxType !== "guestinfo"){
    _uiStep = pickStartStep(currentGuestObj);
    gpUI.markStepActive(_uiStep);
    gpUI.gotoStep(_uiStep);
  }
});

/* ---------------------------------------------------------------------------
 * Manual form submit fallbacks
 * ------------------------------------------------------------------------ */
function wireSubmitFallback(id){
  const frm = document.getElementById(id);
  if(!frm) return;
  frm.addEventListener("submit", async e=>{
    e.preventDefault();
    await doAutosaveNow();
    _uiStep = nextStep(_uiStep);
    gpUI.markStepActive(_uiStep);
    gpUI.gotoStep(_uiStep);
  });
}
wireSubmitFallback("step1Form");
wireSubmitFallback("step2Form");
wireSubmitFallback("step3Form"); // stays

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
  saveNow: doAutosaveNow,
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