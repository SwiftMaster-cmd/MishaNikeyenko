// gp-app-min.js -- Guest Portal controller with correct nested evaluate load and debug logging
(function(global){
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

  let _guestObj = null;
  let _guestKey = null;
  let _uiStep   = "step1";

  const el = id => document.getElementById(id);

  function readFields() {
    const out = {
      custName:  el("custName")?.value.trim()  || "",
      custPhone: el("custPhone")?.value.trim() || ""
    };
    (global.gpQuestions||[]).forEach(q => {
      const f = el(q.id);
      if (!f) return;
      const v = f.tagName === "SELECT" || f.tagName === "INPUT" || f.tagName==="TEXTAREA"
        ? f.value
        : "";
      out[q.id] = (typeof v === "string" ? v.trim() : v) || "";
    });
    out.solutionText = el("solutionText")?.value.trim() || "";
    return out;
  }

  function writeFields(g) {
    console.log("writeFields called with guest object:", g);
    if (el("custName"))     el("custName").value     = g.custName || "";
    if (el("custPhone"))    el("custPhone").value    = g.custPhone || "";

    (global.gpQuestions||[]).forEach(q => {
      const f = el(q.id);
      if (!f) return;
      if (f.tagName === "SELECT" || f.tagName === "INPUT" || f.tagName==="TEXTAREA") {
        // Read Step 2 from nested evaluate object if present
        const val = (g.evaluate && typeof g.evaluate[q.id] !== "undefined") ? g.evaluate[q.id] : g[q.id] || "";
        f.value = val;
      }
    });

    if (el("solutionText")) el("solutionText").value = g.solution?.text || "";
  }

  function loadAnswersFromGuest(g) {
    const answers = global.answers;
    if (!answers) return;
    Object.keys(answers).forEach(k => delete answers[k]);

    if (g.custName) answers["custName"] = { value: g.custName, points: 8 };
    if (g.custPhone) answers["custPhone"] = { value: g.custPhone, points: 7 };

    if (g.evaluate) {
      (global.gpQuestions || []).forEach(q => {
        const val = g.evaluate[q.id] || "";
        if (val) answers[q.id] = { value: val, points: q.weight };
      });
    }

    if (g.solution && g.solution.text) {
      answers["solutionText"] = { value: g.solution.text, points: 25 };
    }
  }

  function updateProgressFromGuest(g) {
    // noop; handled in gp-ui-render.js
  }

  function saveLocalKey(k) {
    try { localStorage.setItem("last_guestinfo_key", k || ""); }
    catch(_) {}
  }

  function initialStep(g) {
    if (global.gpCore) {
      return global.gpCore.detectStatus(g) === "proposal"
        ? "step3"
        : (global.gpCore.detectStatus(g) === "working"
            ? "step2"
            : "step1");
    }
    return "step1";
  }

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

  async function saveGuestNow() {
    const f = readFields();
    const uid = auth.currentUser?.uid || null;
    const now = Date.now();
    const status = global.gpCore
      ? global.gpCore.detectStatus({..._guestObj, ...f, solution:{ text:f.solutionText }})
      : "new";

    const evaluate = {};
    (global.gpQuestions||[]).forEach(q => {
      evaluate[q.id] = f[q.id] || "";
    });

    console.log("Saving evaluate data:", evaluate);

    if (!_guestKey) {
      const payload = {
        custName:    f.custName,
        custPhone:   f.custPhone,
        evaluate,
        submittedAt: now,
        userUid:     uid,
        status,
        solution:    f.solutionText ? { text:f.solutionText, completedAt: now } : null
      };
      try {
        const ref = await db.ref("guestinfo").push(payload);
        _guestKey = ref.key;
        _guestObj = { ...payload };
        saveLocalKey(_guestKey);
      } catch (err) {
        console.error("Error saving new guest:", err);
      }
    } else {
      const updates = {};
      updates[`guestinfo/${_guestKey}/custName`]  = f.custName;
      updates[`guestinfo/${_guestKey}/custPhone`] = f.custPhone;
      updates[`guestinfo/${_guestKey}/evaluate`] = evaluate;
      updates[`guestinfo/${_guestKey}/status`]    = status;
      updates[`guestinfo/${_guestKey}/updatedAt`] = now;
      updates[`guestinfo/${_guestKey}/solution`]  = f.solutionText
        ? { text:f.solutionText, completedAt: _guestObj.solution?.completedAt || now }
        : null;

      try {
        await db.ref().update(updates);
        Object.assign(_guestObj, { ...f, status, evaluate });
      } catch (err) {
        console.error("Error updating guest:", err);
      }
    }
  }

  async function loadContext() {
    const params = new URLSearchParams(window.location.search);
    const gid    = params.get("gid") || localStorage.getItem("last_guestinfo_key");

    if (gid) {
      const snap = await db.ref("guestinfo/" + gid).get();
      if (snap.exists()) {
        let g = snap.val();
        if (global.gpCore) g = global.gpCore.normGuest(g);
        _guestKey = gid;
        _guestObj = g;
        saveLocalKey(gid);

        console.log("Loaded guest data from Firebase:", g);

        if (typeof global.onGuestUIReady === "function") {
          global.onGuestUIReady(() => {
            writeFields(_guestObj);
            loadAnswersFromGuest(_guestObj);
            _uiStep = initialStep(_guestObj);
            gotoStep(_uiStep);
            markStepActive(_uiStep);

            if (global.updateTotalPoints) global.updateTotalPoints();
            if (global.updatePitchText) global.updatePitchText();
          });
        } else {
          await new Promise(r => setTimeout(r, 50));
          writeFields(_guestObj);
          loadAnswersFromGuest(_guestObj);
          _uiStep = initialStep(_guestObj);
          gotoStep(_uiStep);
          markStepActive(_uiStep);
          if (global.updateTotalPoints) global.updateTotalPoints();
          if (global.updatePitchText) global.updatePitchText();
        }

        db.ref(`guestinfo/${_guestKey}/completionPct`).off(); // prevent conflicts
        return;
      }
    }

    _guestObj = {};
    _guestKey = null;
    _uiStep   = "step1";

    if (typeof global.onGuestUIReady === "function") {
      global.onGuestUIReady(() => {
        writeFields(_guestObj);
        loadAnswersFromGuest(_guestObj);
        gotoStep(_uiStep);
        markStepActive(_uiStep);
        if (global.updateTotalPoints) global.updateTotalPoints();
        if (global.updatePitchText) global.updatePitchText();
      });
    } else {
      await new Promise(r => setTimeout(r, 50));
      writeFields(_guestObj);
      loadAnswersFromGuest(_guestObj);
      gotoStep(_uiStep);
      markStepActive(_uiStep);
      if (global.updateTotalPoints) global.updateTotalPoints();
      if (global.updatePitchText) global.updatePitchText();
    }
  }

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
    const ov = el("gp-auth-overlay"); if (ov) ov.remove();

    ensureStepNav();
    await loadContext();
  });

  global.gpBasic = {
    get guestKey(){ return _guestKey; },
    get guest(){ return _guestObj; },
    get uiStep(){ return _uiStep; },
    save:    saveGuestNow,
    goto:    navHandler,
    open:    loadContext
  };
  global.gpApp = {
    get guestKey(){ return gpBasic.guestKey; },
    get guest(){ return gpBasic.guest; },
    get uiStep(){ return gpBasic.uiStep; },
    saveNow: gpBasic.save,
    gotoStep:gpBasic.goto
  };

})(window);