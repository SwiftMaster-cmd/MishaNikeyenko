/* gp-app.js =================================================================
 * OSL Guest Portal main controller
 * (NO AUTOSAVE form fields; forward-nav autosave; dashboard reopen; handoff)
 * ---------------------------------------------------------------------------
 * Data persists ONLY on:
 *   - Step form submit buttons, OR
 *   - Forward step navigation clicks (Step1→2, Step2→3) via progress tabs.
 *
 * Robust param parsing (? + #); integrates gp-handoff.js to carry gid/entry
 * and Step1 name/phone across page loads without re-pushing guestinfo rows.
 *
 * Prefilled Step1 bumps UI to Step2 even if status=new.
 * Never auto-downgrade user-chosen step; only bump forward.
 * Remembers last gid in localStorage for resume convenience.
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
let currentGuestObj = null;      // working copy (normalized)
let currentGuestKey = null;      // guestinfo/<gid>
let seedEntryId     = null;      // guestEntries/<eid> (if arrival via intake)
let _handoffPayload = undefined; // cached once from gp-handoff

/* UI step ------------------------------------------------------------------ */
const GP_STEPS = ["step1","step2","step3"];
let _uiStep = "step1";

/* Tunables ----------------------------------------------------------------- */
const AUTO_STATUS_ESCALATE = true; // detectStatus() on save

/* Debug -------------------------------------------------------------------- */
const DBG = ()=>!!window.GP_DEBUG;
function dlog(...a){ if (DBG()) console.log("[gp-app]",...a); }

/* ----------------------------------------------------------- gpCore safe shim
 * (Real gpCore should be loaded before gp-ui.js; this is a fallback.)
 */
const gpCore = window.gpCore || {
  detectStatus(g){
    if (!g) return "new";
    if (g.sale) return "sold";
    if (g.solution && (g.solution.text || g.solution.completedAt)) return "proposal";
    if (g.evaluate && Object.keys(g.evaluate).length) return "working";
    return "new";
  },
  computePitchFull(g){
    return {
      pctFull: 0,
      steps:{ step1:{earned:0,max:1}, step2:{earned:0,max:1}, step3:{earned:0,max:1} },
      fields:{}
    };
  },
  hasVal(v){ return v!=null && v!==""; },
  normGuest(g){ return g||{}; },
  FIELD_STEP:{
    custName:"step1",custPhone:"step1",
    currentCarrier:"step2",numLines:"step2",coverageZip:"step2",deviceStatus:"step2",
    finPath:"step2",billPain:"step2",dataNeed:"step2",hotspotNeed:"step2",intlNeed:"step2",
    solutionText:"step3"
  },
  TIER_A_FIELDS:["custName","custPhone","currentCarrier","numLines","coverageZip"],
  TIER_B_FIELDS:["deviceStatus","finPath","billPain","dataNeed","hotspotNeed","intlNeed"],
  PITCH_WEIGHTS:{custName:5,custPhone:5,currentCarrier:10,numLines:8,coverageZip:4}
};
gpCore.normGuest = gpCore.normGuest || gpCore.normalize || (g=>g||{});

/* ---------------------------------------------------------------- norm helper */
function normWithStep1(raw){
  let n = gpCore.normGuest ? gpCore.normGuest(raw) : (raw || {});
  if(!n || typeof n!=="object") n = {};
  if(raw && raw.custName  !== undefined && (n.custName  == null)) n.custName  = raw.custName;
  if(raw && raw.custPhone !== undefined && (n.custPhone == null)) n.custPhone = raw.custPhone;
  if(raw && raw.status && !n.status) n.status = raw.status;
  if(raw && raw.prefilledStep1 && !n.prefilledStep1) n.prefilledStep1 = true;
  if(!n.evaluate) n.evaluate = {};
  if(!n.solution) n.solution = {};
  return n;
}

/* --------------------------------------------------------- gp-handoff integration */
function consumeHandoffOnce(){
  if (_handoffPayload !== undefined) return _handoffPayload || null;
  try {
    // Prefer consumePrefill() if present (cleaner shape); else consume().
    if (window.gpHandoff) {
      if (typeof window.gpHandoff.consumePrefill === "function") {
        _handoffPayload = window.gpHandoff.consumePrefill();
      } else if (typeof window.gpHandoff.consume === "function") {
        _handoffPayload = window.gpHandoff.consume();
      }
    } else {
      _handoffPayload = null;
    }
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

/* Determine initial UI step. */
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

  const pName  = payload.custName || payload.name  || "";
  const pPhone = payload.custPhone|| payload.phone || "";

  if (!target.custName && pName){ target.custName = pName; changed=true; }
  if (!target.custPhone && pPhone){ target.custPhone = pPhone; changed=true; }

  const statusHint = payload.status || payload.statusHint;
  if (statusHint && (!target.status || target.status==="new")){
    target.status = statusHint;
    changed=true;
  }

  const eId = payload.entry || payload.entryId;
  if (eId && !(target.source && target.source.entryId)){
    target.source = {type:"guestForm",entryId:eId};
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
      dlog("created guestinfo",currentGuestKey,payload);
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
          consumedAt: now,
          claimedBy: uid || null
        });
      }catch(err){
        console.warn("[gp-app] link guestEntries→guestinfo failed",err);
      }
    }

    currentGuestObj = normWithStep1(g);

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

    if (seedEntryId && !(currentGuestObj?.source && currentGuestObj.source.entryId)){
      updates[`guestinfo/${currentGuestKey}/source`] = {type:"guestForm",entryId:seedEntryId};
    } else if (currentGuestObj?.source){
      updates[`guestinfo/${currentGuestKey}/source`] = currentGuestObj.source;
    }

    try{
      await gpDb.ref().update(updates);
      dlog("updated guestinfo",currentGuestKey,updates);
    }catch(err){
      console.error("[gp-app] update guestinfo failed",err);
      gpUI.statusMsg("status1","Save error","error");
      gpUI.statusMsg("status2","Save error","error");
      gpUI.statusMsg("status3","Save error","error");
      return;
    }

    currentGuestObj = normWithStep1(g);
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

/* ------------------------------------------------------------------ bootstrap */
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
      dlog("gid raw exists?", snap.exists(), snap.val());
      const data = snap.val();
      if (data){
        currentGuestKey = gid;
        currentGuestObj = normWithStep1(data);
        if (handoff && handoff.gid===gid){
          currentGuestObj = applyHandoffPrefill(currentGuestObj, handoff);
          if (handoff.entry) seedEntryId = handoff.entry;
        }
        rememberLastGuestKey(gid);
        if (entry && !data?.source?.entryId){
          gpDb.ref(`guestinfo/${gid}/source`).set({type:"guestForm",entryId:entry}).catch(()=>{});
        }
        _uiStep = initialUiStepForRecord(currentGuestObj, "guestinfo", uiStart || handoff?.uistart);
        dlog("loaded guestinfo",gid,"start",_uiStep,currentGuestObj);
        return {ctx:"guestinfo"};
      }
    }catch(err){ console.error("Guest Portal: load gid error",err); }
  }

  /* 2) intake entry param ----------------------------------------- */
  if (entry){
    try{
      const esnap = await gpDb.ref(`guestEntries/${entry}`).get();
      dlog("entry raw exists?", esnap.exists(), esnap.val());
      const e = esnap.val();
      if (e){
        seedEntryId = entry;
        currentGuestObj = normWithStep1({
          status: "new",
          custName:  e.guestName  || "",
          custPhone: e.guestPhone || "",
          submittedAt: e.timestamp || Date.now(),
          userUid: gpAuth.currentUser?.uid || null,
          evaluate: {},
          solution: {},
          prefilledStep1: !!(e.guestName || e.guestPhone),
          source: {type:"guestForm",entryId:entry}
        });
        if (handoff) applyHandoffPrefill(currentGuestObj, handoff);
        currentGuestKey = null;
        _uiStep = initialUiStepForRecord(currentGuestObj, "seed-entry", uiStart || handoff?.uistart);
        dlog("seed-entry start",_uiStep,currentGuestObj);
        return {ctx:"seed-entry"};
      }
    }catch(err){ console.error("Guest Portal: load entry error",err); }
  }

  /* 3) handoff w/gid (no params) ---------------------------------- */
  if (handoff && handoff.gid){
    try{
      const snap = await gpDb.ref(`guestinfo/${handoff.gid}`).get();
      dlog("handoff gid raw exists?", snap.exists(), snap.val());
      const data = snap.val();
      if (data){
        currentGuestKey = handoff.gid;
        currentGuestObj = normWithStep1(data);
        applyHandoffPrefill(currentGuestObj, handoff);
        if (handoff.entry) seedEntryId = handoff.entry;
        rememberLastGuestKey(handoff.gid);
        _uiStep = initialUiStepForRecord(currentGuestObj, "handoff", uiStart || handoff.uistart);
        dlog("handoff(gid) start",_uiStep,currentGuestObj);
        return {ctx:"handoff"};
      }
    }catch(err){ console.error("Guest Portal: handoff gid load error",err); }
  }

  /* 4) handoff Step1-only ----------------------------------------- */
  if (handoff && (handoff.name || handoff.phone || handoff.custName || handoff.custPhone)){
    seedEntryId = handoff.entry || null;
    currentGuestObj = normWithStep1({
      status:"new",
      custName:handoff.custName||handoff.name||"",
      custPhone:handoff.custPhone||handoff.phone||"",
      submittedAt:handoff.timestamp||Date.now(),
      userUid:gpAuth.currentUser?.uid||null,
      evaluate:{},
      solution:{},
      prefilledStep1:true,
      source:handoff.entry?{type:"guestForm",entryId:handoff.entry}:null
    });
    currentGuestKey=null;
    _uiStep = initialUiStepForRecord(currentGuestObj, "handoff", uiStart || handoff.uistart);
    dlog("handoff(step1) start",_uiStep,currentGuestObj);
    return {ctx:"handoff"};
  }

  /* 5) resume last gid -------------------------------------------- */
  try{
    const lastKey = localStorage.getItem("last_guestinfo_key");
    if (lastKey){
      const snap = await gpDb.ref(`guestinfo/${lastKey}`).get();
      dlog("resume raw exists?", snap.exists(), snap.val());
      const data = snap.val();
      if (data){
        currentGuestKey = lastKey;
        currentGuestObj = normWithStep1(data);
        _uiStep = initialUiStepForRecord(currentGuestObj, "resume", uiStart);
        dlog("resume last",lastKey,"start",_uiStep,currentGuestObj);
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

/* --------------------------- auth overlay helper -------------------------- */
// *** NEW: show simple in-page sign-in prompt instead of redirecting away.
function showAuthOverlay(){
  if (document.getElementById("gp-auth-overlay")) return;
  const div = document.createElement("div");
  div.id = "gp-auth-overlay";
  div.style.cssText = "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.8);color:#fff;z-index:9999;font-size:1.1rem;text-align:center;padding:1rem;";
  div.innerHTML = `
    <div>
      <p>Please sign in to view this guest.</p>
      <p><small>(Your link will reload automatically after sign-in.)</small></p>
    </div>`;
  document.body.appendChild(div);
}

/* ---------------------------------------------------------------- Auth gate */
gpAuth.onAuthStateChanged(async user=>{
  if(!user){
    dlog("auth: no user; waiting…");
    showAuthOverlay();

    /* OPTIONAL redirect to login preserving return URL:
    try{ localStorage.setItem("gp_return_to", window.location.href); }catch(_){}
    window.location.href = "../index.html#return=guestinfo";
    return;
    */
    return; // stay on page; once user signs in we proceed
  }

  // remove overlay if present
  const ov = document.getElementById("gp-auth-overlay");
  if (ov) ov.remove();

  // Ensure chrome
  gpUI.ensureProgressBar();
  gpUI.ensureStepNav();
  gpUI.ensureEvalExtrasWrap();
  gpUI.ensureRevertLinks();

  // Bind live events (preview only; forward-nav autosave)
  gpUI.bindLiveEvents({
    onInput: ()=>{
      const live = buildGuestFromDom();
      const comp = gpCore.computePitchFull(live);
      const savedPct = currentGuestObj ? gpCore.computePitchFull(currentGuestObj).pctFull : 0;
      const diff = Math.abs(comp.pctFull - savedPct);
      gpUI.setProgressPreview(diff>1 ? comp.pctFull : null);
      gpUI.updateNbqChips(live);
    },
    onBlur: null,
    onNav: async step => {
      if (!GP_STEPS.includes(step)) return;
      const prev = _uiStep;
      const goingForward = stepRank(step) > stepRank(prev);
      if (goingForward){
        dlog("forward-nav autosave", prev, "→", step);
        await saveGuestNow(); // always save when moving forward
      }
      _uiStep = step;
      gpUI.markStepActive(_uiStep);
      gpUI.gotoStep(_uiStep);
    }
  });

  // Load context
  const {ctx} = await loadContext();
  syncUi();

  // If we didn’t load an existing guestinfo, ensure nav highlight
  if (ctx!=="guestinfo"){
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
  currentGuestObj = normWithStep1(data);
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