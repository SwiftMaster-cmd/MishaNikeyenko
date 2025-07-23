// gp-app-min.js -- Minimal app logic for modern UI
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

  // Helpers
  const el = id => document.getElementById(id);

  // Read all UI fields into object
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

  // Write loaded guest data to UI
  function writeFields(g) {
    if (el("custName"))    el("custName").value    = g.custName   || "";
    if (el("custPhone"))   el("custPhone").value   = g.custPhone  || "";
    (global.gpQuestions || []).forEach(q => {
      const f = el(q.id);
      if (!f) return;
      f.value = g[q.id] ?? "";
    });
    if (el("solutionText")) el("solutionText").value = g.solution?.text || g.solutionText || "";
  }

  // Fill answers global for UI
  function loadAnswersFromGuest(g) {
    const ans = global.answers;
    if (!ans) return;
    Object.keys(ans).forEach(k => delete ans[k]);
    if (g.custName)  ans["custName"]    = { value: g.custName,  points: 8 };
    if (g.custPhone) ans["custPhone"]   = { value: g.custPhone, points: 7 };
    (global.gpQuestions || []).forEach(q => {
      const v = g[q.id] || "";
      if (v) ans[q.id] = { value: v, points: q.weight };
    });
    if (g.solution?.text || g.solutionText)
      ans["solutionText"] = { value: g.solution?.text || g.solutionText, points: 25 };
  }

  // Real-time progress sync
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
      if (bar)   bar.value = pct;
    });
  }

  // Save or update the guest record
  async function saveGuestNow() {
    const f   = readFields();
    const now = Date.now();
    const status = global.gpCore
      ? global.gpCore.detectStatus({ ..._guestObj, ...f, solution: { text: f.solutionText } })
      : "new";

    // Nested evaluate data
    const evalData = {};
    (global.gpQuestions || []).forEach(q => {
      evalData[q.id] = f[q.id] || "";
    });

    if (!_guestKey) {
      // New guest
      const payload = {
        custName:    f.custName,
        custPhone:   f.custPhone,
        evaluate:    evalData,
        status,
        submittedAt: now,
        userUid:     auth.currentUser?.uid || null
      };
      if (f.solutionText) payload.solution = { text: f.solutionText, completedAt: now };
      try {
        const ref = db.ref("guestinfo").push();
        await ref.set(payload);
        _guestKey = ref.key;
        _guestObj = payload;
        localStorage.setItem("last_guestinfo_key", _guestKey);
        attachCompletionListener();
      } catch (e) { console.error("Error creating guest:", e); }
    } else {
      // Update guest
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
      // Evaluate updates
      Object.entries(evalData).forEach(([k, v]) => {
        updates[`guestinfo/${_guestKey}/evaluate/${k}`] = v;
      });
      try { await db.ref().update(updates); }
      catch (e) { console.error("Error updating guest:", e); }
    }
  }

  // Load context or new record
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
          if (global.updateTotalPoints) global.updateTotalPoints();
          if (global.updatePitchText)  global.updatePitchText();
          attachCompletionListener();
          return;
        }
      } catch (e) { console.error("Error loading guest:", e); }
    }
    // Fresh start
    _guestObj = {};
    _guestKey = null;
    writeFields({});
    loadAnswersFromGuest({});
    if (global.updateTotalPoints) global.updateTotalPoints();
    if (global.updatePitchText)  global.updatePitchText();
  }

  // Expose API
  global.gpApp = {
    get guestKey(){ return _guestKey; },
    saveNow: saveGuestNow,
    loadContext
  };
})(window);