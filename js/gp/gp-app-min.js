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
    document.querySelectorAll("#step2Fields .gfield").forEach(f => {
      out[f.id] = f.value.trim();
    });
    out.solutionText = el("solutionText")?.value.trim() || "";
    return out;
  }

  function writeFields(g) {
    if (el("custName"))     el("custName").value     = g.custName || "";
    if (el("custPhone"))    el("custPhone").value    = g.custPhone || "";
    // Load evaluate data into Step 2 fields
    if (global.setStep2Fields && g.evaluate)
      global.setStep2Fields(g.evaluate);
    if (el("solutionText")) el("solutionText").value = g.solution?.text || "";
  }

  function saveLocalKey(k) {
    try { localStorage.setItem("last_guestinfo_key", k || ""); }
    catch(_) {}
  }

  async function saveGuestNow() {
    const f = readFields();
    const uid = auth.currentUser?.uid || null;
    const now = Date.now();
    const status = global.gpCore
      ? global.gpCore.detectStatus({..._guestObj, ...f, solution:{ text:f.solutionText }})
      : "new";

    // Always collect and overwrite all step 2 fields
    let evaluate = {};
    document.querySelectorAll("#step2Fields .gfield").forEach(field => {
      evaluate[field.id] = field.value.trim();
    });

    if (!_guestKey) {
      const payload = {
        custName:    f.custName,
        custPhone:   f.custPhone,
        evaluate:    evaluate,
        status,
        submittedAt: now,
        userUid:     uid,
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
      const updates = {
        [`guestinfo/${_guestKey}/custName`]: f.custName,
        [`guestinfo/${_guestKey}/custPhone`]: f.custPhone,
        [`guestinfo/${_guestKey}/status`]: status,
        [`guestinfo/${_guestKey}/updatedAt`]: now,
        [`guestinfo/${_guestKey}/solution`]: f.solutionText
          ? { text: f.solutionText, completedAt: _guestObj.solution?.completedAt || now }
          : null,
        [`guestinfo/${_guestKey}/evaluate`]: evaluate
      };
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

        if (typeof global.onGuestUIReady === "function") {
          global.onGuestUIReady(() => {
            writeFields(_guestObj);
          });
        } else {
          await new Promise(r => setTimeout(r, 50));
          writeFields(_guestObj);
        }
        return;
      }
    }
    _guestObj = {};
    _guestKey = null;
    _uiStep   = "step1";
    if (typeof global.onGuestUIReady === "function") {
      global.onGuestUIReady(() => {
        writeFields(_guestObj);
      });
    } else {
      await new Promise(r => setTimeout(r, 50));
      writeFields(_guestObj);
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

    await loadContext();
    // field listeners handled in render.js (autosave etc)
  });

  global.gpApp = {
    get guestKey(){ return _guestKey; },
    get guest(){ return _guestObj; },
    get uiStep(){ return _uiStep; },
    saveNow: saveGuestNow
  };

})(window);