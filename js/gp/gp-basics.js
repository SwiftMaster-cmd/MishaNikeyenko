/* gp-guest-portal.js -- Full merge of gp-app-min.js + gp-basic.js */

(function(global){
  /* Firebase config and init */
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
  const db = firebase.database();
  const auth = firebase.auth();

  /* State */
  let _guestObj = null;
  let _guestKey = null;
  let _uiStep = "step1";
  let _entryId = null;
  let _handoff = undefined;

  /* DOM Helpers */
  const el = id => document.getElementById(id);
  function qs(name){
    const params = {};
    window.location.search.replace(/[?&]+([^=&]+)=([^&]*)/gi, (m,k,v)=>{
      params[decodeURIComponent(k)] = decodeURIComponent(v);
    });
    return params[name] || null;
  }

  /* Core utilities fallback */
  const core = global.gpCore || {};
  const detectStatus = core.detectStatus || (g => {
    if(g?.solution?.text) return "proposal";
    if(g?.evaluate && Object.keys(g.evaluate).length) return "working";
    return "new";
  });
  const hasPrefilledStep1 = core.hasPrefilledStep1 || (g => !!(g?.custName || g?.custPhone));
  const normGuest = core.normGuest || (g => g || {});

  /* Field IO */
  function readFields(){
    return {
      custName: el("custName")?.value || "",
      custPhone: el("custPhone")?.value || "",
      currentCarrier: el("currentCarrierSel")?.value || "",
      numLines: el("numLines")?.value || "",
      coverageZip: el("coverageZip")?.value || "",
      solutionText: el("solutionText")?.value || ""
    };
  }
  function writeFields(g){
    if(el("custName")) el("custName").value = g.custName || "";
    if(el("custPhone")) el("custPhone").value = g.custPhone || "";
    const e = g.evaluate || {};
    if(el("currentCarrierSel")) el("currentCarrierSel").value = e.currentCarrier || "";
    if(el("numLines")) el("numLines").value = e.numLines || "";
    if(el("coverageZip")) el("coverageZip").value = e.coverageZip || "";
    if(el("solutionText")) el("solutionText").value = (g.solution?.text) || "";
    if(global.gpUIAdv) global.gpUIAdv.injectPrefillSummary(g.custName, g.custPhone);
  }

  /* Save last guest key to localStorage */
  function saveLocalKey(k){ try{ localStorage.setItem("last_guestinfo_key", k || ""); } catch {} }

  /* Navigation */
  function ensureStepNav(){
    if(el("gp-step-nav")) return;
    const nav = document.createElement("div");
    nav.id = "gp-step-nav";
    nav.className = "gp-step-nav";
    nav.innerHTML = `
      <button type="button" data-step="step1">1. Customer</button>
      <button type="button" data-step="step2">2. Evaluate</button>
      <button type="button" data-step="step3">3. Solution</button>`;
    document.body.insertBefore(nav, document.body.firstChild);
    nav.addEventListener("click", e => {
      const btn = e.target.closest("button[data-step]");
      if (!btn) return;
      navHandler(btn.dataset.step);
    });
  }
  function navHandler(step){
    _uiStep = step;
    markStepActive(step);
    gotoStep(step);
  }
  function markStepActive(step){
    const nav = el("gp-step-nav");
    if(!nav) return;
    [...nav.querySelectorAll("button")].forEach(btn => {
      btn.classList.toggle("active", btn.dataset.step === step);
    });
  }
  function gotoStep(step){
    ["step1","step2","step3"].forEach(s => {
      const frm = el(`${s}Form`);
      if(!frm) return;
      frm.classList.toggle("hidden", s !== step);
    });
    if(global.gpUIAdv && typeof global.gpUIAdv.gotoStep === "function")
      global.gpUIAdv.gotoStep(step);
  }

  /* Determine initial step */
  function initialStep(g, explicit){
    if(["step1","step2","step3"].includes(explicit)) return explicit;
    const st = detectStatus(g) || "new";
    if(st === "proposal" || st === "sold") return "step3";
    if(hasPrefilledStep1(g)) return "step2";
    return "step1";
  }

  /* Consume handoff once */
  function consumeHandoff(){
    if(_handoff !== undefined) return _handoff;
    try {
      if(global.gpHandoffLite && typeof global.gpHandoffLite.consumePrefill === "function"){
        _handoff = global.gpHandoffLite.consumePrefill();
      } else if(global.gpHandoff && typeof global.gpHandoff.consumePrefill === "function"){
        _handoff = global.gpHandoff.consumePrefill();
      } else {
        _handoff = null;
      }
    } catch (e) {
      console.warn("[gp-guest-portal] handoff error", e);
      _handoff = null;
    }
    return _handoff;
  }

  /* Build guest object from DOM */
  function buildGuestFromDom(){
    const f = readFields();
    const evaluate = {
      currentCarrier: f.currentCarrier || "",
      numLines: f.numLines || "",
      coverageZip: f.coverageZip || ""
    };
    const sol = f.solutionText ? {text: f.solutionText} : null;
    const g = {
      custName: f.custName || "",
      custPhone: f.custPhone || "",
      evaluate,
      solution: sol,
      prefilledStep1: hasPrefilledStep1({custName: f.custName, custPhone: f.custPhone})
    };
    g.status = detectStatus(g);
    return g;
  }

  /* Save guest (create or update) */
  async function saveGuestNow(){
    const g = buildGuestFromDom();
    const uid = auth.currentUser?.uid || null;
    const now = Date.now();

    if(!_guestKey){
      // create
      const payload = {
        custName: g.custName,
        custPhone: g.custPhone,
        evaluate: g.evaluate,
        submittedAt: now,
        userUid: uid,
        status: g.status,
        prefilledStep1: g.prefilledStep1
      };
      if(g.solution?.text) payload.solution = {text: g.solution.text, completedAt: now};
      if(_entryId) payload.source = {type: "guestForm", entryId: _entryId};
      try {
        const pushRef = await db.ref("guestinfo").push(payload);
        _guestKey = pushRef.key;
        _guestObj = payload;
        saveLocalKey(_guestKey);
      } catch (err) {
        alert("Save error (create)");
        console.error(err);
        return;
      }
    } else {
      // update
      const updates = {};
      updates[`guestinfo/${_guestKey}/custName`] = g.custName;
      updates[`guestinfo/${_guestKey}/custPhone`] = g.custPhone;
      updates[`guestinfo/${_guestKey}/evaluate`] = g.evaluate;
      updates[`guestinfo/${_guestKey}/status`] = g.status;
      updates[`guestinfo/${_guestKey}/updatedAt`] = now;
      if(g.prefilledStep1) updates[`guestinfo/${_guestKey}/prefilledStep1`] = true;
      updates[`guestinfo/${_guestKey}/solution`] = g.solution?.text
        ? {text: g.solution.text, completedAt: _guestObj?.solution?.completedAt || now}
        : null;
      if(_entryId) updates[`guestinfo/${_guestKey}/source`] = {type: "guestForm", entryId: _entryId};
      try {
        await db.ref().update(updates);
        _guestObj = {..._guestObj, ...g, status: g.status};
      } catch (err) {
        alert("Save error (update)");
        console.error(err);
        return;
      }
    }
    alert("Saved.");
  }

  /* Load context from URL, handoff, localStorage */
  async function loadContext(){
    const gidParam = qs("gid");
    const entryParam = qs("entry");
    const uiStart = qs("uistart");
    const handoff = consumeHandoff();

    // 1) explicit gid param
    if(gidParam){
      const snap = await db.ref("guestinfo/" + gidParam).get();
      if(snap.exists()){
        _guestKey = gidParam;
        _guestObj = normGuest(snap.val());
        if(entryParam && !_guestObj?.source?.entryId){
          db.ref(`guestinfo/${gidParam}/source`).set({type: "guestForm", entryId: entryParam}).catch(() => {});
          _entryId = entryParam;
        }
        saveLocalKey(gidParam);
        _uiStep = initialStep(_guestObj, uiStart || handoff?.uistart);
        writeFields(_guestObj);
        gotoStep(_uiStep);
        markStepActive(_uiStep);
        return;
      }
    }

    // 2) handoff gid no param
    if(handoff?.gid){
      const snap = await db.ref("guestinfo/" + handoff.gid).get();
      if(snap.exists()){
        _guestKey = handoff.gid;
        _guestObj = normGuest(snap.val());
        if(!_guestObj.custName && handoff.custName) _guestObj.custName = handoff.custName;
        if(!_guestObj.custPhone && handoff.custPhone) _guestObj.custPhone = handoff.custPhone;
        _entryId = handoff.entry || null;
        saveLocalKey(_guestKey);
        _uiStep = initialStep(_guestObj, uiStart || handoff.uistart);
        writeFields(_guestObj);
        gotoStep(_uiStep);
        markStepActive(_uiStep);
        return;
      }
    }

    // 3) entry param or handoff seed new
    if(entryParam || handoff?.custName || handoff?.custPhone){
      _entryId = entryParam || handoff?.entry || null;
      _guestObj = {
        custName: handoff?.custName || "",
        custPhone: handoff?.custPhone || "",
        evaluate: {},
        solution: null,
        prefilledStep1: hasPrefilledStep1(handoff),
        status: "new"
      };
      _uiStep = initialStep(_guestObj, uiStart || handoff?.uistart);
      writeFields(_guestObj);
      gotoStep(_uiStep);
      markStepActive(_uiStep);
      return;
    }

    // 4) resume last saved
    const last = localStorage.getItem("last_guestinfo_key");
    if(last){
      const snap = await db.ref("guestinfo/" + last).get();
      if(snap.exists()){
        _guestKey = last;
        _guestObj = normGuest(snap.val());
        _uiStep = initialStep(_guestObj, uiStart);
        writeFields(_guestObj);
        gotoStep(_uiStep);
        markStepActive(_uiStep);
        return;
      } else {
        localStorage.removeItem("last_guestinfo_key");
      }
    }

    // 5) new fallback
    _guestObj = {status:"new", evaluate:{}, solution:null};
    _guestKey = null;
    _uiStep = "step1";
    gotoStep(_uiStep);
    markStepActive(_uiStep);
  }

  /* Auth overlay */
  function showAuthOverlay(){
    if(el("gp-auth-overlay")) return;
    const div = document.createElement("div");
    div.id = "gp-auth-overlay";
    div.style.cssText = "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.8);color:#fff;z-index:9999;font-size:1.1rem;text-align:center;padding:1rem;";
    div.innerHTML = `<div><p>Please sign in to continue.</p></div>`;
    document.body.appendChild(div);
  }

  /* Auth state change listener */
  auth.onAuthStateChanged(async user => {
    if(!user){
      showAuthOverlay();
      return;
    }
    const ov = el("gp-auth-overlay");
    if(ov) ov.remove();
    ensureStepNav();
    await loadContext();

    // Add submit handlers for forms step1-3
    ["step1Form", "step2Form", "step3Form"].forEach((fid, idx) => {
      const frm = el(fid);
      if(!frm) return;
      frm.addEventListener("submit", async e => {
        e.preventDefault();
        await saveGuestNow();
        if(idx < 2){
          _uiStep = "step" + (idx + 2);
          markStepActive(_uiStep);
          gotoStep(_uiStep);
        }
      });
    });
  });

  /* Public API */
  const gpBasic = {
    get guestKey(){ return _guestKey; },
    get guest(){ return _guestObj; },
    get uiStep(){ return _uiStep; },
    save: saveGuestNow,
    sync: () => writeFields(_guestObj || {}),
    goto: navHandler,
    open: loadContext
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