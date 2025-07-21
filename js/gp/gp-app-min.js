// gp-app-min.js -- Guest Portal controller with dynamic Step 2 support and progress fix
// Place at ../js/gp/gp-app-min.js, loaded after Firebase SDKs, gp-questions.js, gp-core.js, and gp-ui-render.js

(function(global){
  // ───────────────────────────────────────────────────────────────────────────
  // Firebase setup (app-compat)
  // ───────────────────────────────────────────────────────────────────────────
  const cfg = global.GP_FIREBASE_CONFIG || {
    apiKey: "AIzaSyD9fILTNJQ0wsPftUsPkdLrhRGV9dslMzE",
    authDomain: "osls-644fd.firebaseapp.com",
    databaseURL: "https://osls-644fd-default-rtdb.firebaseio.com",
    projectId: "osls-644fd",
    storageBucket: "osls-644fd.appspot.com",
    messagingSenderId: "798578046321",
    appId: "1:798578046321:web:1a2bcd3ef4567gh8i9jkl",
    measurementId: "G-XXXXXXX"
  };
  if (!firebase.apps.length) firebase.initializeApp(cfg);
  const db   = firebase.database();
  const auth = firebase.auth();

  // ───────────────────────────────────────────────────────────────────────────
  // State
  // ───────────────────────────────────────────────────────────────────────────
  let _guestObj = null;
  let _guestKey = null;
  let _uiStep   = "step1";

  // ───────────────────────────────────────────────────────────────────────────
  // DOM helpers
  // ───────────────────────────────────────────────────────────────────────────
  const el = id => document.getElementById(id);

  // ───────────────────────────────────────────────────────────────────────────
  // Read all form fields (including dynamic Step 2)
  // ───────────────────────────────────────────────────────────────────────────
  function readFields() {
    const out = {
      custName:  el("custName")?.value.trim()  || "",
      custPhone: el("custPhone")?.value.trim() || ""
    };
    (global.gpQuestions||[]).forEach(q => {
      const f = el(q.id);
      if (!f) return;
      out[q.id] = f.value.trim();
    });
    out.solutionText = el("solutionText")?.value.trim() || "";
    return out;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Populate fields from guest object
  // ───────────────────────────────────────────────────────────────────────────
  function writeFields(g) {
    if (el("custName"))     el("custName").value     = g.custName || "";
    if (el("custPhone"))    el("custPhone").value    = g.custPhone || "";
    (global.gpQuestions||[]).forEach(q => {
      const f = el(q.id);
      if (!f) return;
      f.value = g[q.id] || "";
    });
    if (el("solutionText")) el("solutionText").value = g.solution?.text || "";
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Progress bar utilities
  // ───────────────────────────────────────────────────────────────────────────
  function ensureProgressBar(){
    if (el("gp-progress")) return;
    const bar = document.createElement("div");
    bar.id = "gp-progress"; bar.className = "gp-progress";
    bar.innerHTML = `
      <div class="gp-progress-label">Progress: <span id="gp-progress-pct">0%</span></div>
      <div class="gp-progress-bar">
        <div id="gp-progress-fill" class="gp-progress-fill" style="width:0%;"></div>
      </div>`;
    document.body.insertBefore(bar, document.body.firstChild);
  }
  function _progressColor(fillEl, p){
    fillEl.className = "gp-progress-fill";
    if (p >= 75)      fillEl.classList.add("gp-progress-green");
    else if (p >= 40) fillEl.classList.add("gp-progress-yellow");
    else              fillEl.classList.add("gp-progress-red");
  }
  function setProgress(p){
    ensureProgressBar();
    const pctEl  = el("gp-progress-pct");
    const fillEl = el("gp-progress-fill");
    const pct    = Math.max(0, Math.min(100, Math.round(p)));
    if (pctEl)  pctEl.textContent = pct + "%";
    if (fillEl){
      fillEl.style.width = pct + "%";
      _progressColor(fillEl, pct);
    }
  }

  function updateProgressFromGuest(g) {
    if (!global.gpCore) { setProgress(0); return; }
    const comp = global.gpCore.computePitchFull(g || {});
    setProgress(comp.pctFull || 0);
    if (_guestKey) {
      db.ref(`guestinfo/${_guestKey}/completionPct`)
        .set(Math.round(comp.pctFull))
        .catch(()=>{/* silent */});
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Local key persistence
  // ───────────────────────────────────────────────────────────────────────────
  function saveLocalKey(k) {
    try { localStorage.setItem("last_guestinfo_key", k || ""); }
    catch(_) {}
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Determine initial UI step
  // ───────────────────────────────────────────────────────────────────────────
  function initialStep(g) {
    if (global.gpCore) {
      const s = global.gpCore.detectStatus(g);
      return (s === "proposal" ? "step3" : (s === "working" ? "step2" : "step1"));
    }
    return "step1";
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Step navigation UI
  // ───────────────────────────────────────────────────────────────────────────
  function ensureStepNav(){
    if (el("gp-step-nav")) return;
    const nav = document.createElement("div");
    nav.id = "gp-step-nav"; nav.className = "gp-step-nav";
    nav.innerHTML = `
      <button data-step="step1">1. Customer</button>
      <button data-step="step2">2. Evaluate</button>
      <button data-step="step3">3. Solution</button>`;
    document.body.insertBefore(nav, document.body.firstChild);
    nav.addEventListener("click", e => {
      const b = e.target.closest("button[data-step]");
      if (!b) return;
      navHandler(b.dataset.step);
    });
  }
  function navHandler(step){
    _uiStep = step; markStepActive(step); gotoStep(step);
  }
  function markStepActive(step){
    const nav = el("gp-step-nav"); if (!nav) return;
    nav.querySelectorAll("button[data-step]").forEach(b=>
      b.classList.toggle("active", b.dataset.step===step)
    );
  }
  function gotoStep(step){
    ["step1","step2","step3"].forEach(s=>{
      const f = el(s+"Form"); if (!f) return;
      f.classList.toggle("hidden", s!==step);
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Create or update guest record
  // ───────────────────────────────────────────────────────────────────────────
  async function saveGuestNow() {
    const f      = readFields();
    const uid    = auth.currentUser?.uid || null;
    const now    = Date.now();
    const status = global.gpCore
      ? global.gpCore.detectStatus({..._guestObj, ...f, solution:{ text: f.solutionText }})
      : "new";

    // bundle Step2 answers
    const evaluate = {};
    (global.gpQuestions||[]).forEach(q => evaluate[q.id] = f[q.id] || "");

    if (!_guestKey) {
      // create
      const payload = {
        custName:  f.custName,
        custPhone: f.custPhone,
        evaluate,
        submittedAt: now,
        userUid:    uid,
        status,
        solution:   f.solutionText ? { text:f.solutionText, completedAt: now } : null
      };
      try {
        const refPush = await db.ref("guestinfo").push(payload);
        _guestKey = refPush.key;
        _guestObj = { ...payload };
        saveLocalKey(_guestKey);
      } catch {
        alert("Save error");
        return;
      }
    } else {
      // update
      const updates = {};
      updates[`guestinfo/${_guestKey}/custName`]    = f.custName;
      updates[`guestinfo/${_guestKey}/custPhone`]   = f.custPhone;
      updates[`guestinfo/${_guestKey}/evaluate`]    = evaluate;
      updates[`guestinfo/${_guestKey}/status`]      = status;
      updates[`guestinfo/${_guestKey}/updatedAt`]   = now;
      updates[`guestinfo/${_guestKey}/solution`]    = f.solutionText
        ? { text:f.solutionText, completedAt: _guestObj.solution?.completedAt || now }
        : null;
      try {
        await db.ref().update(updates);
        Object.assign(_guestObj, { ...f, status, evaluate });
      } catch {
        alert("Save error");
        return;
      }
    }

    updateProgressFromGuest(_guestObj);
    alert("Saved.");
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Load existing guest or reset to new
  // ───────────────────────────────────────────────────────────────────────────
  async function loadContext() {
    const gid = new URLSearchParams(window.location.search).get("gid")
             || localStorage.getItem("last_guestinfo_key");
    if (gid) {
      const snap = await db.ref(`guestinfo/${gid}`).get();
      if (snap.exists()) {
        let g = snap.val();
        if (typeof g.completionPct === "number") {
          setProgress(g.completionPct);
        }
        g = global.gpCore ? global.gpCore.normGuest(g) : g;
        _guestObj = g;
        _guestKey = gid;
        saveLocalKey(gid);
        _uiStep = initialStep(_guestObj);
        writeFields(_guestObj);
        gotoStep(_uiStep);
        markStepActive(_uiStep);

        // *** <-- compute progress on load ***
        updateProgressFromGuest(_guestObj);

        // realtime updates
        db.ref(`guestinfo/${_guestKey}/completionPct`)
          .on("value", snap => {
            const v = snap.val();
            if (typeof v === "number") setProgress(v);
          });
        return;
      }
    }
    // new guest
    _guestObj = {};
    _guestKey = null;
    _uiStep   = "step1";
    writeFields(_guestObj);
    gotoStep(_uiStep);
    markStepActive(_uiStep);
    updateProgressFromGuest(_guestObj);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Auth & init
  // ───────────────────────────────────────────────────────────────────────────
  auth.onAuthStateChanged(async user => {
    if (!user) {
      if (!el("gp-auth-overlay")) {
        const ov = document.createElement("div");
        ov.id = "gp-auth-overlay";
        ov.style = "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;"
                 + "background:rgba(0,0,0,.8);color:#fff;font-size:1.1rem;text-align:center;padding:1rem;";
        ov.textContent = "Please sign in to continue.";
        document.body.appendChild(ov);
      }
      return;
    }
    const ov = el("gp-auth-overlay"); if (ov) ov.remove();

    ensureProgressBar();
    ensureStepNav();
    await loadContext();

    // live progress on input
    ["custName","custPhone","solutionText"]
      .forEach(id => {
        const f = el(id); if (!f) return;
        const ev = f.tagName==="SELECT" ? "change" : "input";
        f.addEventListener(ev, () => {
          updateProgressFromGuest({ ..._guestObj, ...readFields(), solution:{ text: el("solutionText")?.value||"" } });
        });
      });
    (global.gpQuestions||[]).forEach(q => {
      const f = el(q.id); if (!f) return;
      const ev = f.tagName==="SELECT" ? "change" : "input";
      f.addEventListener(ev, () => {
        updateProgressFromGuest({ ..._guestObj, ...readFields(), solution:{ text: el("solutionText")?.value||"" } });
      });
    });

    // form submits
    ["step1Form","step2Form","step3Form"].forEach((fid, idx) => {
      const frm = el(fid); if (!frm) return;
      frm.addEventListener("submit", async e => {
        e.preventDefault();
        await saveGuestNow();
        if (idx < 2) {
          _uiStep = "step" + (idx+2);
          markStepActive(_uiStep);
          gotoStep(_uiStep);
        }
      });
    });
  });

  // Public API
  global.gpBasic = {
    get guestKey(){ return _guestKey; },
    get guest(){ return _guestObj; },
    get uiStep(){ return _uiStep; },
    save: saveGuestNow,
    goto: navHandler,
    open: loadContext
  };
  global.gpApp = {
    get guestKey(){ return gpBasic.guestKey; },
    get guest(){ return gpBasic.guest; },
    get uiStep(){ return gpBasic.uiStep; },
    saveNow: gpBasic.save,
    gotoStep: gpBasic.goto,
    sync:    writeFields
  };

})(window);