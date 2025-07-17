<script>
(() => {
  const ROLES = { ME:"me", LEAD:"lead", DM:"dm", ADMIN:"admin" };

  /* Path to detailed guest-info workflow page (update if moved). */
  window.GUESTINFO_PAGE = window.GUESTINFO_PAGE || "../employee/guestinfo.html";

  /* ------------------------------------------------------------------
     Local realtime caches
     ------------------------------------------------------------------ */
  let _gfRealtimeBound = false;
  let _gfRerenderTimer = null;

  // Always mirror latest form + guestinfo data for fast render / dup check
  window._guestFormsCache = window._guestFormsCache || {};
  window._guestinfo       = window._guestinfo       || {};

  /* ------------------------------------------------------------------
     Role helpers
     ------------------------------------------------------------------ */
  const isAdmin = r => r === ROLES.ADMIN;
  const isDM    = r => r === ROLES.DM;
  const isLead  = r => r === ROLES.LEAD;
  const isMe    = r => r === ROLES.ME;

  // Admin, DM, Lead can delete guest form intakes.
  function canDeleteForm(role){
    return isAdmin(role) || isDM(role) || isLead(role);
  }

  /* ------------------------------------------------------------------
     Visibility filter
     - Admin / DM: all
     - Lead / ME: unclaimed + claimedBy self
     ------------------------------------------------------------------ */
  function visibleGuestForms(formsObj, currentRole, currentUid){
    if (!formsObj) return {};
    if (isAdmin(currentRole) || isDM(currentRole)) return formsObj;

    const out = {};
    for (const [id, f] of Object.entries(formsObj)){
      const claimedBy = f.consumedBy || f.claimedBy;
      if (!claimedBy || claimedBy === currentUid){
        out[id] = f;
      }
    }
    return out;
  }

  /* ------------------------------------------------------------------
     Date helpers: start/end of today
     ------------------------------------------------------------------ */
  function startOfTodayMs(){
    const d = new Date();
    d.setHours(0,0,0,0);
    return d.getTime();
  }
  function endOfTodayMs(){
    const d = new Date();
    d.setHours(23,59,59,999);
    return d.getTime();
  }

  /* ------------------------------------------------------------------
     Duplicate phone helper (match against guestinfo cache)
     ------------------------------------------------------------------ */
  const digitsOnly = str => (str||"").replace(/\D+/g,"");
  function findGuestinfoByPhone(guestinfoObj, phone){
    const pd = digitsOnly(phone);
    if (!pd) return null;
    for (const [gid,g] of Object.entries(guestinfoObj||{})){
      if (digitsOnly(g.custPhone) === pd) return {gid,g};
    }
    return null;
  }

  /* ------------------------------------------------------------------
     RENDER SECTION
     ------------------------------------------------------------------ */
  function renderGuestFormsSection(guestForms, currentRole, currentUid){
    currentUid  = currentUid  || window.currentUid;
    currentRole = currentRole || window.currentRole;

    const fullFormsObj = guestForms || {};
    const visFormsObj  = visibleGuestForms(fullFormsObj, currentRole, currentUid);
    const guestinfoObj = window._guestinfo || {};

    const idsAll = Object.keys(visFormsObj);
    if (!idsAll.length){
      return `
        <section class="admin-section guest-forms-section">
          <h2>Guest Form Submissions</h2>
          <p class="text-center">No guest form submissions.</p>
        </section>`;
    }

    // sort newest first
    idsAll.sort((a,b) => (visFormsObj[b].timestamp||0) - (visFormsObj[a].timestamp||0));

    // default to TODAY if not set
    if (typeof window._guestforms_showAll === "undefined"){
      window._guestforms_showAll = false;
    }

    const startToday = startOfTodayMs();
    const endToday   = endOfTodayMs();

    const idsRender = window._guestforms_showAll
      ? idsAll
      : idsAll.filter(id => {
          const ts = visFormsObj[id].timestamp || 0;
          return ts >= startToday && ts <= endToday;
        });

    const showingTodayOnly = !window._guestforms_showAll;

    // Do we have any rows *outside* today? (controls toggle visibility)
    const anyOlder = idsAll.some(id => {
      const ts = visFormsObj[id].timestamp || 0;
      return ts < startToday || ts > endToday;
    });

    // Build table rows
    const rows = idsRender.map(id => {
      const f = visFormsObj[id];
      const ts = f.timestamp ? new Date(f.timestamp).toLocaleString() : "-";
      const name = f.guestName || "-";
      const phone = f.guestPhone || "-";
      const consumed = !!(f.guestinfoKey || f.consumedBy);
      const actionLabel = consumed ? "Open" : "Continue";

      // DUP badge
      const dup = findGuestinfoByPhone(guestinfoObj, f.guestPhone);
      const dupBadge = dup ? `<span class="role-badge role-guest" title="Existing lead">DUP</span>` : "";

      const claimInfo = consumed
        ? `<small style="opacity:.7;">claimed</small>`
        : `<small style="opacity:.7;">unclaimed</small>`;

      const deleteBtn = canDeleteForm(currentRole)
        ? `<button class="btn btn-danger btn-sm" onclick="window.guestforms.deleteGuestFormEntry('${id}')">Delete</button>`
        : "";

      return `<tr class="${consumed?'consumed':''}">
        <td data-label="Name">${name} ${dupBadge}</td>
        <td data-label="Phone">${phone}</td>
        <td data-label="Submitted">${ts}<br>${claimInfo}</td>
        <td data-label="Action">
          <button class="btn btn-primary btn-sm" onclick="window.guestforms.continueToGuestInfo('${id}')">${actionLabel}</button>
          ${deleteBtn}
        </td>
      </tr>`;
    }).join("");

    const toggleBtn = anyOlder
      ? `<button class="btn btn-secondary btn-sm" onclick="window.guestforms.toggleShowAll()">
           ${showingTodayOnly ? "Show All" : "Show Today"}
         </button>`
      : "";

    const emptyTodayMsg = (!window._guestforms_showAll && !rows)
      ? `<tr><td colspan="4" class="text-center"><i>No guest forms today.</i></td></tr>`
      : "";

    return `
      <section class="admin-section guest-forms-section">
        <h2>Guest Form Submissions</h2>
        <div class="review-controls" style="justify-content:flex-end;">${toggleBtn}</div>
        <div class="guest-forms-table-wrap">
          <table class="store-table guest-forms-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Submitted</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>${rows || emptyTodayMsg}</tbody>
          </table>
        </div>
      </section>
    `;
  }

  /* ------------------------------------------------------------------
     Partial DOM patch: replace the guest-forms-section in page
     ------------------------------------------------------------------ */
  function patchGuestFormsDom(){
    const target = document.querySelector(".guest-forms-section");
    const html   = renderGuestFormsSection(window._guestFormsCache, window.currentRole, window.currentUid);
    if (!target){
      // section not yet rendered; force full dashboard render
      if (typeof window.renderAdminApp === "function") window.renderAdminApp();
      return;
    }
    // Replace outerHTML to rebuild section cleanly
    target.outerHTML = html;
  }

  /* ------------------------------------------------------------------
     Throttled rerender (prevents cascade of renders on many updates)
     ------------------------------------------------------------------ */
  function scheduleGuestFormsRerender(delay=75){
    if (_gfRerenderTimer) return;
    _gfRerenderTimer = setTimeout(() => {
      _gfRerenderTimer = null;
      patchGuestFormsDom();
    }, delay);
  }

  /* ------------------------------------------------------------------
     Realtime init (idempotent)
     ------------------------------------------------------------------ */
  function ensureRealtime(){
    if (_gfRealtimeBound) return;
    const db = window.db; // set by dashboard.js after firebase init
    if (!db) return;      // try again later; dashboard should call again after init

    _gfRealtimeBound = true;

    // guestEntries live
    db.ref("guestEntries").on("value", snap => {
      window._guestFormsCache = snap.val() || {};
      scheduleGuestFormsRerender();
    });

    // guestinfo live (needed for DUP detection + claimed statuses)
    db.ref("guestinfo").on("value", snap => {
      window._guestinfo = snap.val() || {};
      scheduleGuestFormsRerender();
    });
  }

  /* ------------------------------------------------------------------
     Toggle Today<->All & re-render
     ------------------------------------------------------------------ */
  function toggleShowAll(){
    window._guestforms_showAll = !window._guestforms_showAll;
    patchGuestFormsDom();
  }

  /* ------------------------------------------------------------------
     Continue / Open flow
     ------------------------------------------------------------------ */
  async function continueToGuestInfo(entryId){
    const currentUid = window.currentUid;
    if (!window.db){
      alert("Database not ready.");
      return;
    }

    // read entry fresh
    const entrySnap = await window.db.ref(`guestEntries/${entryId}`).get();
    const entry = entrySnap.val();
    if (!entry){
      alert("Guest form not found.");
      return;
    }

    // Already linked?
    if (entry.guestinfoKey){
      openGuestInfoPage(entry.guestinfoKey);
      return;
    }

    // build guestinfo payload
    const payload = {
      custName:    entry.guestName || "",
      custPhone:   entry.guestPhone || "",
      submittedAt: entry.timestamp || Date.now(),
      userUid:     currentUid || null,
      status:      "new",
      source: {
        type: "guestForm",
        entryId
      }
    };

    // write new guestinfo
    const gRef = await window.db.ref("guestinfo").push(payload);
    const guestKey = gRef.key;

    // back link on form
    await window.db.ref(`guestEntries/${entryId}`).update({
      guestinfoKey: guestKey,
      consumedBy: currentUid || null,
      consumedAt: Date.now()
    });

    // caches will update via realtime; just patch quickly
    scheduleGuestFormsRerender();

    if (!window.GUESTFORMS_NO_REDIRECT){
      openGuestInfoPage(guestKey);
    }
  }

  /* ------------------------------------------------------------------
     Delete form
     ------------------------------------------------------------------ */
  async function deleteGuestFormEntry(entryId){
    if (!canDeleteForm(window.currentRole)){
      alert("You don't have permission to delete this form.");
      return;
    }
    const entrySnap = await window.db.ref(`guestEntries/${entryId}`).get();
    const entry = entrySnap.val();
    if (!entry) return;

    const linked = !!entry.guestinfoKey;
    const msg = linked
      ? "Delete this guest form submission? (The full guest info record will NOT be deleted.)"
      : "Delete this guest form submission?";
    if (!confirm(msg)) return;

    try {
      await window.db.ref(`guestEntries/${entryId}`).remove();
      // realtime listener will update cache & UI
    } catch (err) {
      alert("Error deleting form: " + err.message);
    }
  }

  /* ------------------------------------------------------------------
     Helper: open guest info page
     ------------------------------------------------------------------ */
  function openGuestInfoPage(guestKey){
    const base = window.GUESTINFO_PAGE || "guest-info.html";
    const sep  = base.includes("?") ? "&" : "?";
    const url  = `${base}${sep}entry=${encodeURIComponent(guestKey)}&gid=${encodeURIComponent(guestKey)}`;
    try { localStorage.setItem("last_guestinfo_key", guestKey); } catch(_) {}
    window.location.href = url;
  }

  /* ------------------------------------------------------------------
     Expose
     ------------------------------------------------------------------ */
  window.guestforms = {
    renderGuestFormsSection,
    toggleShowAll,
    continueToGuestInfo,
    deleteGuestFormEntry,
    ensureRealtime
  };

  // OPTIONAL auto-init if db already present when script loads
  if (window.db) ensureRealtime();

})();
</script>