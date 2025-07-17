/* gp-app.js =================================================================
 * OSL Guest Portal main controller (NO AUTOSAVE + dashboard reopen + handoff)
 * ---------------------------------------------------------------------------
 * Data saves ONLY on explicit submit / gpApp.saveNow().
 * Robust param parsing (? + #). Honors dashboard uistart + session handoff.
 * Prefilled Step1 bumps to Step2 even if status=new. No duplicate pushes.
 * Remembers last gid in localStorage for resume.
 * ======================================================================== */

;(function(){

/* ------------------------------------------------------------------ Firebase */
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

/* ------------------------------------------------------------- Local state */
let currentGuestObj = null;           // working copy (normalized)
let currentGuestKey = null;           // guestinfo/<gid>
let seedEntryId     = null;           // guestEntries/<eid> (if arrival via intake)
let _handoffPayload = undefined;      // consumed from gp-handoff (once)

/* UI step ------------------------------------------------------------------ */
const GP_STEPS = ["step1","step2","step3"];
let _uiStep = "step1";

/* Tunables ----------------------------------------------------------------- */
const AUTO_STATUS_ESCALATE = true;    // detectStatus() on save

/* Debug -------------------------------------------------------------------- */
const DBG = ()=>!!window.GP_DEBUG;
function dlog(...a){ if (DBG()) console.log("[gp-app]",...a); }

/* ----------------------------------------------------------- gpCore safe shim */
const gpCore = window.gpCore || {
  detectStatus(g){
    if (!g) return "new";
    if (g.sale) return "sold";
    if (g.solution && (g.solution.text || g.solution.completedAt)) return "proposal";
    if (g.evaluate && Object.keys(g.evaluate).length) return "working";
    return "new";
  },
  computePitchFull(g){ return {pctFull:0,steps:{},fields:{}}; },
  hasVal(v){ return v!=null && v!==""; },
  normGuest(g){ return g||{}; }
};
gpCore.normGuest = gpCore.normGuest || gpCore.normalize || (g=>g||{});

/* --------------------------------------------------------- gp-handoff integration
 * window.gpHandoff.consumePrefill(): {gid?,entryId?,uistart?,custName?,custPhone?,statusHint?,timestamp?}
 * Consumed ONCE then cleared by gp-handoff.js.
 */
function consumeHandoffOnce(){
  if (_handoffPayload !== undefined) return _handoffPayload || null;
  try {
    _handoffPayload = (window.gpHandoff && typeof window.gpHandoff.consumePrefill==="function")
      ? window.gpHandoff.consumePrefill()
      : null;
    if (_handoffPayload) dlog("handoff payload", _handoffPayload);
  } catch(err){
    console.warn("[gp-app] gpHandoff error:",err);
    _handoffPayload = null;
  }
  return _handoffPayload;
}

/* -------------------------------------------------------------- Param parsing */
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
  const s = window.location.search;
  if (s && s.length>1) s.slice(1).split("&").forEach(push);
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

/* ----------------------------------------------------------------- Helpers */
const stepRank = s => Math.max(0, GP_STEPS.indexOf(s));
function nextStep(s){ return GP_STEPS[Math.min(stepRank(s)+1, GP_STEPS.length-1)] || "step3"; }
function statusToStep(status){
  switch((status||"").toLowerCase()){
    case "working": return "step2";
    case "proposal":
    case "sold":    return "step3";
    default:        return "step1";
  }
}
function hasPrefilledStep1(g){ return !!(g?.prefilledStep1 || g?.custName || g?.custPhone); }

/* Determine initial UI step.
 * Priority: explicit uistart > statusToStep > prefill bump (seed-entry|handoff or hasPrefilledStep1).
 */
function initialUiStepForRecord(g, ctx, uistartParam){
  if (GP_STEPS.includes(uistartParam)) return uistartParam;
  let st = statusToStep(g?.status || "new");
  if ((ctx==="seed-entry" || ctx==="handoff" || hasPrefilledStep1(g)) &&
      stepRank("step2") > stepRank(st)){
    st = "step2";
  }
  return st;
}

/* Advance (never back) based on status */
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

/* Remember last gid */
function rememberLastGuestKey(gid){
  try{ localStorage.setItem("last_guestinfo_key", gid||""); }catch(_){}
}

/* ----------------------------------------------------------- Build from DOM */
function buildGuestFromDom(){
  const raw = gpUI.readDomFields();
  const base = currentGuestObj
    ? JSON.parse(JSON.stringify(currentGuestObj))
    : {status:"new",evaluate:{},solution:{}};

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

  base.status = AUTO_STATUS_ESCALATE
    ? gpCore.detectStatus(base)
    : (currentGuestObj?.status || gpCore.detectStatus(base));

  if (base.custName || base.custPhone) base.prefilledStep1 = true;
  return base;
}

/* ---------------------------------------------------- Merge handoff payload */
function applyHandoffPrefill(target, payload){
  if (!payload || !target) return target;
  let changed = false;

  if (!target.custName && payload.custName){ target.custName = payload.custName; changed=true; }
  if (!target.custPhone && payload.custPhone){ target.custPhone = payload.custPhone; changed=true; }

  if (payload.statusHint && (!target.status || target.status==="new")){
    target.status = payload.statusHint;
    changed=true;
  }

  if (payload.entryId && !(target.source && target.source.entryId)){
    target.source = {type:"guestForm",entryId:payload.entryId};
    changed=true;
  }

  if (changed) target.prefilledStep1 = hasPrefilledStep1(target);
  return target;
}

/* -------------------------------------------------------------------- Save */
async function saveGuestNow(){
  const g   = buildGuestFromDom();
  const uid = gpAuth.currentUser?.uid || null;
  const now = Date.now();

  if (!currentGuestKey){
    /* CREATE ------------------------------------------------------ */
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
      source:      seedEntryId
                     ? {type:"guestForm",entryId:seedEntryId}
                     : (currentGuestObj?.source||null) || null,
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

    /* link intake entry if present */
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
    /* UPDATE ------------------------------------------------------ */
    const updates = {};
    updates[`guestinfo/${currentGuestKey}/custName`]  = g.custName || "";
    updates[`guestinfo/${currentGuestKey}/custPhone`] = g.custPhone || "";
    updates[`guestinfo/${currentGuestKey}/evaluate`]  = g.evaluate || {};
    if (gpCore.hasVal(g.solution?.text)){
      updates[`guestinfo/${currentGuestKey}/solution`] =
        {text:g.solution.text,completedAt: currentGuestObj?.solution?.completedAt || now};
    } else {
      updates[`guestinfo/${currentGuestKey}/solution`] = null;
    }
    updates[`guestinfo/${currentGuestKey}/status`]    = gpCore.detectStatus(g);
    updates[`guestinfo/${currentGuestKey}/updatedAt`] = now;
    if (hasPrefilledStep1(g)) updates[`guestinfo/${currentGuestKey}/prefilledStep1`] = true;

    /* source backfill */
    if (seedEntryId && !(currentGuestObj?.source && currentGuestObj.source.entryId)){
      updates[`guestinfo/${currentGuestKey}/source`] = {type:"guestForm",entryId:seedEntryId};
    } else if (currentGuestObj?.source){
      updates[`guestinfo/${currentGuestKey}/source`] = currentGuestObj.source;
    }

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

  await writeCompletion(currentGuestKey, currentGuestObj);

  gpUI.statusMsg("status1","Saved.","success");
  gpUI.statusMsg("status2","Saved.","success");
  gpUI.statusMsg("status3","Saved.","success");

  rememberLastGuestKey(currentGuestKey);
  maybeAdvanceUiStepFromStatus(currentGuestObj.status);
}

/* ----------------------------------------------------------- Completion write */
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

/* -------------------------------------------------------------------- Revert */
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

/* ---------------------------------------------------------------------- sync */
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

/* ------------------------------------------------------------------ bootstrap
 * Context precedence:
 *   1) ?gid=... param
 *   2) ?entry=... param
 *   3) gp-handoff w/gid
 *   4) gp-handoff Step1 only
 *   5) last_guestinfo_key localStorage
 *   6) brand new
 */
async function loadContext(){
  const gid     = qs("gid");
  const entry   = qs("entry");
  const uiStart = qs("uistart");
  const handoff = consumeHandoffOnce();
  dlog("params",{gid,entry,uiStart},"handoff",handoff);

  /* 1) explicit gid param ----------------------------------------- */
  if (gid){
    try{
      const snap = await gpDb.ref(`guestinfo/${gid}`).get();
      const data = snap.val();
      if (data){
        currentGuestKey = gid;
        currentGuestObj = gpCore.normGuest(data);
        if (handoff && handoff.gid===gid){
          currentGuestObj = applyHandoffPrefill(currentGuestObj, handoff);
          if (handoff.entryId) seedEntryId = handoff.entryId;
        }
        rememberLastGuestKey(gid);
        if (entry && !data?.source?.entryId){
          gpDb.ref(`guestinfo/${gid}/source`)
              .set({type:"guestForm",entryId:entry})
              .catch(()=>{});
        }
        _uiStep = initialUiStepForRecord(currentGuestObj, "guestinfo", uiStart || handoff?.uistart);
        dlog("loaded guestinfo",gid,"start",_uiStep);
        return {ctx:"guestinfo"};
      }
    }catch(err){ console.error("Guest Portal: load gid error",err); }
  }

  /* 2) intake entry param ----------------------------------------- */
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
        if (handoff) applyHandoffPrefill(currentGuestObj, handoff);
        currentGuestKey = null;
        _uiStep = initialUiStepForRecord(currentGuestObj, "seed-entry", uiStart || handoff?.uistart);
        dlog("seed-entry start",_uiStep);
        return {ctx:"seed-entry"};
      }
    }catch(err){ console.error("Guest Portal: load entry error",err); }
  }

  /* 3) handoff w/gid (no params) ---------------------------------- */
  if (handoff && handoff.gid){
    try{
      const snap = await gpDb.ref(`guestinfo/${handoff.gid}`).get();
      const data = snap.val();
      if (data){
        currentGuestKey = handoff.gid;
        currentGuestObj = gpCore.normGuest(data);
        applyHandoffPrefill(currentGuestObj, handoff);
        if (handoff.entryId) seedEntryId = handoff.entryId;
        rememberLastGuestKey(handoff.gid);
        _uiStep = initialUiStepForRecord(currentGuestObj, "handoff", uiStart || handoff.uistart);
        dlog("handoff(gid) start",_uiStep);
        return {ctx:"handoff"};
      }
    }catch(err){ console.error("Guest Portal: handoff gid load error",err); }
  }

  /* 4) handoff Step1-only ----------------------------------------- */
  if (handoff && (handoff.custName || handoff.custPhone)){
    seedEntryId = handoff.entryId || null;
    currentGuestObj = {
      status:"new",
      custName:handoff.custName||"",
      custPhone:handoff.custPhone||"",
      submittedAt:handoff.timestamp||Date.now(),
      userUid:gpAuth.currentUser?.uid||null,
      evaluate:{},
      solution:{},
      prefilledStep1:true,
      source:handoff.entryId?{type:"guestForm",entryId:handoff.entryId}:null
    };
    currentGuestKey=null;
    _uiStep = initialUiStepForRecord(currentGuestObj, "handoff", uiStart || handoff.uistart);
    dlog("handoff(step1) start",_uiStep);
    return {ctx:"handoff"};
  }

  /* 5) resume last gid -------------------------------------------- */
  try{
    const lastKey = localStorage.getItem("last_guestinfo_key");
    if (lastKey){
      const snap = await gpDb.ref(`guestinfo/${lastKey}`).get();
      const data = snap.val();
      if (data){
        currentGuestKey = lastKey;
        currentGuestObj = gpCore.normGuest(data);
        _uiStep = initialUiStepForRecord(currentGuestObj, "resume", uiStart);
        dlog("resume last",lastKey,"start",_uiStep);
        return {ctx:"resume"};
      }else{
        localStorage.removeItem("last_guestinfo_key");
      }
    }
  }catch(_){}

  /* 6) brand new -------------------------------------------------- */
  currentGuestObj = {status:"new",evaluate:{},solution:{}};
  currentGuestKey = null;
  seedEntryId     = null;
  _uiStep         = initialUiStepForRecord(currentGuestObj, "new", uiStart);
  dlog("new lead start",_uiStep);
  return {ctx:"new"};
}

/* ---------------------------------------------------------------- Auth gate */
gpAuth.onAuthStateChanged(async user=>{
  if(!user){
    window.location.href = "../index.html";
    return;
  }

  gpUI.ensureProgressBar();
  gpUI.ensureStepNav();
  gpUI.ensureEvalExtrasWrap();
  gpUI.ensureRevertLinks();

  gpUI.bindLiveEvents({
    onInput: ()=>{
      const live = buildGuestFromDom();
      const comp = gpCore.computePitchFull(live);
      const savedPct = currentGuestObj ? gpCore.computePitchFull(currentGuestObj).pctFull : 0;
      const diff = Math.abs(comp.pctFull - savedPct);
      gpUI.setProgressPreview(diff>1 ? comp.pctFull : null);
      gpUI.updateNbqChips(live);
    },
    onBlur: null, // no autosave
    onNav: step=>{
      if (!GP_STEPS.includes(step)) return;
      _uiStep = step;
      gpUI.markStepActive(_uiStep);
      gpUI.gotoStep(_uiStep);
    }
  });

  const {ctx} = await loadContext();
  syncUi();

  if (ctx!=="guestinfo"){  // for seed / handoff / new ensure nav highlight
    gpUI.markStepActive(_uiStep);
    gpUI.gotoStep(_uiStep);
  }
});

/* -------------------------------------------------------------- Submit wires */
function wireSubmitHandler(id, advance=true){
  const frm = document.getElementById(id);
  if(!frm) return;
  frm.addEventListener("submit", async e=>{
    e.preventDefault();
    await saveGuestNow();
    if (advance) _uiStep = nextStep(_uiStep);
    gpUI.markStepActive(_uiStep);
    gpUI.gotoStep(_uiStep);
  });
}
wireSubmitHandler("step1Form", true);
wireSubmitHandler("step2Form", true);
wireSubmitHandler("step3Form", false);

/* ------------------------------------------------------ Manual recompute dbg */
async function gpRecomputeCompletion(gid){
  const key = gid || currentGuestKey;
  if(!key) return;
  const snap = await gpDb.ref(`guestinfo/${key}`).get();
  const data = snap.val() || {};
  currentGuestObj = gpCore.normGuest(data);
  await writeCompletion(key, currentGuestObj);
}
window.gpRecomputeCompletion = gpRecomputeCompletion;

/* ---------------------------------------------------------------- Public API */
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

})(); // end IIFE