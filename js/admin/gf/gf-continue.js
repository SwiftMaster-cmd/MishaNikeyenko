/* =======================================================================
 * guestforms-continue.js
 * -----------------------------------------------------------------------
 * Heavy intake → Portal *continue* / *delete* handlers split from the
 * lightweight guestforms-core.js renderer.
 *
 * Load order: guestforms-core.js FIRST, then THIS file, then
 * guestforms-handoff.js (which provides smarter URL building & uiStart).
 * -------------------------------------------------------------------- */
(() => {
  /* --------------------------------------------------------------
   * Local shorthands / safe accessors
   * -------------------------------------------------------------- */
  const db          = () => window.db;                 // dashboard firebase db (Realtime DB)
  const currentUid  = () => window.currentUid || null; // logged-in dashboard user

  /* Core module exposes live caches; fall back defensively. */
  function formsCache() {
    return (window.guestforms && window.guestforms._formsCache) || {};
  }
  function guestinfoCache() {
    return (window.guestforms && window.guestforms._guestinfoLive) ||
           window._guestinfo || {};
  }

  /* Provided by core; bail if missing. */
  function canDeleteForm() {
    return (window.guestforms && window.guestforms._canDeleteForm
      ? window.guestforms._canDeleteForm(window.currentRole)
      : (window.currentRole === "admin" ||
         window.currentRole === "dm"    ||
         window.currentRole === "lead"));
  }

  /* Fallback util; handoff file has richer logic */
  const digitsOnly = str => (str || "").replace(/\D+/g, "");

  /* --------------------------------------------------------------
   * INTERNAL: minimal URL builder (fallback)
   * Real logic lives in guestforms-handoff.js; we call there if loaded.
   * -------------------------------------------------------------- */
  function _fallbackOpenGuestInfoPage(guestKey, entryId, uiStartHint) {
    const base = window.GUESTINFO_PAGE || "../html/guestinfo.html";
    const params = [];
    if (guestKey) params.push("gid="   + encodeURIComponent(guestKey));
    if (entryId)  params.push("entry=" + encodeURIComponent(entryId));
    if (uiStartHint) params.push("uistart=" + encodeURIComponent(uiStartHint));
    const url = params.length
      ? `${base}${base.includes("?") ? "&" : "?"}${params.join("&")}`
      : base;
    try { localStorage.setItem("last_guestinfo_key", guestKey || ""); } catch(_) {}
    window.location.href = url;
  }

  /* Proxy to handoff module if present */
  function goPortal(guestKey, entryId, preferredUiStart) {
    if (window.guestformsHandoff && typeof window.guestformsHandoff.open === "function") {
      window.guestformsHandoff.open(guestKey, entryId, preferredUiStart);
    } else {
      _fallbackOpenGuestInfoPage(guestKey, entryId, preferredUiStart);
    }
  }

  /* --------------------------------------------------------------
   * continueToGuestInfo(entryId)
   * - Loads intake row.
   * - If already linked, ensure consumed/claimed + open portal.
   * - Else creates guestinfo seed (Step1), links intake, open portal.
   * -------------------------------------------------------------- */
  async function continueToGuestInfo(entryId) {
    const _db = db();
    if (!_db) {
      alert("Database not ready.");
      return;
    }
    const uid = currentUid();

    let entrySnap, entry;
    try {
      entrySnap = await _db.ref(`guestEntries/${entryId}`).get();
      entry = entrySnap.val();
    } catch (err) {
      console.error("[guestforms-continue] load guestEntries/" + entryId, err);
      alert("Error loading guest intake. See console.");
      return;
    }
    if (!entry) {
      alert("Guest form not found.");
      return;
    }

    /* Already linked? -------------------------------------------- */
    if (entry.guestinfoKey) {
      // Patch consumed/claimed (in case of legacy nulls)
      try {
        const up = {};
        if (!entry.consumedBy) up[`guestEntries/${entryId}/consumedBy`] = uid || null;
        if (!entry.consumedAt) up[`guestEntries/${entryId}/consumedAt`] = Date.now();
        if (!entry.claimedBy)  up[`guestEntries/${entryId}/claimedBy`]  = uid || null;
        if (Object.keys(up).length) await _db.ref().update(up);
      } catch (e) {
        /* non-fatal */
      }
      goPortal(entry.guestinfoKey, entryId);
      return;
    }

    /* Create guestinfo seed -------------------------------------- */
    const name   = entry.guestName  || "";
    const phone  = entry.guestPhone || entry.guestPhoneDigits || "";
    const digits = digitsOnly(phone);
    const ts     = entry.timestamp || Date.now();

    const step1Done  = !!(name || digits);
    const statusInit = step1Done ? "working" : "new";

    const payload = {
      custName:        name,
      custPhone:       phone,
      custPhoneDigits: digits || null,
      submittedAt:     ts,
      userUid:         uid || null,
      status:          statusInit,
      prefilledStep1:  step1Done,
      evaluate:        {},   // always seed object
      solution:        {},
      source:          { type: "guestForm", entryId }
    };

    let guestKey;
    try {
      const gRef = await _db.ref("guestinfo").push(payload);
      guestKey = gRef.key;
    } catch (err) {
      console.error("[guestforms-continue] create guestinfo", err);
      alert("Error creating guest record. See console.");
      return;
    }

    /* Link intake -> guestinfo + mark consumed -------------------- */
    try {
      await _db.ref(`guestEntries/${entryId}`).update({
        guestinfoKey: guestKey,
        consumedBy: uid || null,
        consumedAt: Date.now(),
        claimedBy: entry.claimedBy || uid || null
      });
    } catch (err) {
      console.warn("[guestforms-continue] link guestEntries->guestinfo", err);
    }

    // ask core to rerender if it exported a scheduler
    if (window.guestforms && typeof window.guestforms._scheduleRerender === "function") {
      window.guestforms._scheduleRerender();
    }

    goPortal(guestKey, entryId, step1Done ? "step2" : "step1");
  }

  /* --------------------------------------------------------------
   * deleteGuestFormEntry(entryId)
   * - Does NOT delete the linked guestinfo record.
   * -------------------------------------------------------------- */
  async function deleteGuestFormEntry(entryId) {
    if (!canDeleteForm()) {
      alert("You don't have permission to delete this form.");
      return;
    }
    const _db = db();
    if (!_db) return;

    let entrySnap, entry;
    try {
      entrySnap = await _db.ref(`guestEntries/${entryId}`).get();
      entry = entrySnap.val();
    } catch (err) {
      console.error("[guestforms-continue] delete load", err);
      alert("Error loading form. See console.");
      return;
    }
    if (!entry) return;

    const linked = !!entry.guestinfoKey;
    const msg = linked
      ? "Delete this guest form submission? (The full guest info record will NOT be deleted.)"
      : "Delete this guest form submission?";
    if (!confirm(msg)) return;

    try {
      await _db.ref(`guestEntries/${entryId}`).remove();
    } catch (err) {
      alert("Error deleting form: " + err.message);
      return;
    }

    // schedule UI refresh if core exported hook
    if (window.guestforms && typeof window.guestforms._scheduleRerender === "function") {
      window.guestforms._scheduleRerender();
    }
  }

  /* --------------------------------------------------------------
   * startNewLead()
   * - Launch portal w/out gid/entry (pure new record).
   * - Prefer handoff module for url building.
   * -------------------------------------------------------------- */
  function startNewLead() {
    goPortal(null, null, "step1");
  }

  /* --------------------------------------------------------------
   * Attach / augment global namespace
   * -------------------------------------------------------------- */
  if (!window.guestforms) window.guestforms = {};
  Object.assign(window.guestforms, {
    continueToGuestInfo,
    deleteGuestFormEntry,
    startNewLead
  });

})();