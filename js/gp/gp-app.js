// gp-app-min.js -- Minimal Guest Portal logic (depends on Firebase; optional gpCore)
(function(global){
  /* ------------------------------------------------------------------ Firebase */
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
  if(!firebase.apps.length) firebase.initializeApp(cfg);
  const db   = firebase.database();
  const auth = firebase.auth();

  /* ------------------------------------------------------------------ State */
  let _guestObj = null;
  let _guestKey = null;
  let _uiStep   = "step1";

  /* ------------------------------------------------------------------ Utils */
  const el = id => document.getElementById(id);
  function qs(name){
    const p={};
    window.location.search.replace(/[?&]+([^=&]+)=([^&]*)/gi,(m,k,v)=>{
      p[decodeURIComponent(k)]=decodeURIComponent(v);
    });
    return p[name]||null;
  }
  function digitsOnly(s){ return (s||"").replace(/\D+/g,""); }

  /* ------------------------------------------------------------------ Field IO */
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

  /* ------------------------------------------------------------------ Progress (optional) */
  function ensureProgressBar(){
    if(el("gp-progress")) return;
    const bar=document.createElement("div");
    bar.id="gp-progress";
    bar.className="gp-progress";
    bar.innerHTML=`
      <div class="gp-progress-label">
        Pitch Quality: <span id="gp-progress-pct">0%</span>
      </div>
      <div class="gp-progress-bar">
        <div id="gp-progress-fill" class="gp-progress-fill" style="width:0%;"></div>
      </div>`;
    document.body.insertBefore(bar, document.body.firstChild);
  }
  function _progressColor(fillEl,p){
    fillEl.className="gp-progress-fill";
    if(p>=75)fillEl.classList.add("gp-progress-green");
    else if(p>=40)fillEl.classList.add("gp-progress-yellow");
    else fillEl.classList.add("gp-progress-red");
  }
  function setProgress(p){
    ensureProgressBar();
    const pctEl=el("gp-progress-pct");
    const fillEl=el("gp-progress-fill");
    const pct=Math.max(0,Math.min(100,Math.round(p)));
    if(pctEl)pctEl.textContent=pct+"%";
    if(fillEl){ fillEl.style.width=pct+"%"; _progressColor(fillEl,pct); }
  }
  function updateProgressFromGuest(g){
    if(!global.gpCore){ setProgress(0); return; }
    const comp=global.gpCore.computePitchFull(g||{});
    setProgress(comp.pctFull||0);
  }

  /* ------------------------------------------------------------------ Local key */
  function saveLocalKey(k){ try{localStorage.setItem("last_guestinfo_key",k||"");}catch(_){} }

  /* ------------------------------------------------------------------ Initial step */
  function initialStep(g){
    if(global.gpCore){
      const s=global.gpCore.detectStatus(g);
      if(s==="proposal")return"step3";
      if(s==="working")return"step2";
      // "new" falls through
    }else{
      if((g?.custName||g?.custPhone))return"step2";
      if(g?.solution?.text)return"step3";
    }
    return"step1";
  }

  /* ------------------------------------------------------------------ Nav UI */
  function ensureStepNav(){
    if(el("gp-step-nav"))return;
    const nav=document.createElement("div");
    nav.id="gp-step-nav";
    nav.className="gp-step-nav";
    nav.innerHTML=`
      <button type="button" data-step="step1">1. Customer</button>
      <button type="button" data-step="step2">2. Evaluate</button>
      <button type="button" data-step="step3">3. Solution</button>`;
    const hook=el("gp-progress")||document.body.firstChild;
    hook.parentNode.insertBefore(nav,hook.nextSibling);
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
    [...nav.querySelectorAll("button")].forEach(b=>b.classList.toggle("active",b.dataset.step===step));
  }
  function gotoStep(step){
    ["step1","step2","step3"].forEach(s=>{
      const f=el(`${s}Form`); if(!f)return;
      if(s===step)f.classList.remove("hidden"); else f.classList.add("hidden");
    });
  }

  /* ------------------------------------------------------------------ Save */
  async function saveGuestNow(){
    const f=readFields(),uid=auth.currentUser?.uid||null,now=Date.now();
    const status = global.gpCore
      ? global.gpCore.detectStatus({..._guestObj,...f,solution:{text:f.solutionText}})
      : "new";

    if(!_guestKey){
      const payload={
        custName:f.custName,
        custPhone:f.custPhone,
        currentCarrier:f.currentCarrier,
        numLines:f.numLines,
        coverageZip:f.coverageZip,
        submittedAt:now,
        userUid:uid,
        status,
        solution:f.solutionText?{text:f.solutionText,completedAt:now}:null
      };
      try{
        const pushRef=await db.ref("guestinfo").push(payload);
        _guestKey=pushRef.key;
        _guestObj=payload;
        saveLocalKey(_guestKey);
      }catch(err){alert("Save error");return;}
    }else{
      const updates={};
      ["custName","custPhone","currentCarrier","numLines","coverageZip","status"]
        .forEach(k=>{
          let v;
          if(k==="status") v=status;
          else v=f[k]||"";
          updates[`guestinfo/${_guestKey}/${k}`]=v;
        });
      updates[`guestinfo/${_guestKey}/solution`]=
        f.solutionText?{text:f.solutionText,completedAt:now}:null;
      updates[`guestinfo/${_guestKey}/updatedAt`]=now;
      try{
        await db.ref().update(updates);
        Object.assign(_guestObj,{
          custName:f.custName,
          custPhone:f.custPhone,
          currentCarrier:f.currentCarrier,
          numLines:f.numLines,
          coverageZip:f.coverageZip,
          status,
          solution:f.solutionText?{text:f.solutionText,completedAt:now}:null
        });
      }catch(err){alert("Save error");return;}
    }
    updateProgressFromGuest(_guestObj);
    alert("Saved.");
  }

  /* ------------------------------------------------------------------ Context Loader */
  async function loadContext(){
    const gid=qs("gid")||localStorage.getItem("last_guestinfo_key");
    if(gid){
      const snap=await db.ref("guestinfo/"+gid).get();
      if(snap.exists()){
        let g=snap.val();
        g = global.gpCore ? global.gpCore.normGuest(g) : g;
        _guestObj=g; _guestKey=gid;
        saveLocalKey(gid);
        _uiStep=initialStep(_guestObj);
        writeFields(_guestObj);
        gotoStep(_uiStep);
        markStepActive(_uiStep);
        updateProgressFromGuest(_guestObj);
        return;
      }
    }
    // new
    _guestObj={};
    _guestKey=null;
    _uiStep="step1";
    gotoStep(_uiStep);
    markStepActive(_uiStep);
    updateProgressFromGuest(_guestObj);
  }

  /* ------------------------------------------------------------------ Auth overlay */
  function showAuthOverlay(){
    if(el("gp-auth-overlay"))return;
    const div=document.createElement("div");
    div.id="gp-auth-overlay";
    div.style.cssText="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.8);color:#fff;z-index:9999;font-size:1.1rem;text-align:center;padding:1rem;";
    div.innerHTML=`<div><p>Please sign in to continue.</p></div>`;
    document.body.appendChild(div);
  }

  /* ------------------------------------------------------------------ Auth */
  auth.onAuthStateChanged(async user=>{
    if(!user){ showAuthOverlay(); return; }
    const ov=el("gp-auth-overlay"); if(ov)ov.remove();
    ensureProgressBar();
    ensureStepNav();
    await loadContext();

    // live preview progress
    ["custName","custPhone","currentCarrierSel","numLines","coverageZip","solutionText"]
      .forEach(id=>{
        const field=el(id); if(!field)return;
        const ev=(field.tagName==="SELECT"?"change":"input");
        field.addEventListener(ev,()=>{
          const live={..._guestObj,...readFields(),solution:{text:el("solutionText")?.value||""}};
          updateProgressFromGuest(live);
        });
      });

    // submit handlers
    ["step1Form","step2Form","step3Form"].forEach((fid,idx)=>{
      const frm=el(fid); if(!frm)return;
      frm.addEventListener("submit",async e=>{
        e.preventDefault();
        await saveGuestNow();
        if(idx<2){ _uiStep="step"+(idx+2); markStepActive(_uiStep); gotoStep(_uiStep);}
      });
    });
  });

  /* ------------------------------------------------------------------ Public */
  const gpBasic = {
    get guestKey(){return _guestKey;},
    get guest(){return _guestObj;},
    get uiStep(){return _uiStep;},
    save:saveGuestNow,
    sync:writeFields,
    goto:navHandler,
    open:loadContext
  };
  global.gpBasic = gpBasic;       // light surface
  global.gpApp   = {              // compatibility surface for old code
    get guestKey(){ return gpBasic.guestKey; },
    get guest(){ return gpBasic.guest; },
    get uiStep(){ return gpBasic.uiStep; },
    saveNow: gpBasic.save,
    syncUi:  gpBasic.sync,
    gotoStep:gpBasic.goto
  };

})(window);
