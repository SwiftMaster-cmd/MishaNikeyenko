(() => {
  const ROLES = { ME:"me", LEAD:"lead", DM:"dm", ADMIN:"admin" };

  /* Path to detailed guest-info workflow page.
     Adjust if you move the file. */
  window.GUESTINFO_PAGE = window.GUESTINFO_PAGE || "../employee/guestinfo.html";

  /* --------------------------------------------------------------
     Role helpers
     -------------------------------------------------------------- */
  function isAdmin(role){ return role === ROLES.ADMIN; }
  function isDM(role){ return role === ROLES.DM; }
  function isLead(role){ return role === ROLES.LEAD; }
  function isMe(role){ return role === ROLES.ME; }

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

    const ids = Object.keys(visFormsObj);
    if (!ids.length){
      return `
        <section class="admin-section guest-forms-section">
          <h2>Guest Form Submissions</h2>
          <p class="text-center">No new guest form submissions.</p>
        </section>`;
    }

    // sort newest first
    ids.sort((a,b) => (visFormsObj[b].timestamp||0) - (visFormsObj[a].timestamp||0));

    // top controls: show/hide consumed (only if there are consumed)
    const anyConsumed = ids.some(id => visFormsObj[id].guestinfoKey || visFormsObj[id].consumedBy);
    const showAll = !isMe(currentRole) && !isLead(currentRole); // admin/dm default show all
    // We'll set a data attr & let toggle button re-render by flipping global
    if (typeof window._guestforms_showAll === "undefined"){
      window._guestforms_showAll = showAll;
    }

    const rows = ids
      .filter(id => {
        if (window._guestforms_showAll) return true;
        const f = visFormsObj[id];
        return !(f.guestinfoKey || f.consumedBy); // only unclaimed
      })
      .map(id => {
        const f = visFormsObj[id];
        const ts = f.timestamp ? new Date(f.timestamp).toLocaleString() : "-";
        const name = f.guestName || "-";
        const phone = f.guestPhone || "-";
        const consumed = !!(f.guestinfoKey || f.consumedBy);
        const actionLabel = consumed ? "Open" : "Continue";

        // dup?
        const dup = findGuestinfoByPhone(guestinfoObj, f.guestPhone);
        const dupBadge = dup ? `<span class="role-badge role-guest" title="Existing lead">DUP</span>` : "";

        // claim info string
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
      })
      .join("");

    const toggleBtn = anyConsumed
      ? `<button class="btn btn-secondary btn-sm" onclick="window.guestforms.toggleShowAll()">
           ${window._guestforms_showAll ? "Hide Claimed" : "Show All"}
         </button>`
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
            <tbody>${rows}</tbody>
          </table>
        </div>
      </section>
    `;
  }

  /* --------------------------------------------------------------
     Toggle show/hide consumed & re-render
     -------------------------------------------------------------- */
  function toggleShowAll(){
    window._guestforms_showAll = !window._guestforms_showAll;
    window.renderAdminApp();
  }

  /* --------------------------------------------------------------
     Continue / Open flow
     - If form already linked to guestinfoKey, just open page
     - Else create new guestinfo record seeded w/ name/phone
     - Mark form consumed
     - Redirect (unless suppressed)
     -------------------------------------------------------------- */
  async function continueToGuestInfo(entryId){
    const currentUid  = window.currentUid;
    const currentRole = window.currentRole;

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
     - If linked, warn user we are only deleting the form intake;
       the full guestinfo stays.
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
     -------------------------------------------------------------- */
  function openGuestInfoPage(guestKey){
    const base = window.GUESTINFO_PAGE || "guest-info.html";
    const sep  = base.includes("?") ? "&" : "?";
    window.location.href = `${base}${sep}gid=${encodeURIComponent(guestKey)}`;
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