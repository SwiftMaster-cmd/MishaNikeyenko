/* guestform-actions.js =======================================================
 * Dashboard Intake Queue – Heavy Actions Extension
 *
 * Depends on:
 *   - gp-handoff.js  (window.gpHandoff)
 *   - guestform-core.js (window.guestforms core API + caches)
 *   - window.db (Firebase Database from dashboard bootstrap)
 *   - window.currentUid, window.currentRole (set by dashboard auth layer)
 *
 * Provides:
 *   guestformsActions.continueFromEntry(entryId)
 *   guestformsActions.deleteEntry(entryId)
 *   guestformsActions.openGuestInfoPage(gid, entryId?)
 *   guestformsActions.startNewLead()
 *
 * On success, all navigation routes call gpHandoff.open(), which packages
 * the data into a redirect to the Guest Portal (`gp-app.js`) so the portal
 * can load the correct record and auto-advance to the right step.
 * ------------------------------------------------------------------------ */

(function(){

  if (!window.guestforms){
    console.warn("[guestform-actions] guestform-core.js not loaded; actions limited.");
  }

  /* --------------------------------------------------------------------
   * CONFIG / SHORTCUTS
   * ------------------------------------------------------------------ */
  const DEST = window.GUESTINFO_PAGE || "../html/guestinfo.html";
  const db   = () => window.db; // lazy getter because dashboard may init later

  const ROLES = { ME:"me", LEAD:"lead", DM:"dm", ADMIN:"admin" };
  const isAdmin = r => r === ROLES.ADMIN;
  const isDM    = r => r === ROLES.DM;
  const isLead  = r => r === ROLES.LEAD;
  function canDeleteForm(role){ return isAdmin(role) || isDM(role) || isLead(role); }

  /* --------------------------------------------------------------------
   * Helpers to reach core caches safely
   * ------------------------------------------------------------------ */
  function formsCache(){ return (window.guestforms && window.guestforms._getFormsCache()) || {}; }
  function guestinfoCache(){ return (window.guestforms && window.guestforms._getGuestinfoCache()) || {}; }
  function usersCache(){ return (window.guestforms && window.guestforms._getUsersCache()) || {}; }
  const digitsOnly = (window.guestforms && window.guestforms._digitsOnly) ||
                     (str => (str||"").replace(/\D+/g,""));

  function setGuestinfoCache(obj){
    if (window.guestforms && typeof window.guestforms._setGuestinfoCache === "function"){
      window.guestforms._setGuestinfoCache(obj);
    } else {
      window._guestinfo = obj;
    }
  }
  function setFormsCache(obj){
    if (window.guestforms && typeof window.guestforms._setFormsCache === "function"){
      window.guestforms._setFormsCache(obj);
    }
  }
  function rerenderSoon(){
    if (window.guestforms && typeof window.guestforms._scheduleRerender === "function"){
      window.guestforms._scheduleRerender(10);
    }
  }

  /* --------------------------------------------------------------------
   * Build uistart hint from a guestinfo object or form
   * ------------------------------------------------------------------ */
  function computeUiStartFromGuest(g){
    if (!g) return "step1";
    const st = (g.status || "").toLowerCase();
    if (st === "proposal" || st === "sold") return "step3";
    if (g.prefilledStep1 || g.custName || g.custPhone) return "step2";
    return "step1";
  }
  function computeUiStartFromForm(f){
    if (!f) return "step1";
    const g = {
      status: "new",
      custName: f.guestName,
      custPhone: f.guestPhone || f.guestPhoneDigits,
      prefilledStep1: !!(f.guestName || f.guestPhone || f.guestPhoneDigits)
    };
    return computeUiStartFromGuest(g);
  }

  /* --------------------------------------------------------------------
   * Handoff wrapper
   * ------------------------------------------------------------------ */
  function doHandoff(opts){
    // opts: {gid, entry, name, phone, status, prefilledStep1}
    const ui = computeUiStartFromGuest(opts);
    const payload = {
      dest: DEST,
      gid: opts.gid || null,
      entry: opts.entry || null,
      name: opts.name || "",
      phone: opts.phone || "",
      status: opts.status || "new",
      prefilledStep1: !!opts.prefilledStep1,
      uistart: ui
    };
    gpHandoff.open(payload);
  }

  /* --------------------------------------------------------------------
   * continueFromEntry(entryId)
   * Heavy path used when clicking Continue/Open from the intake queue.
   * - Loads latest entry snapshot.
   * - If already linked -> ensure claim metadata -> handoff.
   * - Else create guestinfo record seeded w/ Step1 + status working/new.
   * - Link entry to guestinfo (guestinfoKey + claimed/consumed metadata).
   * - Refresh caches + rerender.
   * - Handoff to portal.
   * ------------------------------------------------------------------ */
  async function continueFromEntry(entryId){
    const uid = window.currentUid;
    if (!db()){
      alert("Database not ready.");
      return;
    }

    let entrySnap, entry;
    try{
      entrySnap = await db().ref(`guestEntries/${entryId}`).get();
      entry = entrySnap.val();
    }catch(err){
      console.error("[guestform-actions] load entry error",err);
      alert("Error loading guest form. See console.");
      return;
    }
    if (!entry){
      alert("Guest form not found.");
      return;
    }

    // If already linked, ensure metadata and handoff.
    if (entry.guestinfoKey){
      const gid = entry.guestinfoKey;
      try{
        const up = {};
        if (!entry.consumedBy) up[`guestEntries/${entryId}/consumedBy`] = uid || null;
        if (!entry.consumedAt) up[`guestEntries/${entryId}/consumedAt`] = Date.now();
        if (!entry.claimedBy)  up[`guestEntries/${entryId}/claimedBy`]  = uid || null;
        if (Object.keys(up).length) await db().ref().update(up);
      }catch(e){ console.warn("[guestform-actions] metadata patch failed",e); }

      const g = guestinfoCache()[gid] || (window._guestinfo && window._guestinfo[gid]) || null;
      doHandoff({
        gid,
        entry: entryId,
        name:  g?.custName || entry.guestName || "",
        phone: g?.custPhone || entry.guestPhone || entry.guestPhoneDigits || "",
        status: g?.status || "new",
        prefilledStep1: !!(g?.prefilledStep1 || g?.custName || g?.custPhone || entry.guestName || entry.guestPhone)
      });
      return;
    }

    /* ----------- Create guestinfo from intake row ----------- */
    const name   = entry.guestName  || "";
    const phone  = entry.guestPhone || entry.guestPhoneDigits || "";
    const digits = digitsOnly(phone);
    const ts     = entry.timestamp || Date.now();
    const step1Done = !!(name || digits);
    const statusInit = step1Done ? "working" : "new"; // start eval

    const payload = {
      custName:  name,
      custPhone: phone,
      custPhoneDigits: digits || null,
      submittedAt: ts,
      userUid: uid || null,
      status: statusInit,
      prefilledStep1: step1Done,
      evaluate: {},  // avoid undefined
      solution: {},
      source: { type:"guestForm", entryId }
    };

    let guestKey;
    try{
      const gRef = await db().ref("guestinfo").push(payload);
      guestKey = gRef.key;
    }catch(err){
      console.error("[guestform-actions] create guestinfo failed",err);
      alert("Error creating guest record. See console.");
      return;
    }

    // Link intake row
    try{
      await db().ref(`guestEntries/${entryId}`).update({
        guestinfoKey: guestKey,
        consumedBy: uid || null,
        consumedAt: Date.now(),
        claimedBy: entry.claimedBy || uid || null
      });
    }catch(err){
      console.warn("[guestform-actions] link entry->guestinfo failed",err);
    }

    // Update local caches (optimistic)
    const fc = Object.assign({}, formsCache());
    if (fc[entryId]){
      fc[entryId].guestinfoKey = guestKey;
      fc[entryId].consumedBy   = uid || null;
      fc[entryId].consumedAt   = Date.now();
      if (!fc[entryId].claimedBy) fc[entryId].claimedBy = uid || null;
    }
    setFormsCache(fc);

    const gc = Object.assign({}, guestinfoCache());
    gc[guestKey] = payload;
    setGuestinfoCache(gc);

    rerenderSoon();

    if (!window.GUESTFORMS_NO_REDIRECT){
      doHandoff({
        gid: guestKey,
        entry: entryId,
        name,
        phone,
        status: statusInit,
        prefilledStep1: step1Done
      });
    }
  }

  /* --------------------------------------------------------------------
   * deleteEntry(entryId)
   * Destructive delete (intake only). Linked guestinfo NOT removed.
   * ------------------------------------------------------------------ */
  async function deleteEntry(entryId){
    const role = window.currentRole;
    if (!canDeleteForm(role)){
      alert("You don't have permission to delete this form.");
      return;
    }
    if (!db()){
      alert("Database not ready.");
      return;
    }

    let entry;
    try{
      const snap = await db().ref(`guestEntries/${entryId}`).get();
      entry = snap.val();
    }catch(err){
      console.error("[guestform-actions] load entry for delete failed",err);
      alert("Error loading form. See console.");
      return;
    }
    if (!entry) return;

    const linked = !!entry.guestinfoKey;
    const msg = linked
      ? "Delete this guest form submission? (The full guest record will NOT be deleted.)"
      : "Delete this guest form submission?";
    if (!confirm(msg)) return;

    try{
      await db().ref(`guestEntries/${entryId}`).remove();
    }catch(err){
      console.error("[guestform-actions] delete entry failed",err);
      alert("Error deleting form. See console.");
      return;
    }

    // Update cache & rerender
    const fc = Object.assign({}, formsCache());
    delete fc[entryId];
    setFormsCache(fc);
    rerenderSoon();
  }

  /* --------------------------------------------------------------------
   * openGuestInfoPage(gid, entryId?)
   * Guarantee we handoff w/ best data we can gather (guestinfo snapshot).
   * ------------------------------------------------------------------ */
  function openGuestInfoPage(gid, entryId){
    const g = guestinfoCache()[gid] || (window._guestinfo && window._guestinfo[gid]) || null;

    doHandoff({
      gid,
      entry: entryId || null,
      name:  g?.custName || "",
      phone: g?.custPhone || "",
      status: g?.status || "new",
      prefilledStep1: !!(g?.prefilledStep1 || g?.custName || g?.custPhone)
    });
  }

  /* --------------------------------------------------------------------
   * startNewLead() – blank portal
   * ------------------------------------------------------------------ */
  function startNewLead(){
    doHandoff({
      gid:null,
      entry:null,
      name:"",
      phone:"",
      status:"new",
      prefilledStep1:false
    });
  }

  /* --------------------------------------------------------------------
   * Patch guestforms (core) to use our heavy actions automatically
   * ------------------------------------------------------------------ */
  if (window.guestforms){
    window.guestforms.continueToGuestInfo   = continueFromEntry;
    window.guestforms.deleteGuestFormEntry  = deleteEntry;
    window.guestforms.openGuestInfoPage     = openGuestInfoPage;
    window.guestforms.startNewLead          = startNewLead;
  }

  /* --------------------------------------------------------------------
   * Public actions namespace
   * ------------------------------------------------------------------ */
  window.guestformsActions = {
    continueFromEntry,
    deleteEntry,
    openGuestInfoPage,
    startNewLead
  };

})();