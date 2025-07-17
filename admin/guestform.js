(() => {
  const ROLES = { ME:"me", LEAD:"lead", DM:"dm", ADMIN:"admin" };
  window.GUESTINFO_PAGE = window.GUESTINFO_PAGE || "../employee/guestinfo.html";

  /* ================================================================
     Realtime caches
     ================================================================ */
  let _bound = false;
  let _rerenderTimer = null;

  // global so dashboard & other modules can see current data
  window._guestFormsCache = window._guestFormsCache || {};
  window._guestinfo       = window._guestinfo       || {};

  /* ================================================================
     Role helpers
     ================================================================ */
  const isAdmin = r => r === ROLES.ADMIN;
  const isDM    = r => r === ROLES.DM;
  const isLead  = r => r === ROLES.LEAD;
  const isMe    = r => r === ROLES.ME;

  // Admin, DM, Lead may delete an intake form.
  function canDeleteForm(role){
    return isAdmin(role) || isDM(role) || isLead(role);
  }

  /* ================================================================
     Visibility: which guestEntries does the viewer see?
     - Admin / DM: all
     - Lead / ME: unclaimed or claimedBy self
     ================================================================ */
  function visibleGuestForms(formsObj, currentRole, currentUid){
    if (!formsObj) return {};
    if (isAdmin(currentRole) || isDM(currentRole)) return formsObj;
    const out = {};
    for (const [id,f] of Object.entries(formsObj)){
      const claimedBy = f.consumedBy || f.claimedBy;
      if (!claimedBy || claimedBy === currentUid) out[id] = f;
    }
    return out;
  }

  /* ================================================================
     Date helpers
     ================================================================ */
  const startOfTodayMs = () => { const d=new Date(); d.setHours(0,0,0,0); return d.getTime(); };
  const endOfTodayMs   = () => { const d=new Date(); d.setHours(23,59,59,999); return d.getTime(); };

  /* ================================================================
     DUP helper (match phone in guestinfo)
     ================================================================ */
  const digitsOnly = str => (str||"").replace(/\D+/g,"");
  function findGuestinfoByPhone(guestinfoObj, phone){
    const pd = digitsOnly(phone);
    if (!pd) return null;
    for (const [gid,g] of Object.entries(guestinfoObj||{})){
      if (digitsOnly(g.custPhone) === pd) return {gid,g};
    }
    return null;
  }

  /* ================================================================
     Escape HTML for safe text injection
     ================================================================ */
  function esc(str){
    return (str ?? "")
      .toString()
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;")
      .replace(/'/g,"&#39;");
  }

  /* ================================================================
     Render Section -> HTML
     ================================================================ */
  function renderGuestFormsSection(guestForms, currentRole, currentUid){
    currentUid  = currentUid  || window.currentUid;
    currentRole = currentRole || window.currentRole;

    const formsObj = guestForms || {};
    const visForms = visibleGuestForms(formsObj, currentRole, currentUid);
    const guestinfoObj = window._guestinfo || {};

    const idsAll = Object.keys(visForms);
    if (!idsAll.length){
      return `
        <section id="guest-forms-section" class="admin-section guest-forms-section">
          <h2>Guest Form Submissions</h2>
          <p class="text-center">No guest form submissions.</p>
        </section>`;
    }

    // sort newest first
    idsAll.sort((a,b)=>(visForms[b].timestamp||0)-(visForms[a].timestamp||0));

    // default filter state
    if (typeof window._guestforms_showAll === "undefined") window._guestforms_showAll = false;

    const startToday = startOfTodayMs();
    const endToday   = endOfTodayMs();

    const idsRender = window._guestforms_showAll
      ? idsAll
      : idsAll.filter(id=>{
          const ts = visForms[id].timestamp || 0;
          return ts >= startToday && ts <= endToday;
        });

    const showingTodayOnly = !window._guestforms_showAll;

    // Are there any non-today rows? Controls toggle visibility.
    const anyOlder = idsAll.some(id => {
      const ts = visForms[id].timestamp || 0;
      return ts < startToday || ts > endToday;
    });

    const rowsHtml = idsRender.map(id=>{
      const f = visForms[id];
      const ts = f.timestamp ? new Date(f.timestamp).toLocaleString() : "-";
      const name = esc(f.guestName || "-");
      const phone = esc(f.guestPhone || "-");
      const consumed = !!(f.guestinfoKey || f.consumedBy);
      const actionLabel = consumed ? "Open" : "Continue";

      const dup = findGuestinfoByPhone(guestinfoObj, f.guestPhone);
      const dupBadge = dup ? `<span class="role-badge role-guest" title="Existing lead">DUP</span>` : "";

      const claimInfo = consumed
        ? `<small style="opacity:.7;">claimed</small>`
        : `<small style="opacity:.7;">unclaimed</small>`;

      const delBtn = canDeleteForm(currentRole)
        ? `<button class="btn btn-danger btn-sm" onclick="window.guestforms.deleteGuestFormEntry('${id}')">Delete</button>`
        : "";

      return `<tr class="${consumed?'consumed':''}">
        <td data-label="Name">${name} ${dupBadge}</td>
        <td data-label="Phone">${phone}</td>
        <td data-label="Submitted">${ts}<br>${claimInfo}</td>
        <td data-label="Action">
          <button class="btn btn-primary btn-sm" onclick="window.guestforms.continueToGuestInfo('${id}')">${actionLabel}</button>
          ${delBtn}
        </td>
      </tr>`;
    }).join("");

    // fallback row if filter hides everything
    const emptyTodayRow = `<tr><td colspan="4" class="text-center"><i>No guest forms in this view.</i></td></tr>`;
    const bodyHtml = rowsHtml.length ? rowsHtml : emptyTodayRow;

    const toggleBtn = anyOlder
      ? `<button class="btn btn-secondary btn-sm" onclick="window.guestforms.toggleShowAll()">
           ${showingTodayOnly ? "Show All" : "Show Today"}
         </button>`
      : "";

    return `
      <section id="guest-forms-section" class="admin-section guest-forms-section">
        <h2>Guest Form Submissions</h2>
        <div class="review-controls" style="justify-content:flex-end;">${toggleBtn}</div>
        <div class="guest-forms-table-wrap">
          <table class="store-table guest-forms-table table-stackable">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Submitted</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>${bodyHtml}</tbody>
          </table>
        </div>
      </section>
    `;
  }

  /* ================================================================
     DOM Patch
     ================================================================ */
  function patchGuestFormsDom(){
    const html = renderGuestFormsSection(window._guestFormsCache, window.currentRole, window.currentUid);
    const existing = document.getElementById("guest-forms-section");
    if (!existing){
      // section not yet rendered; let next full render include it
      return;
    }
    existing.outerHTML = html;
  }

  function scheduleRerender(delay=60){
    if (_rerenderTimer) return;
    _rerenderTimer = setTimeout(()=>{
      _rerenderTimer = null;
      patchGuestFormsDom();
    }, delay);
  }

  /* ================================================================
     REALTIME BIND
     ================================================================ */
  function ensureRealtime(){
    if (_bound) return;
    const db = window.db;
    if (!db) return; // call again after firebase init

    _bound = true;

    // ----- guestEntries realtime -----
    const formsRef = db.ref("guestEntries");

    // full sync once
    formsRef.once("value", snap => {
      window._guestFormsCache = snap.val() || {};
      scheduleRerender();
    });

    // incremental updates
    formsRef.on("child_added", snap => {
      window._guestFormsCache[snap.key] = snap.val();
      scheduleRerender();
    });
    formsRef.on("child_changed", snap => {
      window._guestFormsCache[snap.key] = snap.val();
      scheduleRerender();
    });
    formsRef.on("child_removed", snap => {
      delete window._guestFormsCache[snap.key];
      scheduleRerender();
    });

    // ----- guestinfo realtime (needed for DUP + claimed status) -----
    const giRef = db.ref("guestinfo");
    giRef.on("value", snap => {
      window._guestinfo = snap.val() || {};
      scheduleRerender();
    });
  }

  /* ================================================================
     UI actions
     ================================================================ */
  function toggleShowAll(){
    window._guestforms_showAll = !window._guestforms_showAll;
    patchGuestFormsDom();
  }

  async function continueToGuestInfo(entryId){
    const currentUid = window.currentUid;
    if (!window.db){
      alert("Database not ready.");
      return;
    }

    const entrySnap = await window.db.ref(`guestEntries/${entryId}`).get();
    const entry = entrySnap.val();
    if (!entry){
      alert("Guest form not found.");
      return;
    }

    if (entry.guestinfoKey){
      openGuestInfoPage(entry.guestinfoKey);
      return;
    }

    const payload = {
      custName:    entry.guestName || "",
      custPhone:   entry.guestPhone || "",
      submittedAt: entry.timestamp || Date.now(),
      userUid:     currentUid || null,
      status:      "new",
      source: { type:"guestForm", entryId }
    };

    const gRef = await window.db.ref("guestinfo").push(payload);
    const guestKey = gRef.key;

    await window.db.ref(`guestEntries/${entryId}`).update({
      guestinfoKey: guestKey,
      consumedBy: currentUid || null,
      consumedAt: Date.now()
    });

    // caches will update via realtime; patch quickly anyway
    scheduleRerender();

    if (!window.GUESTFORMS_NO_REDIRECT){
      openGuestInfoPage(guestKey);
    }
  }

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
      // realtime handles UI update
    } catch (err) {
      alert("Error deleting form: " + err.message);
    }
  }

  function openGuestInfoPage(guestKey){
    const base = window.GUESTINFO_PAGE || "guest-info.html";
    const sep  = base.includes("?") ? "&" : "?";
    const url  = `${base}${sep}entry=${encodeURIComponent(guestKey)}&gid=${encodeURIComponent(guestKey)}`;
    try { localStorage.setItem("last_guestinfo_key", guestKey); } catch(_){}
    window.location.href = url;
  }

  /* ================================================================
     Expose
     ================================================================ */
  window.guestforms = {
    renderGuestFormsSection,
    toggleShowAll,
    continueToGuestInfo,
    deleteGuestFormEntry,
    ensureRealtime
  };

  // Auto-attempt bind in case db already set by load order
  if (window.db) ensureRealtime();
})();