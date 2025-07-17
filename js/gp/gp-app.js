/* gp-app.js =================================================================
 * OSL Guest Portal main controller (NO AUTOSAVE VERSION, dashboard reopen fix)
 * ---------------------------------------------------------------------------
 * - Autosave removed: data persists ONLY on explicit form submit or gpApp.saveNow().
 * - Robust param parsing: supports ?... and #... fragments; reads gid, entry, uistart.
 * - Honors dashboard uistart hint (step1|step2|step3).
 * - Prefill Step1 -> start Step2 when appropriate (even if status=new).
 * - Duplicate prevention: only push new record once; afterwards update.
 * - Remembers last opened gid in localStorage (fallback when params missing).
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

/* debug helpers ----------------------------------------------------- */
const DBG = ()=>!!window.GP_DEBUG;
function dlog(...args){ if (DBG()) console.log("[gp-app]",...args); }

/* ---------------------------------------------------------------------------
 * Param parsing (search + hash) ---------------------------------------------
 * Supports links like:
 *   guestinfo.html?gid=...&uistart=step2
 *   guestinfo.html#gid=...&entry=...   (hash only)
 *   guestinfo.html?#gid=...            (mixed)
 * ------------------------------------------------------------------------ */
function parseAllParams(){
  const out = {};
  const push = kv=>{
    if(!kv) return;
    const i = kv.indexOf("=");
    if(i<0) return;
    const k = decodeURIComponent(kv.slice(0,i));
    const v = decodeURIComponent(kv.slice(i+1));
    if(k) out[k]=v;
  };
  let s = window.location.search;
  if (s && s.length>1){
    s.slice(1).split("&").forEach(push);
  }
  let h = window.location.hash;
  if (h){
    h = h.replace(/^#/,"");
    if (h.startsWith("?")) h = h.slice(1);
    h.split("&").forEach(push);
  }
  return out;
}
function qs(name){
  const p = parseAllParams();
  return p[name] ?? null;
}

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
function hasPrefilledStep1(g){
  return !!(g?.prefilledStep1 || g?.custName || g?.custPhone);
}

/* Determine initial UI step.
 * Priority: explicit uistart param > statusToStep > prefill bump to step2 */
function initialUiStepForRecord(g, ctx, uistartParam){
  if (GP_STEPS.includes(uistartParam)) return uistartParam;
  let st = statusToStep(g?.status || "new");
  if ((ctx === "seed-entry" || hasPrefilledStep1(g)) && stepRank("step2") > stepRank(st)){
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

/* remember last guest for resume convenience */
function rememberLastGuestKey(gid){
  try{ localStorage.setItem("last_guestinfo_key", gid || ""); }catch(_){}
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

  // mark Step1 prefill if we have customer info
  if (base.custName || base.custPhone) base.prefilledStep1 = true;

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
      prefilledStep1: hasPrefilledStep1(g)
    };
    try{
      const pushRef = await gpDb.ref("guestinfo").push(payload);
      currentGuestKey = pushRef.key;
      dlog("created guestinfo",currentGuestKey);
    }catch(err){
      console.error("[gp-app] create guestinfo failed",err);
      gpUI.statusMsg("status1","Save error","error");
      gpUI.statusMsg("status2","Save error","error");
      gpUI.statusMsg("status3","Save error","error");
      return;
    }

    // link intake entry if present
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
    if (hasPrefilledStep1(g)) updates[`guestinfo/${currentGuestKey}/prefilledStep1`] = true;

    try{
      await gpDb.ref().update(updates);
      dlog("updated guestinfo",currentGuestKey);
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
  rememberLastGuestKey(currentGuestKey);

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
 * Context bootstrap (gid > entry > last_saved > new)
 * Returns {ctx:"guestinfo"|"seed-entry"|"resume"|"new"}
 * ------------------------------------------------------------------------ */
async function loadContext(){
  const gid     = qs("gid");
  const entry   = qs("entry");
  const uiStart = qs("uistart");
  dlog("params",{gid,entry,uiStart});

  // 1) explicit guestinfo key
  if (gid){
    try{
      const snap = await gpDb.ref(`guestinfo/${gid}`).get();
      const data = snap.val();
      if (data){
        currentGuestKey = gid;
        currentGuestObj = gpCore.normGuest(data);
        rememberLastGuestKey(gid);
        // backfill source if entry param present
        if (entry && !data?.source?.entryId){
          gpDb.ref(`guestinfo/${gid}/source`)
              .set({type:"guestForm",entryId:entry})
              .catch(()=>{});
        }
        _uiStep = initialUiStepForRecord(currentGuestObj, "guestinfo", uiStart);
        dlog("loaded guestinfo",gid,"start",_uiStep);
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
        _uiStep = initialUiStepForRecord(currentGuestObj, "seed-entry", uiStart);
        dlog("seed-entry start",_uiStep);
        return {ctx:"seed-entry"};
      }
    }catch(err){
      console.error("Guest Portal: load entry error",err);
    }
  }

  // 3) fallback resume from last opened gid (if present & allowed)
  try{
    const lastKey = localStorage.getItem("last_guestinfo_key");
    if (lastKey){
      const snap = await gpDb.ref(`guestinfo/${lastKey}`).get();
      const data = snap.val();
      if (data){
        currentGuestKey = lastKey;
        currentGuestObj = gpCore.normGuest(data);
        _uiStep = initialUiStepForRecord(currentGuestObj, "resume", uiStart);
        dlog("resumed last guest",lastKey,"start",_uiStep);
        return {ctx:"resume"};
      }else{
        localStorage.removeItem("last_guestinfo_key");
      }
    }
  }catch(_){}

  // 4) brand new
  currentGuestObj = { status:"new", evaluate:{}, solution:{} };
  currentGuestKey = null;
  seedEntryId     = null;
  _uiStep         = initialUiStepForRecord(currentGuestObj, "new", uiStart);
  dlog("new lead start",_uiStep);
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

  // If we *didn't* load an existing guestinfo, ensure _uiStep already set.
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
    }
    gpUI.markStepActive(_uiStep);
    gpUI.gotoStep(_uiStep);
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