// gp-basic.js -- Minimal Guest Portal single-file logic (no dependencies except Firebase)
(function(global){
  // ---- Firebase config ----
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
  if(!firebase.apps.length) firebase.initializeApp(cfg);
  const db = firebase.database();
  const auth = firebase.auth();

  // ---- State ----
  let _guestObj = null, _guestKey = null, _uiStep = "step1";

  // ---- Utility ----
  function el(id){ return document.getElementById(id);}
  function qs(name){
    const p={};window.location.search.replace(/[?&]+([^=&]+)=([^&]*)/gi,
      (m,k,v)=>p[decodeURIComponent(k)]=decodeURIComponent(v));return p[name]||null;
  }
  function readFields(){
    return {
      custName:el("custName")?.value||"",
      custPhone:el("custPhone")?.value||"",
      currentCarrier:el("currentCarrierSel")?.value||"",
      numLines:el("numLines")?.value||"",
      coverageZip:el("coverageZip")?.value||"",
      solutionText:el("solutionText")?.value||""
    };
  }
  function writeFields(g){
    if(el("custName"))el("custName").value=g.custName||"";
    if(el("custPhone"))el("custPhone").value=g.custPhone||"";
    if(el("currentCarrierSel"))el("currentCarrierSel").value=g.currentCarrier||"";
    if(el("numLines"))el("numLines").value=g.numLines||"";
    if(el("coverageZip"))el("coverageZip").value=g.coverageZip||"";
    if(el("solutionText"))el("solutionText").value=(g.solution?.text)||"";
  }
  function saveLocalKey(k){ try{localStorage.setItem("last_guestinfo_key",k||"");}catch(_){}}
  function initialStep(g){ // decide which form to show
    if((g?.custName||g?.custPhone))return "step2";
    if(g?.solution?.text) return "step3";
    return "step1";
  }

  // ---- Nav UI ----
  function ensureStepNav(){
    if(el("gp-step-nav"))return;
    const nav=document.createElement("div");
    nav.id="gp-step-nav";
    nav.className="gp-step-nav";
    nav.innerHTML=`
      <button type="button" data-step="step1">1. Customer</button>
      <button type="button" data-step="step2">2. Evaluate</button>
      <button type="button" data-step="step3">3. Solution</button>`;
    document.body.insertBefore(nav, document.body.firstChild);
    nav.addEventListener("click",e=>{
      const btn=e.target.closest("button[data-step]"); if(!btn)return;
      navHandler(btn.dataset.step);
    });
  }
  function navHandler(step){
    _uiStep=step;
    markStepActive(step);
    gotoStep(step);
  }
  function markStepActive(step){
    const nav=el("gp-step-nav"); if(!nav)return;
    [...nav.querySelectorAll("button")].forEach(btn=>{
      btn.classList.toggle("active",btn.dataset.step===step);
    });
  }
  function gotoStep(step){
    ["step1","step2","step3"].forEach(s=>{
      if(el(`${s}Form`)){
        if(s===step)el(`${s}Form`).classList.remove("hidden");
        else el(`${s}Form`).classList.add("hidden");
      }
    });
  }

  // ---- Save ----
  async function saveGuestNow(){
    const f=readFields(),uid=auth.currentUser?.uid||null,now=Date.now();
    if(!_guestKey){
      // create
      const payload={
        custName:f.custName,custPhone:f.custPhone,
        currentCarrier:f.currentCarrier,numLines:f.numLines,coverageZip:f.coverageZip,
        submittedAt:now,userUid:uid,status:"new",
        solution:f.solutionText?{text:f.solutionText,completedAt:now}:null
      };
      try{
        const pushRef=await db.ref("guestinfo").push(payload);
        _guestKey=pushRef.key; _guestObj=payload;
        saveLocalKey(_guestKey);
      }catch(err){alert("Save error");return;}
    }else{
      // update
      const updates={};
      ["custName","custPhone","currentCarrier","numLines","coverageZip"].forEach(k=>{
        updates[`guestinfo/${_guestKey}/${k}`]=f[k]||"";
      });
      updates[`guestinfo/${_guestKey}/solution`]=f.solutionText?{text:f.solutionText,completedAt:now}:null;
      updates[`guestinfo/${_guestKey}/updatedAt`]=now;
      try{
        await db.ref().update(updates);
        Object.assign(_guestObj,f);
      }catch(err){alert("Save error");return;}
    }
    alert("Saved.");
  }

  // ---- Context Loader ----
  async function loadContext(){
    const gid=qs("gid")||localStorage.getItem("last_guestinfo_key");
    if(gid){
      const snap=await db.ref("guestinfo/"+gid).get();
      if(snap.exists()){
        _guestObj=snap.val(); _guestKey=gid;
        saveLocalKey(gid);
        _uiStep=initialStep(_guestObj);
        writeFields(_guestObj);
        gotoStep(_uiStep);
        markStepActive(_uiStep);
        return;
      }
    }
    // new guest
    _guestObj={}; _guestKey=null; _uiStep="step1";
    gotoStep(_uiStep); markStepActive(_uiStep);
  }

  // ---- Basic Auth overlay ----
  function showAuthOverlay(){
    if(el("gp-auth-overlay"))return;
    const div=document.createElement("div");
    div.id="gp-auth-overlay";
    div.style.cssText="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.8);color:#fff;z-index:9999;font-size:1.1rem;text-align:center;padding:1rem;";
    div.innerHTML=`<div><p>Please sign in to continue.</p></div>`;
    document.body.appendChild(div);
  }

  // ---- Auth ----
  auth.onAuthStateChanged(async user=>{
    if(!user){ showAuthOverlay(); return; }
    const ov=el("gp-auth-overlay"); if(ov)ov.remove();
    ensureStepNav();
    await loadContext();
    // Submit handlers
    ["step1Form","step2Form","step3Form"].forEach((fid,idx)=>{
      const frm=el(fid); if(!frm)return;
      frm.addEventListener("submit",async e=>{
        e.preventDefault();
        await saveGuestNow();
        if(idx<2){ _uiStep="step"+(idx+2); markStepActive(_uiStep); gotoStep(_uiStep);}
      });
    });
  });

  // ---- Public surface ----
  const gpBasic = {
    get guestKey(){return _guestKey;},
    get guest(){return _guestObj;},
    get uiStep(){return _uiStep;},
    save:saveGuestNow,
    sync:writeFields,
    goto:navHandler,
    open:loadContext
  };
  global.gpBasic = gpBasic;
  global.gpApp = {
    get guestKey(){ return gpBasic.guestKey; },
    get guest(){ return gpBasic.guest; },
    get uiStep(){ return gpBasic.uiStep; },
    saveNow: gpBasic.save,
    syncUi: gpBasic.sync,
    gotoStep: gpBasic.goto
  };
})(window);