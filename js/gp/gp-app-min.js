// gp-app-min.js -- Guest Portal App logic with nested "evaluate", live save/load, and DEBUG LOGS
(function(global){
  console.debug('[gp-app-min] init', new Date());

  // ─── Firebase Initialization ────────────────────────────────────────────────
  const cfg = global.GP_FIREBASE_CONFIG || {
    apiKey: "AIzaSyD9fILTNJQ0wsPftUsPkdLrhRGZ9dslMzE",
    authDomain: "osls-644fd.firebaseapp.com",
    databaseURL: "https://osls-644fd-default-rtdb.firebaseio.com",
    projectId: "osls-644fd",
    storageBucket: "osls-644fd.appspot.com",
    messagingSenderId: "798578046321",
    appId: "1:798578046321:web:1a2bcd3ef4567gh8i9jkl",
    measurementId: "G-XXXXXXX"
  };
  if (!firebase.apps.length) {
    console.debug('[gp-app-min] initializing Firebase');
    firebase.initializeApp(cfg);
  }
  const db   = firebase.database();
  const auth = firebase.auth();

  // ─── State ───────────────────────────────────────────────────────────────────
  let _guestKey = null;
  let _guestObj = {};
  let _uiStep   = "step1";

  const el = id => document.getElementById(id);

  // ─── Read Form Fields ────────────────────────────────────────────────────────
  function readFields() {
    const out = {
      custName:    el("custName")?.value.trim()    || "",
      custPhone:   el("custPhone")?.value.trim()   || "",
      solutionText: el("solutionText")?.value.trim() || ""
    };
    (global.gpQuestions||[]).forEach(q => {
      const f = el(q.id);
      out[q.id] = f ? f.value.trim() : "";
    });
    console.debug('[gp-app-min] readFields:', out);
    return out;
  }

  // ─── Populate UI from Guest Object ───────────────────────────────────────────
  function writeFields(g) {
    console.debug('[gp-app-min] writeFields:', g);
    if (el("custName"))    el("custName").value    = g.custName   || "";
    if (el("custPhone"))   el("custPhone").value   = g.custPhone  || "";
    (global.gpQuestions||[]).forEach(q => {
      const f = el(q.id);
      if (!f) return;
      const val = g.evaluate?.[q.id] ?? g[q.id] ?? "";
      f.value = val;
    });
    if (el("solutionText")) el("solutionText").value = g.solution?.text || "";
  }

  // ─── Build global.answers for gp-ui-render ──────────────────────────────────
  function loadAnswersFromGuest(g) {
    console.debug('[gp-app-min] loadAnswersFromGuest:', g.evaluate);
    const a = global.answers;
    if (!a) return;
    Object.keys(a).forEach(k => delete a[k]);
    if (g.custName)  a["custName"]    = { value: g.custName,  points: 8 };
    if (g.custPhone) a["custPhone"]   = { value: g.custPhone, points: 7 };
    if (g.evaluate) {
      (global.gpQuestions||[]).forEach(q => {
        const v = g.evaluate[q.id] || "";
        if (v) a[q.id] = { value: v, points: q.weight };
      });
    }
    if (g.solution?.text) a["solutionText"] = { value: g.solution.text, points: 25 };
  }

  // ─── Real-time Progress Listener ────────────────────────────────────────────
  function attachCompletionListener() {
    if (!_guestKey) return;
    const ref = db.ref(`guestinfo/${_guestKey}/completionPct`);
    ref.off("value");
    ref.on("value", snap => {
      const pct = snap.val() || 0;
      console.debug('[gp-app-min] remote completionPct=', pct);
      const lbl = el("progressLabel"), bar = el("progressBar");
      if (lbl) lbl.textContent = `${pct}%`;
      if (bar) bar.value = pct;
    });
    console.debug('[gp-app-min] attached completionPct listener');
  }

  // ─── Save or Update Guest Record ─────────────────────────────────────────────
  async function saveGuestNow() {
    const f      = readFields();
    const uid    = auth.currentUser?.uid || null;
    const now    = Date.now();
    const status = global.gpCore
      ? global.gpCore.detectStatus({ ..._guestObj, ...f, solution: { text: f.solutionText } })
      : "new";

    // prepare nested evaluate data
    const evalData = {};
    (global.gpQuestions||[]).forEach(q => evalData[q.id] = f[q.id] || "");

    console.debug('[gp-app-min] saveGuestNow:', { guestKey: _guestKey, fields: f, status });

    if (!_guestKey) {
      // CREATE new
      const payload = {
        custName:    f.custName,
        custPhone:   f.custPhone,
        evaluate:    evalData,
        status,
        submittedAt: now,
        userUid:     uid
      };
      if (f.solutionText) payload.solution = { text: f.solutionText, completedAt: now };

      try {
        const ref = db.ref("guestinfo").push();
        await ref.set(payload);
        _guestKey = ref.key;
        _guestObj = payload;
        localStorage.setItem("last_guestinfo_key", _guestKey);
        console.debug('[gp-app-min] created guestKey=', _guestKey);
        attachCompletionListener();
      } catch (err) {
        console.error('[gp-app-min] error creating guest:', err);
      }
    } else {
      // UPDATE existing
      const updates = {
        [`guestinfo/${_guestKey}/custName`]:  f.custName,
        [`guestinfo/${_guestKey}/custPhone`]: f.custPhone,
        [`guestinfo/${_guestKey}/status`]:    status,
        [`guestinfo/${_guestKey}/updatedAt`]: now
      };
      if (f.solutionText) {
        updates[`guestinfo/${_guestKey}/solution`] = {
          text: f.solutionText,
          completedAt: _guestObj.solution?.completedAt || now
        };
      } else {
        updates[`guestinfo/${_guestKey}/solution`] = null;
      }
      // nested evaluate
      Object.entries(evalData).forEach(([k, v]) => {
        updates[`guestinfo/${_guestKey}/evaluate/${k}`] = v;
      });

      try {
        await db.ref().update(updates);
        console.debug('[gp-app-min] updated guest:', updates);
      } catch (err) {
        console.error('[gp-app-min] error updating guest:', err);
      }
    }
  }

  // ─── Load Context (Existing or Fresh) ────────────────────────────────────────
  async function loadContext() {
    const params = new URLSearchParams(window.location.search);
    const gid    = params.get("gid") || localStorage.getItem("last_guestinfo_key");
    console.debug('[gp-app-min] loadContext gid=', gid);

    if (gid) {
      try {
        const snap = await db.ref(`guestinfo/${gid}`).get();
        if (snap.exists()) {
          let g = snap.val();
          if (global.gpCore) g = global.gpCore.normGuest(g);
          _guestKey = gid;
          _guestObj = g;
          console.debug('[gp-app-min] loaded guestObj:', g);

          writeFields(g);
          loadAnswersFromGuest(g);

          // determine initial step
          const st = global.gpCore
            ? global.gpCore.detectStatus(g)
            : "new";
          _uiStep = st === "proposal" ? "step3"
                  : st === "working"  ? "step2"
                                      : "step1";
          global.gpApp.gotoStep(_uiStep);
          if (global.updateTotalPoints) global.updateTotalPoints();
          if (global.updatePitchText)  global.updatePitchText();

          attachCompletionListener();
          return;
        }
        console.warn('[gp-app-min] no data at guest key');
      } catch (err) {
        console.error('[gp-app-min] error fetching guest:', err);
      }
    }

    // FRESH CONTEXT
    console.debug('[gp-app-min] initializing fresh context');
    _guestObj = {};
    _guestKey = null;
    _uiStep   = "step1";

    writeFields(_guestObj);
    loadAnswersFromGuest(_guestObj);
    global.gpApp.gotoStep(_uiStep);
    if (global.updateTotalPoints) global.updateTotalPoints();
    if (global.updatePitchText)  global.updatePitchText();
  }

  // ─── Step Navigation ─────────────────────────────────────────────────────────
  function ensureStepNav() {
    if (el("gp-step-nav")) return;
    const nav = document.createElement("div");
    nav.id = "gp-step-nav";
    nav.className = "gp-step-nav";
    nav.innerHTML = `
      <button data-step="step1">1. Customer</button>
      <button data-step="step2">2. Evaluate</button>
      <button data-step="step3">3. Solution</button>`;
    document.body.prepend(nav);
    nav.addEventListener("click", e => {
      const b = e.target.closest("button[data-step]");
      if (!b) return;
      gpApp.gotoStep(b.dataset.step);
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

  // ─── Auth & Bootstrap ────────────────────────────────────────────────────────
  auth.onAuthStateChanged(async user => {
    if (!user) {
      if (!el("gp-auth-overlay")) {
        const d = document.createElement("div");
        d.id = "gp-auth-overlay";
        d.style = "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;"
                + "background:rgba(0,0,0,0.8);color:#fff;font-size:1.1rem;text-align:center;padding:1rem;";
        d.textContent = "Please sign in to continue.";
        document.body.appendChild(d);
      }
      return;
    }
    el("gp-auth-overlay")?.remove();
    ensureStepNav();
    await loadContext();
  });

  // ─── Expose API ──────────────────────────────────────────────────────────────
  global.gpBasic = {
    get guestKey(){ return _guestKey; },
    get guest()   { return _guestObj; },
    get uiStep()  { return _uiStep; },
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

  console.debug('[gp-app-min] setup complete');
})(window);