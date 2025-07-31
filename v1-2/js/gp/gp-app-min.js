// gp-app-min.js -- Guest Portal App logic with nested "evaluate", live save/load, and guarded progress updates
(function(global){
  // Firebase initialization
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
  if (!firebase.apps.length) firebase.initializeApp(cfg);
  const db   = firebase.database();
  const auth = firebase.auth();

  // State
  let _guestKey = null;
  let _guestObj = {};
  let _uiStep   = "step1";

  const el = id => document.getElementById(id);

  // Read all form fields, including nested evaluate
  function readFields() {
    const out = {
      custName:    el("custName")?.value.trim()    || "",
      custPhone:   el("custPhone")?.value.trim()   || "",
      solutionText: el("solutionText")?.value.trim() || ""
    };
    (global.gpQuestions || []).forEach(q => {
      const f = el(q.id);
      out[q.id] = f ? f.value.trim() : "";
    });
    return out;
  }

  // Populate UI from loaded guest object
  function writeFields(g) {
    if (el("custName"))    el("custName").value    = g.custName   || "";
    if (el("custPhone"))   el("custPhone").value   = g.custPhone  || "";
    (global.gpQuestions || []).forEach(q => {
      const f = el(q.id);
      if (!f) return;
      f.value = g.evaluate?.[q.id] ?? g[q.id] ?? "";
    });
    if (el("solutionText")) el("solutionText").value = g.solution?.text || "";
  }

  // Build global.answers for render logic
  function loadAnswersFromGuest(g) {
    const ans = global.answers;
    if (!ans) return;
    Object.keys(ans).forEach(k => delete ans[k]);
    if (g.custName)  ans["custName"]    = { value: g.custName,  points: 8 };
    if (g.custPhone) ans["custPhone"]   = { value: g.custPhone, points: 7 };
    if (g.evaluate) {
      (global.gpQuestions || []).forEach(q => {
        const v = g.evaluate[q.id] || "";
        if (v) ans[q.id] = { value: v, points: q.weight };
      });
    }
    if (g.solution?.text) ans["solutionText"] = { value: g.solution.text, points: 25 };
  }

  // Guarded real-time listener for remote progressPct
  function attachCompletionListener() {
    if (!_guestKey) return;
    const ref = db.ref(`guestinfo/${_guestKey}/completionPct`);
    ref.off("value");
    ref.on("value", snap => {
      if (!snap.exists()) return;
      const pct = snap.val();
      const label = el("progressLabel");
      const bar   = el("progressBar");
      if (label) label.textContent = `${pct}%`;
      if (bar)    bar.value = pct;
    });
  }

  // Save or update the guest record
  async function saveGuestNow() {
    // If not editing an existing lead, don't save
    if (!_guestKey) return; // <--- CRITICAL GUARD

    const f   = readFields();
    const now = Date.now();
    const status = global.gpCore
      ? global.gpCore.detectStatus({ ..._guestObj, ...f, solution: { text: f.solutionText } })
      : "new";

    // Prepare nested evaluate data
    const evalData = {};
    (global.gpQuestions || []).forEach(q => {
      evalData[q.id] = f[q.id] || "";
    });

    // Update existing guest only
    const updates = {
      [`guestinfo/${_guestKey}/custName`]:    f.custName,
      [`guestinfo/${_guestKey}/custPhone`]:   f.custPhone,
      [`guestinfo/${_guestKey}/status`]:      status,
      [`guestinfo/${_guestKey}/updatedAt`]:   now
    };
    if (f.solutionText) {
      updates[`guestinfo/${_guestKey}/solution`] = {
        text:           f.solutionText,
        completedAt:    _guestObj.solution?.completedAt || now
      };
    } else {
      updates[`guestinfo/${_guestKey}/solution`] = null;
    }
    // Nested evaluate updates
    Object.entries(evalData).forEach(([k, v]) => {
      updates[`guestinfo/${_guestKey}/evaluate/${k}`] = v;
    });
    try {
      await db.ref().update(updates);
    } catch (e) {
      console.error("Error updating guest:", e);
    }
  }

  // Load existing context or initialize fresh
  async function loadContext() {
    const params = new URLSearchParams(window.location.search);
    const gid    = params.get("gid") || localStorage.getItem("last_guestinfo_key");

    if (gid) {
      try {
        const snap = await db.ref(`guestinfo/${gid}`).get();
        if (snap.exists()) {
          let g = snap.val();
          if (global.gpCore) g = global.gpCore.normGuest(g);
          _guestKey = gid;
          _guestObj = g;
          writeFields(g);
          loadAnswersFromGuest(g);

          const st = global.gpCore ? global.gpCore.detectStatus(g) : "new";
          const step = st === "proposal" ? "step3" : st === "working" ? "step2" : "step1";
          global.gpApp.gotoStep(step);
          if (global.updateTotalPoints) global.updateTotalPoints();
          if (global.updatePitchText)  global.updatePitchText();

          attachCompletionListener();
          return;
        }
      } catch (e) {
        console.error("Error loading guest:", e);
      }
    }

    // If guest doesn't exist, just reset UI, but DON'T create or autosave a blank guest.
    _guestObj = {};
    _guestKey = null;
    global.gpApp.gotoStep("step1");
    writeFields({});
    loadAnswersFromGuest({});
    if (global.updateTotalPoints) global.updateTotalPoints();
    if (global.updatePitchText)  global.updatePitchText();
    // Do NOT trigger save here! No blank guests will be created.
  }

  // Navigation handler only, no buttons created
  function navHandler(step) {
    ["step1","step2","step3"].forEach(s => {
      const form = el(s + "Form");
      if (form) form.classList.toggle("hidden", s !== step);
    });
    Array.from(document.querySelectorAll("#gp-step-nav button")).forEach(b =>
      b.classList.toggle("active", b.dataset.step === step)
    );
  }

  // Auth and initialization
  auth.onAuthStateChanged(async user => {
    if (!user) {
      if (!el("gp-auth-overlay")) {
        const o = document.createElement("div");
        o.id = "gp-auth-overlay";
        o.style = "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.8);color:#fff;font-size:1.1rem;padding:1rem;";
        o.textContent = "Please sign in to continue.";
        document.body.appendChild(o);
      }
      return;
    }
    el("gp-auth-overlay")?.remove();
    // ensureStepNav();  <-- REMOVED: no buttons now
    await loadContext();
  });

  // Expose API
  global.gpBasic = {
    get guestKey(){ return _guestKey; },
    save:    saveGuestNow,
    goto:    navHandler,
    open:    loadContext
  };
  global.gpApp = {
    get guestKey(){ return gpBasic.guestKey; },
    saveNow: gpBasic.save,
    gotoStep: gpBasic.goto
  };
})(window);