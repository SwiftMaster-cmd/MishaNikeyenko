/* gp-app.js ================================================================
 * OSL Guest Portal main controller
 * Fixes: ensures guest loads from ?gid, correctly syncs UI fields
 * ======================================================================== */

// Firebase Init
(function initFirebase() {
  const cfg = window.GP_FIREBASE_CONFIG || {
    apiKey: "AIzaSyD9fILTNJQ0wsPftUsPkdLrhRGV9dslMzE",
    authDomain: "osls-644fd.firebaseapp.com",
    databaseURL: "https://osls-644fd-default-rtdb.firebaseio.com",
    projectId: "osls-644fd",
    storageBucket: "osls-644fd.appspot.com",
    messagingSenderId: "798578046321",
    appId: "1:798578046321:web:8758776701786a2fccf2d0",
    measurementId: "G-9HWXNSBE1T"
  };
  if (!firebase.apps.length) firebase.initializeApp(cfg);
})();
const gpDb   = firebase.database();
const gpAuth = firebase.auth();

// Global state
let currentGuestObj = null;
let currentGuestKey = null;
let seedEntryId     = null;
const GP_STEPS = ["step1", "step2", "step3"];
let _uiStep = "step1";

// Helpers
const stepRank = s => Math.max(0, GP_STEPS.indexOf(s));
const nextStep = s => GP_STEPS[Math.min(stepRank(s)+1, GP_STEPS.length-1)];
function qs(name) { return new URLSearchParams(location.search).get(name); }

function maybeAdvanceUiStepFromStatus(status){
  const minStep = gpCore.FIELD_STEP[status] || "step1";
  if (stepRank(minStep) > stepRank(_uiStep)) {
    _uiStep = minStep;
    gpUI.markStepActive(_uiStep);
    gpUI.gotoStep(_uiStep);
  } else {
    gpUI.markStepActive(_uiStep);
  }
}

// Load from ?gid, ?entry, or fallback to new
async function loadContext() {
  const gid   = qs("gid");
  const entry = qs("entry");

  if (gid) {
    try {
      const snap = await gpDb.ref(`guestinfo/${gid}`).get();
      const data = snap.val();
      if (data) {
        currentGuestKey = gid;
        currentGuestObj = gpCore.normGuest(data);
        _uiStep = gpCore.detectStatus(currentGuestObj);
        return "guestinfo";
      } else {
        console.warn("Guest not found for gid:", gid);
      }
    } catch (err) {
      console.error("loadContext error with gid", err);
    }
  }

  if (entry) {
    try {
      const snap = await gpDb.ref(`guestEntries/${entry}`).get();
      const e = snap.val();
      if (e) {
        seedEntryId = entry;
        currentGuestObj = {
          status: "new",
          custName:  e.guestName || "",
          custPhone: e.guestPhone || "",
          submittedAt: e.timestamp || Date.now(),
          userUid: gpAuth.currentUser?.uid || null,
          evaluate: {},
          solution: {},
          source: { type: "guestForm", entryId: entry }
        };
        return "seed-entry";
      }
    } catch (err) {
      console.error("loadContext error with entry", err);
    }
  }

  currentGuestObj = { status: "new", evaluate: {}, solution: {} };
  return "new";
}

// Sync guestObj → DOM
function syncUi() {
  const g = currentGuestObj || {};
  gpUI.ensureProgressBar();
  gpUI.ensureStepNav();
  gpUI.ensureEvalExtrasWrap();
  gpUI.ensureRevertLinks();
  gpUI.writeDomFields(g);
  gpUI.injectPrefillSummary(g.custName, g.custPhone);

  const comp = gpCore.computePitchFull(g);
  gpUI.setProgressSaved(comp.pctFull);
  gpUI.setProgressPreview(null);
  gpUI.updateNbqChips(g);

  maybeAdvanceUiStepFromStatus(g.status);
  gpUI.gotoStep(_uiStep);
}

// Auth + Bootstrap
gpAuth.onAuthStateChanged(async user => {
  if (!user) return location.href = "../index.html";

  gpUI.ensureProgressBar();
  gpUI.ensureStepNav();
  gpUI.ensureEvalExtrasWrap();
  gpUI.ensureRevertLinks();

  gpUI.bindLiveEvents({
    onInput: () => {
      const live = buildGuestFromDom();
      const comp = gpCore.computePitchFull(live);
      const saved = gpCore.computePitchFull(currentGuestObj || {});
      const diff = Math.abs(comp.pctFull - saved.pctFull);
      gpUI.setProgressPreview(diff > 1 ? comp.pctFull : null);
      gpUI.updateNbqChips(live);
    },
    onBlur: () => saveNowDebounced(),
    onNav: step => {
      if (!GP_STEPS.includes(step)) return;
      _uiStep = step;
      gpUI.markStepActive(step);
      gpUI.gotoStep(step);
    }
  });

  const ctx = await loadContext();
  syncUi();
  if (ctx !== "guestinfo") {
    _uiStep = "step1";
    gpUI.markStepActive(_uiStep);
    gpUI.gotoStep(_uiStep);
  }
});

// Build guest object from form
function buildGuestFromDom() {
  const raw = gpUI.readDomFields();
  const g = { ...(currentGuestObj || {}), evaluate: {}, solution: {} };

  g.custName  = raw.custName;
  g.custPhone = raw.custPhone;
  g.evaluate = {
    currentCarrier: raw.currentCarrier,
    numLines: raw.numLines,
    coverageZip: raw.coverageZip,
    deviceStatus: raw.deviceStatus,
    finPath: raw.finPath,
    billPain: raw.billPain,
    dataNeed: raw.dataNeed,
    hotspotNeed: raw.hotspotNeed,
    intlNeed: raw.intlNeed,
    serviceType: raw.serviceType,
    situation: raw.situation,
    carrierInfo: raw.carrierInfo,
    requirements: raw.requirements
  };
  g.solution = { text: raw.solutionText };

  g.status = gpCore.detectStatus(g);
  return g;
}

// Debounced save
let _saveTimer = null;
function saveNowDebounced() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(doAutosaveNow, 500);
}

// Save now
async function doAutosaveNow() {
  const g = buildGuestFromDom();
  const now = Date.now();
  const uid = gpAuth.currentUser?.uid || null;

  if (!currentGuestKey) {
    const pushRef = await gpDb.ref("guestinfo").push({
      ...g,
      submittedAt: now,
      userUid: uid,
      source: seedEntryId ? { type: "guestForm", entryId: seedEntryId } : null
    });
    currentGuestKey = pushRef.key;
    currentGuestObj = gpCore.normGuest(g);
    if (seedEntryId) {
      await gpDb.ref(`guestEntries/${seedEntryId}`).update({
        guestinfoKey: currentGuestKey,
        consumedBy: uid,
        consumedAt: now
      });
    }
  } else {
    await gpDb.ref(`guestinfo/${currentGuestKey}`).update({
      ...g,
      updatedAt: now
    });
    currentGuestObj = gpCore.normGuest(g);
  }

  const comp = gpCore.computePitchFull(currentGuestObj);
  gpUI.setProgressSaved(comp.pctFull);
  gpUI.setProgressPreview(null);
  gpUI.updateNbqChips(currentGuestObj);
}

// Expose API
window.gpApp = {
  get guestKey() { return currentGuestKey; },
  get guest() { return currentGuestObj; },
  get uiStep() { return _uiStep; },
  saveNow: doAutosaveNow,
  syncUi,
  buildGuestFromDom,
  gotoStep(step) {
    if (GP_STEPS.includes(step)) {
      _uiStep = step;
      gpUI.markStepActive(step);
      gpUI.gotoStep(step);
    }
  }
};