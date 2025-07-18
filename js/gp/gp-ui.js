/* gp-basic.js ================================================================
 * Minimal Guest Portal bootstrap: load → hydrate forms → save → navigate.
 * Consolidates gp-core + gp-ui + gp-handoff + gp-app essentials into ONE file.
 * TEMP DEBUG BUILD – trim logs & tighten security before production.
 * ========================================================================== */

;(function(global){
"use strict";

/* --------------------------------------------------------------------------
 * 0. Firebase bootstrap (assumes compat SDKs already loaded)
 * ------------------------------------------------------------------------ */
(function initFirebase(){
  if (global.firebase?.apps?.length) return;
  const cfg = global.GP_FIREBASE_CONFIG || {
    apiKey: "AIzaSyD9fILTNJQ0wsPftUsPkdLrhRGV9dslMzE",
    authDomain: "osls-644fd.firebaseapp.com",
    databaseURL: "https://osls-644fd-default-rtdb.firebaseio.com",
    projectId: "osls-644fd",
    storageBucket: "osls-644fd.appspot.com",
    messagingSenderId: "798578046321",
    appId: "1:798578046321:web:8758776701786a2fccf2d0",
    measurementId: "G-9HWXNSBE1T"
  };
  firebase.initializeApp(cfg);
})();
const gpDb   = firebase.database();
const gpAuth = firebase.auth();

/* --------------------------------------------------------------------------
 * 1. Debug helpers
 * ------------------------------------------------------------------------ */
const DBG = ()=>!!global.GP_DEBUG;
function dlog(...a){ if(DBG()) console.log("[gp-basic]",...a); }
function wlog(...a){ console.warn("[gp-basic]",...a); }

/* --------------------------------------------------------------------------
 * 2. localStorage helpers
 * ------------------------------------------------------------------------ */
const LS_HANDOFF_KEY = "gp_handoff_payload_v2";
const LS_LAST_GID    = "last_guestinfo_key";
const HANDOFF_MAX_AGE= 15*60*1000; // 15 min

function lsSafeSet(k,v){ try{ localStorage.setItem(k,v); }catch(_){}
}
function lsSafeGet(k,def=null){ try{ const v=localStorage.getItem(k); return v==null?def:v; }catch(_){ return def; } }
function lsSafeDel(k){ try{ localStorage.removeItem(k); }catch(_){} }

/* Store a handoff payload when dashboard clicks "Continue". */
function storeHandoff(p){
  const wrap = {ts:Date.now(),payload:p||{}};
  lsSafeSet(LS_HANDOFF_KEY, JSON.stringify(wrap));
}
/* Retrieve + validate handoff (do not clear yet). */
function readHandoffRaw(){
  try{
    const raw = localStorage.getItem(LS_HANDOFF_KEY);
    if(!raw) return null;
    const wrap = JSON.parse(raw);
    if(!wrap || typeof wrap!=="object") return null;
    if(typeof wrap.ts!=="number") return null;
    if(Date.now()-wrap.ts > HANDOFF_MAX_AGE) return null;
    return wrap.payload||null;
  }catch(_){ return null; }
}
function clearHandoff(){ lsSafeDel(LS_HANDOFF_KEY); }

/* --------------------------------------------------------------------------
 * 3. URL param parsing (? + #)
 * ------------------------------------------------------------------------ */
function parseParams(){
  const out={};
  function add(kv){
    if(!kv) return;
    const i=kv.indexOf("="); if(i<0) return;
    const k=decodeURIComponent(kv.slice(0,i));
    const v=decodeURIComponent(kv.slice(i+1));
    if(k) out[k]=v;
  }
  function grab(str){
    if(!str) return;
    str=str.replace(/^[?#]/,"");
    if(!str) return;
    str.split("&").forEach(add);
  }
  grab(window.location.search);
  grab(window.location.hash);
  return out;
}
function qs(name){ return parseParams()[name] ?? null; }

/* --------------------------------------------------------------------------
 * 4. Mini "core" -- value checks + status inference + normalization
 * ------------------------------------------------------------------------ */
function hasVal(v){
  if(v==null) return false;
  if(typeof v==="string")  return v.trim()!=="";
  if(typeof v==="number")  return true;
  if(typeof v==="boolean") return v;
  if(Array.isArray(v))     return v.length>0;
  if(typeof v==="object")  return Object.keys(v).length>0;
  return false;
}
function digitsOnly(str){ return (str||"").replace(/\D+/g,""); }

function hasAnyEvalData(e){
  return !!(e && (
    hasVal(e.currentCarrier)||hasVal(e.numLines)||hasVal(e.coverageZip)||
    hasVal(e.deviceStatus)||hasVal(e.finPath)||hasVal(e.billPain)||
    hasVal(e.dataNeed)||hasVal(e.hotspotNeed)||hasVal(e.intlNeed)||
    hasVal(e.serviceType)||hasVal(e.situation)||hasVal(e.carrierInfo)||hasVal(e.requirements)
  ));
}
function detectStatus(g){
  const s=(g?.status||"").toLowerCase();
  if(s) return s;
  if(g?.sale) return "sold";
  if(g?.solution && hasVal(g.solution.text)) return "proposal";
  if(hasAnyEvalData(g?.evaluate)) return "working";
  return "new";
}
function hasPrefilledStep1(g){
  return !!(hasVal(g?.custName)||hasVal(g?.custPhone)||
            hasVal(g?.guestName)||hasVal(g?.guestPhone)||g?.prefilledStep1);
}

/* Normalize any historical guest shape into canonical. */
function normGuest(src){
  src = src||{};
  const custName  = src.custName ?? src.guestName ?? "";
  const custPhone = src.custPhone ?? src.guestPhone ?? "";
  const e = Object.assign({}, src.evaluate);
  if(e.currentCarrier==null && src.currentCarrier!=null) e.currentCarrier=src.currentCarrier;
  if(e.numLines==null       && src.numLines!=null)       e.numLines=src.numLines;
  if(e.coverageZip==null    && src.coverageZip!=null)    e.coverageZip=src.coverageZip;
  if(e.deviceStatus==null   && src.deviceStatus!=null)   e.deviceStatus=src.deviceStatus;
  if(e.finPath==null        && src.finPath!=null)        e.finPath=src.finPath;
  if(e.billPain==null       && src.billPain!=null)       e.billPain=src.billPain;
  if(e.dataNeed==null       && src.dataNeed!=null)       e.dataNeed=src.dataNeed;
  if(e.hotspotNeed==null    && src.hotspotNeed!=null)    e.hotspotNeed=src.hotspotNeed;
  if(e.intlNeed==null       && src.intlNeed!=null)       e.intlNeed=src.intlNeed;
  if(e.serviceType==null    && src.serviceType!=null)    e.serviceType=src.serviceType;
  if(e.situation==null      && src.situation!=null)      e.situation=src.situation;
  if(e.carrierInfo==null    && src.carrierInfo!=null)    e.carrierInfo=src.carrierInfo;
  if(e.requirements==null   && src.requirements!=null)   e.requirements=src.requirements;

  const sol = Object.assign({}, src.solution);
  if(sol.text==null && src.solutionText!=null) sol.text=src.solutionText;

  const prefilledStep1 = src.prefilledStep1 || hasPrefilledStep1({custName,custPhone});
  const status = detectStatus({ ...src, custName, custPhone, evaluate:e, solution:sol });

  return {
    ...src,
    custName,
    custPhone,
    custPhoneDigits: digitsOnly(custPhone),
    evaluate:e,
    solution:sol,
    prefilledStep1,
    status
  };
}

/* --------------------------------------------------------------------------
 * 5. Minimal UI helpers (no progress scoring; just show/hide + summary)
 * ------------------------------------------------------------------------ */
function el(id){ return document.getElementById(id); }

/* show/hide steps */
function gotoStep(step){
  const s1=el("step1Form"), s2=el("step2Form"), s3=el("step3Form");
  if(s1) s1.classList.toggle("hidden", step!=="step1");
  if(s2) s2.classList.toggle("hidden", step!=="step2");
  if(s3) s3.classList.toggle("hidden", step!=="step3");
  // nav highlight
  const nav=el("gp-step-nav");
  if(nav){
    [...nav.querySelectorAll("button[data-step]")].forEach(b=>{
      b.classList.toggle("active", b.dataset.step===step);
    });
  }
}
function ensureStepNav(){
  if(el("gp-step-nav")) return;
  const nav=document.createElement("div");
  nav.id="gp-step-nav";
  nav.className="gp-step-nav";
  nav.innerHTML=`
    <button type="button" data-step="step1">1. Customer</button>
    <button type="button" data-step="step2">2. Evaluate</button>
    <button type="button" data-step="step3">3. Solution</button>`;
  document.body.insertBefore(nav, document.body.firstChild);
  nav.addEventListener("click",e=>{
    const btn=e.target.closest("button[data-step]"); if(!btn) return;
    const step=btn.dataset.step;
    gpBasic._nav(step);
  });
}

/* status msg helpers (expects <div id="status1"> etc; safe no-op) */
function statusMsg(id,msg,cls=""){
  const el=document.getElementById(id); if(!el) return;
  el.textContent=msg;
  el.className="g-status";
  if(cls) el.classList.add(cls);
}

/* prefill summary above step2 */
function injectPrefillSummary(name,phone){
  const step2=el("step2Form"); if(!step2) return;
  let summary=el("prefillSummary");
  if(!summary){
    summary=document.createElement("div");
    summary.id="prefillSummary";
    summary.className="prefill-summary";
    summary.style.marginBottom="1rem";
    step2.insertBefore(summary, step2.firstChild);
  }
  summary.innerHTML=`<b>Customer:</b> ${name||"-"} &nbsp; <b>Phone:</b> ${phone||"-"}`;
}

/* read form fields (raw) */
function readDomFields(){
  const get = id=>{const x=el(id);return x?x.value:"";};
  return {
    custName:get("custName").trim(),
    custPhone:get("custPhone").trim(),
    currentCarrier:get("currentCarrierSel"),
    numLines:(v=>v===""?null:Number(v))(get("numLines")),
    coverageZip:get("coverageZip").trim(),
    deviceStatus:get("deviceStatus"),
    finPath:get("finPath"),
    billPain:get("billPain").trim(),
    dataNeed:get("dataNeed"),
    hotspotNeed:(v=>v===""?null:(v==="true"))(get("hotspotNeed")),
    intlNeed:(v=>v===""?null:(v==="true"))(get("intlNeed")),
    serviceType:get("serviceType"),
    situation:get("situation").trim(),
    carrierInfo:get("evalCarrier").trim(),
    requirements:get("evalRequirements").trim(),
    solutionText:get("solutionText").trim()
  };
}

/* write form fields from normalized guest */
function writeDomFields(g){
  const e=g.evaluate||{}, sol=g.solution||{};
  const set=(id,val)=>{const x=el(id); if(x!=null) x.value=val==null?"":val;};

  set("custName", g.custName||"");
  set("custPhone", g.custPhone||"");

  set("currentCarrierSel", e.currentCarrier||"");
  set("numLines", e.numLines!=null?e.numLines:"");
  set("coverageZip", e.coverageZip||"");
  set("deviceStatus", e.deviceStatus||"");
  set("finPath", e.finPath||"");
  set("billPain", e.billPain||"");
  set("dataNeed", e.dataNeed||"");
  set("hotspotNeed", e.hotspotNeed==null?"":String(!!e.hotspotNeed));
  set("intlNeed", e.intlNeed==null?"":String(!!e.intlNeed));
  set("serviceType", e.serviceType||"");
  set("situation", e.situation||"");
  set("evalCarrier", e.carrierInfo||"");
  set("evalRequirements", e.requirements||"");
  set("solutionText", sol.text||"");
}

/* --------------------------------------------------------------------------
 * 6. gpBasic state
 * ------------------------------------------------------------------------ */
const GP_STEPS=["step1","step2","step3"];
const stepRank  = s=>Math.max(0,GP_STEPS.indexOf(s));
const nextStep  = s=>GP_STEPS[Math.min(stepRank(s)+1,GP_STEPS.length-1)]||"step3";
function statusToStep(status){
  switch((status||"").toLowerCase()){
    case "working": return "step2";
    case "proposal":
    case "sold":    return "step3";
    default:        return "step1";
  }
}
function computeUiStart(g,uistartParam,ctx){
  if(GP_STEPS.includes(uistartParam)) return uistartParam;
  let st = statusToStep(g?.status||"new");
  if((ctx==="seed-entry"||ctx==="handoff"||hasPrefilledStep1(g)) && stepRank("step2")>stepRank(st)){
    st="step2";
  }
  return st;
}

let _uiStep="step1";
let _guestKey=null;
let _guestObj=null;
let _seedEntryId=null;
let _handoff=null; // raw handoff payload merged w/URL

/* --------------------------------------------------------------------------
 * 7. Handoff receive + merge
 * ------------------------------------------------------------------------ */
/* Called on load; merges URL > LS handoff; attaches to window.GP_HANDOFF. */
function receiveHandoff(){
  const urlP=parseParams();
  const lsP = readHandoffRaw();
  const out = {...(lsP||{})};

  if(urlP.gid!=null)   out.gid=urlP.gid;
  if(urlP.entry!=null) out.entry=urlP.entry;
  if(urlP.name!=null)  out.name=urlP.name;
  if(urlP.phone!=null) out.phone=urlP.phone;
  if(urlP.status!=null)out.status=urlP.status;
  if(urlP.uistart!=null)out.uistart=urlP.uistart;

  if(out.prefilledStep1==null){
    out.prefilledStep1 = !!(out.name||out.phone);
  }
  out.timestamp=Date.now();
  global.GP_HANDOFF=out;
  return out;
}
_handoff = receiveHandoff(); // run immediately

/* Called by dashboard "Continue…" button to launch guestinfo + stash payload. */
function handoffOpen(payload){
  payload=payload||{};
  // persist for receiver
  storeHandoff(payload);
  if(payload.gid) lsSafeSet(LS_LAST_GID, payload.gid);
  const dest=payload.dest || global.GUESTINFO_PAGE || "../html/guestinfo.html";
  const params=[];
  if(payload.gid)   params.push("gid="+encodeURIComponent(payload.gid));
  if(payload.entry) params.push("entry="+encodeURIComponent(payload.entry));
  params.push("uistart="+encodeURIComponent(computeUiStart(payload,null,"sender")));
  const joiner=dest.includes("?")?"&":"?";
  const url=params.length?(dest+joiner+params.join("&")):dest;
  window.location.href=url;
}
global.gpHandoff = { open:handoffOpen }; // minimal sender API

/* --------------------------------------------------------------------------
 * 8. Apply handoff Step1 prefill into a guest object (mutates)
 * ------------------------------------------------------------------------ */
function applyHandoff(target,h){
  if(!target||!h) return target;
  let changed=false;
  const pName  = h.custName || h.name  || "";
  const pPhone = h.custPhone|| h.phone || "";
  if(!target.custName && pName){ target.custName=pName; changed=true; }
  if(!target.custPhone && pPhone){ target.custPhone=pPhone; changed=true; }
  if(h.status && (!target.status||target.status==="new")){ target.status=h.status; changed=true; }
  if(h.entry && !(target.source&&target.source.entryId)){
    target.source={type:"guestForm",entryId:h.entry}; _seedEntryId=h.entry; changed=true;
  }
  if(changed) target.prefilledStep1=hasPrefilledStep1(target);
  return target;
}

/* --------------------------------------------------------------------------
 * 9. Load context
 * ------------------------------------------------------------------------ */
async function loadContext(){
  const gid    = qs("gid");
  const entry  = qs("entry");
  const uiHint = qs("uistart");
  const h      = _handoff;
  dlog("loadContext params", {gid,entry,uiHint}, "handoff",h);

  /* 1) gid param -------------------------------------------------- */
  if(gid){
    try{
      const snap=await gpDb.ref(`guestinfo/${gid}`).get();
      if(snap.exists()){
        _guestKey=gid;
        _guestObj=normGuest(snap.val());
        if(h && h.gid===gid) applyHandoff(_guestObj,h);
        if(entry && !_guestObj?.source?.entryId){
          gpDb.ref(`guestinfo/${gid}/source`).set({type:"guestForm",entryId:entry}).catch(()=>{});
        }
        lsSafeSet(LS_LAST_GID,gid);
        _uiStep=computeUiStart(_guestObj, uiHint||h?.uistart, "guestinfo");
        return {ctx:"guestinfo"};
      }
    }catch(err){ wlog("gid load error",err); }
  }

  /* 2) entry param ------------------------------------------------ */
  if(entry){
    try{
      const esnap=await gpDb.ref(`guestEntries/${entry}`).get();
      if(esnap.exists()){
        const e=esnap.val();
        _seedEntryId=entry;
        _guestObj=normGuest({
          status:"new",
          custName:e.guestName||"",
          custPhone:e.guestPhone||"",
          evaluate:{},
          solution:{},
          prefilledStep1:!!(e.guestName||e.guestPhone),
          source:{type:"guestForm",entryId:entry}
        });
        if(h) applyHandoff(_guestObj,h);
        _guestKey=null;
        _uiStep=computeUiStart(_guestObj, uiHint||h?.uistart,"seed-entry");
        return {ctx:"seed-entry"};
      }
    }catch(err){ wlog("entry load error",err); }
  }

  /* 3) handoff w/gid (no params) --------------------------------- */
  if(h?.gid){
    try{
      const snap=await gpDb.ref(`guestinfo/${h.gid}`).get();
      if(snap.exists()){
        _guestKey=h.gid;
        _guestObj=normGuest(snap.val());
        applyHandoff(_guestObj,h);
        if(h.entry) _seedEntryId=h.entry;
        lsSafeSet(LS_LAST_GID,h.gid);
        _uiStep=computeUiStart(_guestObj, uiHint||h.uistart,"handoff");
        return {ctx:"handoff"};
      }
    }catch(err){ wlog("handoff gid load error",err); }
  }

  /* 4) handoff Step1-only ---------------------------------------- */
  if(h?.name || h?.phone || h?.custName || h?.custPhone){
    _seedEntryId=h.entry||null;
    _guestObj=normGuest({
      status:"new",
      custName:h.custName||h.name||"",
      custPhone:h.custPhone||h.phone||"",
      evaluate:{},solution:{},prefilledStep1:true,
      source:h.entry?{type:"guestForm",entryId:h.entry}:null
    });
    _guestKey=null;
    _uiStep=computeUiStart(_guestObj, uiHint||h?.uistart,"handoff");
    return {ctx:"handoff"};
  }

  /* 5) resume last gid ------------------------------------------- */
  const last=lsSafeGet(LS_LAST_GID,null);
  if(last){
    try{
      const snap=await gpDb.ref(`guestinfo/${last}`).get();
      if(snap.exists()){
        _guestKey=last;
        _guestObj=normGuest(snap.val());
        _uiStep=computeUiStart(_guestObj, uiHint,"resume");
        return {ctx:"resume"};
      }else{
        lsSafeDel(LS_LAST_GID);
      }
    }catch(_){}
  }

  /* 6) brand new ------------------------------------------------- */
  _guestObj=normGuest({status:"new",evaluate:{},solution:{}});
  _guestKey=null;
  _seedEntryId=null;
  _uiStep=computeUiStart(_guestObj, uiHint,"new");
  return {ctx:"new"};
}

/* --------------------------------------------------------------------------
 * 10. Save (create/update)
 * ------------------------------------------------------------------------ */
async function buildGuestFromDom(){
  const raw=readDomFields();
  const base=_guestObj?JSON.parse(JSON.stringify(_guestObj)):{status:"new",evaluate:{},solution:{}};
  base.custName=raw.custName||"";
  base.custPhone=raw.custPhone||"";

  base.evaluate=base.evaluate||{};
  base.evaluate.currentCarrier=raw.currentCarrier||"";
  base.evaluate.numLines=raw.numLines;
  base.evaluate.coverageZip=raw.coverageZip||"";
  base.evaluate.deviceStatus=raw.deviceStatus||"";
  base.evaluate.finPath=raw.finPath||"";
  base.evaluate.billPain=raw.billPain||"";
  base.evaluate.dataNeed=raw.dataNeed||"";
  base.evaluate.hotspotNeed=raw.hotspotNeed;
  base.evaluate.intlNeed=raw.intlNeed;
  base.evaluate.serviceType=raw.serviceType||"";
  base.evaluate.situation=raw.situation||"";
  base.evaluate.carrierInfo=raw.carrierInfo||"";
  base.evaluate.requirements=raw.requirements||"";

  base.solution=base.solution||{};
  base.solution.text=raw.solutionText||"";

  base.status=detectStatus(base);
  if(base.custName||base.custPhone) base.prefilledStep1=true;
  return base;
}

async function saveGuestNow(){
  const g=await buildGuestFromDom();
  const uid=gpAuth.currentUser?.uid||null;
  const now=Date.now();

  if(!_guestKey){
    // CREATE
    const payload={
      custName:g.custName||"",
      custPhone:g.custPhone||"",
      submittedAt:now,
      userUid:uid,
      status:detectStatus(g),
      evaluate:g.evaluate||{},
      solution:hasVal(g.solution?.text)?{text:g.solution.text,completedAt:now}:null,
      source:_seedEntryId?{type:"guestForm",entryId:_seedEntryId}:(_guestObj?.source||null)||null,
      prefilledStep1:hasPrefilledStep1(g)
    };
    try{
      const pushRef=await gpDb.ref("guestinfo").push(payload);
      _guestKey=pushRef.key;
      dlog("created guestinfo",_guestKey);
      lsSafeSet(LS_LAST_GID,_guestKey);
      // replace URL so refresh works
      try{
        const params=new URLSearchParams(window.location.search);
        params.set("gid",_guestKey);
        if(_seedEntryId) params.set("entry",_seedEntryId); else params.delete("entry");
        params.set("uistart",_uiStep);
        const url=window.location.pathname+"?"+params.toString()+window.location.hash.replace(/^#/,'#');
        history.replaceState(null,"",url);
      }catch(_){}
    }catch(err){
      wlog("create guestinfo failed",err);
      statusMsg("status1","Save error","error");
      statusMsg("status2","Save error","error");
      statusMsg("status3","Save error","error");
      return;
    }
    _guestObj=normGuest(g);
  }else{
    // UPDATE
    const updates={};
    updates[`guestinfo/${_guestKey}/custName`]=g.custName||"";
    updates[`guestinfo/${_guestKey}/custPhone`]=g.custPhone||"";
    updates[`guestinfo/${_guestKey}/evaluate`]=g.evaluate||{};
    if(hasVal(g.solution?.text)){
      updates[`guestinfo/${_guestKey}/solution`]={text:g.solution.text,completedAt:_guestObj?.solution?.completedAt||now};
    }else{
      updates[`guestinfo/${_guestKey}/solution`]=null;
    }
    updates[`guestinfo/${_guestKey}/status`]=detectStatus(g);
    updates[`guestinfo/${_guestKey}/updatedAt`]=now;
    if(hasPrefilledStep1(g)) updates[`guestinfo/${_guestKey}/prefilledStep1`]=true;
    if(_seedEntryId && !(_guestObj?.source && _guestObj.source.entryId)){
      updates[`guestinfo/${_guestKey}/source`]={type:"guestForm",entryId:_seedEntryId};
    }else if(_guestObj?.source){
      updates[`guestinfo/${_guestKey}/source`]=_guestObj.source;
    }
    try{
      await gpDb.ref().update(updates);
      dlog("updated guestinfo",_guestKey);
    }catch(err){
      wlog("update guestinfo failed",err);
      statusMsg("status1","Save error","error");
      statusMsg("status2","Save error","error");
      statusMsg("status3","Save error","error");
      return;
    }
    _guestObj=normGuest(g);
  }

  statusMsg("status1","Saved.","success");
  statusMsg("status2","Saved.","success");
  statusMsg("status3","Saved.","success");
}

/* --------------------------------------------------------------------------
 * 11. Sync UI from current guest object
 * ------------------------------------------------------------------------ */
function syncUi(){
  ensureStepNav();
  const g=_guestObj||{};
  writeDomFields(g);
  injectPrefillSummary(g.custName,g.custPhone);
  gotoStep(_uiStep);
}

/* --------------------------------------------------------------------------
 * 12. Nav callback (wired by ensureStepNav)
 * ------------------------------------------------------------------------ */
async function navHandler(step){
  if(!GP_STEPS.includes(step)) return;
  const prev=_uiStep;
  const forward=stepRank(step)>stepRank(prev);
  if(forward){
    await saveGuestNow();
  }
  _uiStep=step;
  gotoStep(_uiStep);
}
gpBasic._nav = navHandler; // internal hook for nav element

/* --------------------------------------------------------------------------
 * 13. Form submit wiring
 * ------------------------------------------------------------------------ */
function wireSubmit(id,advance=true){
  const frm=el(id); if(!frm) return;
  frm.addEventListener("submit",async e=>{
    e.preventDefault();
    await saveGuestNow();
    if(advance) _uiStep=nextStep(_uiStep);
    gotoStep(_uiStep);
  });
}

/* --------------------------------------------------------------------------
 * 14. Auth handling
 * ------------------------------------------------------------------------ */
/* We auto sign in anonymously if no user -- prevents redirect loops & satisfies
 * common write rules ("auth != null"). Works w/ your relaxed rules too.
 */
function ensureAuth(){
  if(gpAuth.currentUser) return;
  gpAuth.signInAnonymously().catch(err=>{
    wlog("anon sign-in failed",err);
    // fallback: just operate read-only if rules allow
  });
}
gpAuth.onAuthStateChanged(async user=>{
  dlog("auth state", user?.uid || null);
  if(!user) ensureAuth(); // will re-fire when anon user arrives
  // once we have (or attempted) auth, bootstrap data
  await loadContext();
  syncUi();
});

/* --------------------------------------------------------------------------
 * 15. DOM ready -> wire forms
 * ------------------------------------------------------------------------ */
document.addEventListener("DOMContentLoaded",()=>{
  ensureStepNav();
  wireSubmit("step1Form",true);
  wireSubmit("step2Form",true);
  wireSubmit("step3Form",false);
  // If auth already available (fast path), ensure we sync now.
  if(gpAuth.currentUser){
    loadContext().then(syncUi);
  }
});

/* --------------------------------------------------------------------------
 * 16. Public surface
 * ------------------------------------------------------------------------ */
const gpBasic = {
  get guestKey(){return _guestKey;},
  get guest(){return _guestObj;},
  get uiStep(){return _uiStep;},
  save:saveGuestNow,
  sync:syncUi,
  goto:navHandler,
  _nav:navHandler,   // internal (wired by nav)
  open:handoffOpen   // allow dashboards to call gpBasic.open() if desired
};
global.gpBasic = gpBasic;

/* For compatibility, expose gpApp subset */
global.gpApp = {
  get guestKey(){return gpBasic.guestKey;},
  get guest(){return gpBasic.guest;},
  get uiStep(){return gpBasic.uiStep;},
  saveNow:gpBasic.save,
  syncUi:gpBasic.sync,
  gotoStep:gpBasic.goto
};

})(window);