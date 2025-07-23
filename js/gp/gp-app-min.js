// gp-app-min.js -- Improved save/load for Step 2 (nested "evaluate"), real-time progress listener, and debug logs
(function(global){
  // ------ Firebase Init ------
  const cfg = global.GP_FIREBASE_CONFIG || {
    apiKey: "AIzaSyD9fILTNJQ0wsPftUsPkdLrhRG9dslMzE",
    authDomain: "osls-644fd.firebaseapp.com",
    databaseURL: "https://osls-644fd-default-rtdb.firebaseio.com",
    projectId: "osls-644fd",
    storageBucket: "osls-644fd.appspot.com",
    messagingSenderId: "798578046321",
    appId: "1:798578046321:web:1a2bcd3ef4567gh8i9jkl",
    measurementId: "G-XXXXXXX"
  };
  if (!firebase.apps.length) {
    console.debug('[gp-app] initializing Firebase');
    firebase.initializeApp(cfg);
  }
  const db   = firebase.database();
  const auth = firebase.auth();

  // ------ State ------
  let _guestObj = null;
  let _guestKey = null;
  let _uiStep   = "step1";
  const el = id => document.getElementById(id);

  // ------ Read all form fields (including Step 2) ------
  function readFields() {
    const out = {
      custName:    el("custName")?.value.trim()  || "",
      custPhone:   el("custPhone")?.value.trim() || "",
      solutionText: el("solutionText")?.value.trim() || ""
    };
    (global.gpQuestions||[]).forEach(q => {
      const f = el(q.id);
      if (!f) return;
      out[q.id] = (f.value || "").toString().trim();
    });
    return out;
  }

  // ------ Populate UI from guest object ------
  function writeFields(g) {
    if (el("custName"))  el("custName").value  = g.custName   || "";
    if (el("custPhone")) el("custPhone").value = g.custPhone  || "";
    (global.gpQuestions||[]).forEach(q => {
      const f = el(q.id);
      if (!f) return;
      // prefer nested g.evaluate[q.id], fallback to top-level
      const val = g.evaluate?.[q.id] ?? g[q.id] ?? "";
      f.value = val;
    });
    if (el("solutionText")) el("solutionText").value = g.solution?.text || "";
  }

  // ------ Build global.answers from loaded guest for gp-ui-render ------
  function loadAnswersFromGuest(g) {
    console.debug('[gp-app] loadAnswersFromGuest', g.evaluate);
    const ans = global.answers;
    if (!ans) return;
    Object.keys(ans).forEach(k => delete ans[k]);
    if (g.custName)  ans["custName"] = { value:g.custName,  points:8 };
    if (g.custPhone) ans["custPhone"] = { value:g.custPhone, points:7 };
    if (g.evaluate) {
      (global.gpQuestions||[]).forEach(q => {
        const v = g.evaluate[q.id] || "";
        if (v) ans[q.id] = { value:v, points:q.weight };
      });
    }
    if (g.solution?.text) ans["solutionText"] = { value:g.solution.text, points:25 };
  }

  // ------ Update progress bar from remote completionPct ------
  function updateProgressFromGuest(pct) {
    console.debug('[gp-app] remote completionPct=', pct);
    const lbl = el("progressLabel");
    const bar = el("progressBar");
    if (lbl) lbl.textContent = `${pct}%`;
    if (bar) bar.value = pct;
  }

  // ------ Attach listener for realtime progress updates ------
  function attachCompletionListener() {
    if (!_guestKey) return;
    const ref = db.ref(`guestinfo/${_guestKey}/completionPct`);
    ref.off("value");
    ref.on("value", snap => {
      const pct = snap.val();
      updateProgressFromGuest(typeof pct === "number" ? pct : 0);
    });
    console.debug('[gp-app] attached completionPct listener');
  }

  // ------ Save current form to Firebase ------
  async function saveGuestNow() {
    const f      = readFields();
    const uid    = auth.currentUser?.uid || null;
    const now    = Date.now();
    const status = global.gpCore
      ? global.gpCore.detectStatus({ ..._guestObj, ...f, solution:{ text:f.solutionText } })
      : "new";

    // prepare nested evaluate payload
    const evalData = {};
    (global.gpQuestions||[]).forEach(q => {
      evalData[q.id] = f[q.id] || "";
    });

    console.debug('[gp-app] saveGuestNow:', { guestKey:_guestKey, f, status });

    if (!_guestKey) {
      // first-time push
      const payload = {
        custName:    f.custName,
        custPhone:   f.custPhone,
        evaluate:    evalData,
        status,
        submittedAt: now,
        userUid:     uid,
      };
      if (f.solutionText) {
        payload.solution = { text:f.solutionText, completedAt:now };
      }
      try {
        const newRef = db.ref("guestinfo").push();
        await newRef.set(payload);
        _guestKey = newRef.key;
        _guestObj = payload;
        localStorage.setItem("last_guestinfo_key", _guestKey);
        console.debug('[gp-app] created guest key=', _guestKey);
        attachCompletionListener();
      } catch (err) {
        console.error('[gp-app] error saving new guest', err);
      }

    } else {
      // update existing
      const updates = {
        [`guestinfo/${_guestKey}/custName`]:  f.custName,
        [`guestinfo/${_guestKey}/custPhone`]: f.custPhone,
        [`guestinfo/${_guestKey}/status`]:    status,
        [`guestinfo/${_guestKey}/updatedAt`]: now,
      };
      if (f.solutionText) {
        updates[`guestinfo/${_guestKey}/solution`] = {
          text: f.solutionText,
          completedAt: _guestObj.solution?.completedAt || now
        };
      } else {
        updates[`guestinfo/${_guestKey}/solution`] = null;
      }
      // nested evaluate updates
      Object.entries(evalData).forEach(([k,v]) => {
        updates[`guestinfo/${_guestKey}/evaluate/${k}`] = v;
      });

      try {
        await db.ref().update(updates);
        console.debug('[gp-app] updated guest', updates);
      } catch (err) {
        console.error('[gp-app] error updating guest', err);
      }
    }
  }

  // ------ Load context (either existing guest or fresh) ------
  async function loadContext() {
    const params = new URLSearchParams(window.location.search);
    const gid    = params.get("gid") || localStorage.getItem("last_guestinfo_key");
    console.debug('[gp-app] loadContext gid=', gid);

    if (gid) {
      try {
        const snap = await db.ref(`guestinfo/${gid}`).get();
        if (snap.exists()) {
          let g = snap.val();
          if (global.gpCore) g = global.gpCore.normGuest(g);
          _guestKey = gid;
          _guestObj = g;
          localStorage.setItem("last_guestinfo_key", gid);
          console.debug('[gp-app] loaded guest object', g);

          writeFields(_guestObj);
          loadAnswersFromGuest(_guestObj);

          // determine initial step
          _uiStep = global.gpCore
            ? (global.gpCore.detectStatus(g) === "proposal" ? "step3"
              : (global.gpCore.detectStatus(g) === "working" ? "step2" : "step1"))
            : "step1";
          gotoStep(_uiStep);
          markStepActive(_uiStep);

          if (global.updateTotalPoints) global.updateTotalPoints();
          if (global.updatePitchText)  global.updatePitchText();

          attachCompletionListener();
          return;
        }
        console.warn('[gp-app] no data at key', gid);
      } catch (err) {
        console.error('[gp-app] error fetching guest', err);
      }
    }

    // fallback: new guest
    _guestObj = {};
    _guestKey = null;
    _uiStep   = "step1";
    writeFields(_guestObj);
    loadAnswersFromGuest(_guestObj);
    gotoStep(_uiStep);
    markStepActive(_uiStep);
    if (global.updateTotalPoints) global.updateTotalPoints();
    if (global.updatePitchText)  global.updatePitchText();
    console.debug('[gp-app] initialized fresh context');
  }

  // ------ UI Navigation Helpers (unchanged) ------
  function ensureStepNav() {
    if (el("gp-step-nav")) return;
    const nav = document.createElement("div");
    nav.id = "gp-step-nav"; nav.className = "gp-step-nav";
    nav.innerHTML = `
      <button data-step="step1">1. Customer</button>
      <button data-step="step2">2. Evaluate</button>
      <button data-step="step3">3. Solution</button>`;
    document.body.insertBefore(nav, document.body.firstChild);
    nav.addEventListener("click", e => {
      const btn = e.target.closest("button[data-step]");
      if (!btn) return;
      navHandler(btn.dataset.step);
    });
  }
  function navHandler(step) {
    _uiStep = step;
    markStepActive(step);
    gotoStep(step);
  }
  function markStepActive(step) {
    const nav = el("gp-step-nav");
    if (!nav) return;
    nav.querySelectorAll("button[data-step]").forEach(b =>
      b.classList.toggle("active", b.dataset.step === step)
    );
  }
  function gotoStep(step) {
    ["step1","step2","step3"].forEach(s => {
      const f = el(s + "Form");
      if (f) f.classList.toggle("hidden", s !== step);
    });
  }

  // ------ Auth & Bootstrap ------
  auth.onAuthStateChanged(async user => {
    if (!user) {
      if (!el("gp-auth-overlay")) {
        const d = document.createElement("div");
        d.id = "gp-auth-overlay";
        d.style = "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;"
                + "background:rgba(0,0,0,.8);color:#fff;font-size:1.1rem;text-align:center;padding:1rem;";
        d.textContent = "Please sign in to continue.";
        document.body.appendChild(d);
      }
      return;
    }
    el("gp-auth-overlay")?.remove();
    ensureStepNav();
    await loadContext();
  });

  // ------ Expose API ------
  global.gpBasic = {
    get guestKey(){ return _guestKey; },
    get guest()   { return _guestObj; },
    get uiStep() { return _uiStep; },
    save:    saveGuestNow,
    goto:    navHandler,
    open:    loadContext
  };
  global.gpApp = {
    get guestKey(){ return gpBasic.guestKey; },
    get guest()   { return gpBasic.guest; },
    get uiStep()  { return gpBasic.uiStep; },
    saveNow: gpBasic.save,
    gotoStep: gpBasic.goto
  };

})(window);