// gp-app-min.js -- full fixed version with auth overlay injection, answers init, logging, and save/load
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

  const el = id => {
    const elem = document.getElementById(id);
    if (!elem) console.warn(`[gpApp] Element not found: ${id}`);
    return elem;
  };

  // Inject auth overlay div if missing
  function ensureAuthOverlay() {
    if (!document.getElementById("gp-auth-overlay")) {
      const overlay = document.createElement("div");
      overlay.id = "gp-auth-overlay";
      overlay.style = "display:none; position:fixed; inset:0; background:rgba(0,0,0,0.8); color:#fff; font-size:1.2rem; text-align:center; padding-top:20vh; z-index:9999;";
      overlay.textContent = "Please sign in to continue.";
      document.body.appendChild(overlay);
      console.log("[gpApp] Injected missing gp-auth-overlay div");
    }
  }

  // Initialize global answers object if missing
  if (!global.answers) {
    global.answers = {};
    console.log("[gpApp] Initialized global.answers");
  }

  function readFields() {
    console.log("[gpApp] Reading fields");
    const out = {
      custName:  el("custName")?.value.trim()  || "",
      custPhone: el("custPhone")?.value.trim() || ""
    };
    const questions = global.gpQuestions || [];
    console.log(`[gpApp] Reading ${questions.length} Step 2 questions`);
    questions.forEach(q => {
      const f = el(q.id);
      if (!f) {
        console.warn(`[gpApp] Missing Step 2 field: ${q.id}`);
        out[q.id] = "";
        return;
      }
      out[q.id] = (typeof f.value === "string" ? f.value.trim() : f.value) || "";
      console.log(`[gpApp] Field ${q.id}:`, out[q.id]);
    });
    out.solutionText = el("solutionText")?.value.trim() || "";
    console.log("[gpApp] Field solutionText:", out.solutionText);
    return out;
  }

  function writeFields(g) {
    console.log("[gpApp] Writing fields", g);
    if (el("custName")) el("custName").value = g.custName || "";
    if (el("custPhone")) el("custPhone").value = g.custPhone || "";

    const questions = global.gpQuestions || [];
    questions.forEach(q => {
      const f = el(q.id);
      if (!f) {
        console.warn(`[gpApp] Cannot write missing Step 2 field: ${q.id}`);
        return;
      }
      f.value = g[q.id] || "";
      console.log(`[gpApp] Wrote ${q.id}: ${f.value}`);
    });

    if (el("solutionText")) {
      el("solutionText").value = g.solutionText || "";
      console.log("[gpApp] Wrote solutionText:", g.solutionText || "");
    }
  }

  function loadAnswersFromGuest(g) {
    console.log("[gpApp] Loading answers from guest", g);
    const answers = global.answers;
    if (!answers) {
      console.warn("[gpApp] global.answers missing during load");
      return;
    }
    Object.keys(answers).forEach(k => delete answers[k]);

    if (g.custName) answers["custName"] = { value: g.custName, points: 8 };
    if (g.custPhone) answers["custPhone"] = { value: g.custPhone, points: 7 };

    const questions = global.gpQuestions || [];
    questions.forEach(q => {
      const val = g[q.id] || "";
      if (val) {
        answers[q.id] = { value: val, points: q.weight };
        console.log(`[gpApp] Loaded answer ${q.id}: ${val} (${q.weight} pts)`);
      }
    });

    if (g.solutionText) {
      answers["solutionText"] = { value: g.solutionText, points: 25 };
    }
  }

  function saveLocalKey(k) {
    try {
      localStorage.setItem("last_guestinfo_key", k || "");
      console.log("[gpApp] Saved guest key locally:", k);
    } catch(e) {
      console.warn("[gpApp] Failed to save guest key locally:", e);
    }
  }

  function initialStep(g) {
    if (global.gpCore) {
      const status = global.gpCore.detectStatus(g);
      console.log("[gpApp] Detected initial step status:", status);
      return status === "proposal" ? "step3" : (status === "working" ? "step2" : "step1");
    }
    return "step1";
  }

  function ensureStepNav() {
    if (el("gp-step-nav")) return;
    const nav = document.createElement("div");
    nav.id = "gp-step-nav";
    nav.className = "gp-step-nav";
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
    console.log("[gpApp] Created step navigation");
  }

  function navHandler(step) {
    console.log("[gpApp] Navigating to step:", step);
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
    console.log("[gpApp] Showing step form:", step);
    ["step1","step2","step3"].forEach(s => {
      const f = el(s + "Form");
      if (f) f.classList.toggle("hidden", s !== step);
    });
  }

  async function saveGuestNow() {
    console.log("[gpApp] saveGuestNow started");
    const f = readFields();
    const uid = auth.currentUser?.uid || null;
    const now = Date.now();

    let status = "new";
    if (global.gpCore) {
      try {
        status = global.gpCore.detectStatus({..._guestObj, ...f, solutionText: f.solutionText});
      } catch(e) {
        console.warn("[gpApp] gpCore.detectStatus error:", e);
      }
    }
    console.log("[gpApp] Computed status:", status);

    if (!_guestKey) {
      const payload = {
        custName: f.custName,
        custPhone: f.custPhone,
        status,
        submittedAt: now,
        userUid: uid,
        solutionText: f.solutionText || ""
      };
      (global.gpQuestions || []).forEach(q => {
        payload[q.id] = f[q.id] || "";
      });
      console.log("[gpApp] Creating new guest record:", payload);
      try {
        const ref = await db.ref("guestinfo").push(payload);
        _guestKey = ref.key;
        _guestObj = {...payload};
        saveLocalKey(_guestKey);
        console.log("[gpApp] New guest record saved with key:", _guestKey);
      } catch (err) {
        console.error("[gpApp] Error saving new guest:", err);
      }
    } else {
      const updates = {
        [`guestinfo/${_guestKey}/custName`]: f.custName,
        [`guestinfo/${_guestKey}/custPhone`]: f.custPhone,
        [`guestinfo/${_guestKey}/status`]: status,
        [`guestinfo/${_guestKey}/updatedAt`]: now,
        [`guestinfo/${_guestKey}/solutionText`]: f.solutionText
      };
      (global.gpQuestions || []).forEach(q => {
        updates[`guestinfo/${_guestKey}/${q.id}`] = f[q.id] || "";
      });
      console.log("[gpApp] Updating existing guest record:", updates);
      try {
        await db.ref().update(updates);
        Object.assign(_guestObj, {...f, status});
        console.log("[gpApp] Guest record updated successfully");
      } catch (err) {
        console.error("[gpApp] Error updating guest:", err);
      }
    }
  }

  async function loadContext() {
    console.log("[gpApp] loadContext started");
    const params = new URLSearchParams(window.location.search);
    const gid = params.get("gid") || localStorage.getItem("last_guestinfo_key");
    console.log("[gpApp] Loading guest key:", gid);

    if (gid) {
      try {
        const snap = await db.ref("guestinfo/" + gid).get();
        if (snap.exists()) {
          _guestKey = gid;
          _guestObj = snap.val();
          saveLocalKey(gid);
          console.log("[gpApp] Guest data loaded:", _guestObj);
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
          db.ref(`guestinfo/${_guestKey}/completionPct`).off();
          return;
        } else {
          console.warn("[gpApp] No guest record found for key:", gid);
        }
      } catch(e) {
        console.error("[gpApp] Error loading guest data:", e);
      }
    }

    _guestObj = {};
    _guestKey = null;
    _uiStep = "step1";
    console.log("[gpApp] Initialized new guest context");

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

  ensureAuthOverlay();

  auth.onAuthStateChanged(async user => {
    if (!user) {
      const overlay = el("gp-auth-overlay");
      if (overlay) overlay.style.display = "flex";
      console.log("[gpApp] User not signed in");
      return;
    }
    const overlay = el("gp-auth-overlay");
    if (overlay) overlay.style.display = "none";
    console.log("[gpApp] User signed in:", user.uid);

    if (typeof renderUI === "function") {
      renderUI();
    }

    if (window.gpStep2 && typeof gpStep2.init === "function") {
      await gpStep2.init(
        (step2Data) => {
          console.log("Step 2 data changed:", step2Data);
          saveGuestNow();
        },
        {} // optionally pass preloaded Step 2 data
      );
    }

    await loadContext();
    ensureStepNav();
  });

  global.gpBasic = {
    get guestKey() { return _guestKey; },
    get guest() { return _guestObj; },
    get uiStep() { return _uiStep; },
    save: saveGuestNow,
    goto: navHandler,
    open: loadContext
  };

  global.gpApp = {
    get guestKey() { return gpBasic.guestKey; },
    get guest() { return gpBasic.guest; },
    get uiStep() { return gpBasic.uiStep; },
    saveNow: gpBasic.save,
    gotoStep: gpBasic.goto
  };

})(window);