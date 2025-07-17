(() => {
  const ROLES = { ME:"me", LEAD:"lead", DM:"dm", ADMIN:"admin" };

  /* Path to detailed guest-info workflow page (correct w/ hyphen). */
  window.GUESTINFO_PAGE = window.GUESTINFO_PAGE || "../employee/guestinfo.html";

  /* --------------------------------------------------------------
     Role helpers
     -------------------------------------------------------------- */
  const isAdmin = r => r === ROLES.ADMIN;
  const isDM    = r => r === ROLES.DM;
  const isLead  = r => r === ROLES.LEAD;
  const isMe    = r => r === ROLES.ME;

  function canDeleteForm(role){
    return isAdmin(role) || isDM(role);
  }

  /* --------------------------------------------------------------
     Visibility filter
     - Admin / DM: all
     - Lead / ME: unclaimed + claimedBy self
     -------------------------------------------------------------- */
  function visibleGuestForms(formsObj, currentRole, currentUid){
    if (!formsObj) return {};
    if (isAdmin(currentRole) || isDM(currentRole)) return formsObj;

    const out = {};
    for (const [id, f] of Object.entries(formsObj)){
      const claimedBy = f.consumedBy || f.claimedBy;
      const unclaimed = !claimedBy;
      if (unclaimed || claimedBy === currentUid){
        out[id] = f;
      }
    }
    return out;
  }

  /* --------------------------------------------------------------
     Date helpers: start/end of *today* in local browser tz
     -------------------------------------------------------------- */
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

  /* --------------------------------------------------------------
     Duplicate flag helper (phone match in guestinfo)
     -------------------------------------------------------------- */
  function phoneDigits(str){
    return (str||"").replace(/\D+/g,"");
  }
  function findGuestinfoByPhone(guestinfoObj, phone){
    if (!phone) return null;
    const pd = phoneDigits(phone);
    if (!pd) return null;
    for (const [gid,g] of Object.entries(guestinfoObj||{})){
      if (phoneDigits(g.custPhone) === pd) return {gid,g};
    }
    return null;
  }

  /* --------------------------------------------------------------
     Render section
     -------------------------------------------------------------- */
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

    // sort newest first across full visible set
    idsAll.sort((a,b) => (visFormsObj[b].timestamp||0) - (visFormsObj[a].timestamp||0));

    // default to TODAY view unless global toggle set
    if (typeof window._guestforms_showAll === "undefined"){
      window._guestforms_showAll = false; // start-of-day default
    }

    const startToday = startOfTodayMs();
    const endToday   = endOfTodayMs();

    // which IDs to render?
    const idsRender = window._guestforms_showAll
      ? idsAll
      : idsAll.filter(id => {
          const ts = visFormsObj[id].timestamp || 0;
          return ts >= startToday && ts <= endToday;
        });

    const showingTodayOnly = !window._guestforms_showAll;

    // detect if there ARE entries outside today (to decide if toggle shown)
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

      // dup?
      const dup = findGuestinfoByPhone(guestinfoObj, f.guestPhone);
      const dupBadge = dup ? `<span class="role-badge role-guest" title="Existing lead">DUP</span>` : "";

      const claimInfo = consumed
        ? `<small style="opacity:.7;">claimed</small>`
        : `<small style="opacity:.7;">unclaimed</small>`;

      const deleteBtn = canDeleteForm(currentRole)
        ? `<button class="btn btn-danger btn-sm" onclick="window.guestforms.deleteGuestFormEntry('${id}')">Delete</button>`
        : "";

      return `<tr class="${consumed?'consumed':''}">
        <td>${name} ${dupBadge}</td>
        <td>${phone}</td>
        <td>${ts}<br>${claimInfo}</td>
        <td>
          <button class="btn btn-primary btn-sm" onclick="window.guestforms.continueToGuestInfo('${id}')">${actionLabel}</button>
          ${deleteBtn}
        </td>
      </tr>`;
    }).join("");

    // toggle button (only render if older items exist)
    const toggleBtn = anyOlder
      ? `<button class="btn btn-secondary btn-sm" onclick="window.guestforms.toggleShowAll()">
           ${showingTodayOnly ? "Show All" : "Show Today"}
         </button>`
      : "";

    // Empty-today message if no today's rows but we have older
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

  /* --------------------------------------------------------------
     Toggle Today<->All & re-render
     -------------------------------------------------------------- */
  function toggleShowAll(){
    window._guestforms_showAll = !window._guestforms_showAll;
    window.renderAdminApp();
  }

  /* --------------------------------------------------------------
     Continue / Open flow
     -------------------------------------------------------------- */
  async function continueToGuestInfo(entryId){
    const currentUid = window.currentUid;

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
        entryId: entryId
      }
    };

    // write
    const gRef = await window.db.ref("guestinfo").push(payload);
    const guestKey = gRef.key;

    // back link on form
    await window.db.ref(`guestEntries/${entryId}`).update({
      guestinfoKey: guestKey,
      consumedBy: currentUid || null,
      consumedAt: Date.now()
    });

    await window.renderAdminApp();

    if (!window.GUESTFORMS_NO_REDIRECT){
      openGuestInfoPage(guestKey);
    }
  }

  /* --------------------------------------------------------------
     Delete form
     -------------------------------------------------------------- */
  async function deleteGuestFormEntry(entryId){
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
      await window.renderAdminApp();
    } catch (err) {
      alert("Error deleting form: " + err.message);
    }
  }

  /* --------------------------------------------------------------
     Helper: open guest info page
     - Include BOTH entry & gid params for backward compatibility.
     - Store key in localStorage for extra fallback.
     -------------------------------------------------------------- */
  function openGuestInfoPage(guestKey){
    const base = window.GUESTINFO_PAGE || "guest-info.html";
    const sep  = base.includes("?") ? "&" : "?";
    const url  = `${base}${sep}entry=${encodeURIComponent(guestKey)}&gid=${encodeURIComponent(guestKey)}`;

    try { localStorage.setItem("last_guestinfo_key", guestKey); } catch(_) {}

    window.location.href = url;
  }

  /* --------------------------------------------------------------
     Expose
     -------------------------------------------------------------- */
  window.guestforms = {
    renderGuestFormsSection,
    toggleShowAll,
    continueToGuestInfo,
    deleteGuestFormEntry
  };
})();