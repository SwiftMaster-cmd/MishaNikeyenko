<!-- guestform.js -->
<script>
(() => {
  const ROLES = { ME:"me", LEAD:"lead", DM:"dm", ADMIN:"admin" };

  /* Path to detailed guest-info workflow page (update if moved). */
  window.GUESTINFO_PAGE = window.GUESTINFO_PAGE || "../employee/guestinfo.html";

  /* ------------------------------------------------------------------
     Role helpers
     ------------------------------------------------------------------ */
  const isAdmin = r => r === ROLES.ADMIN;
  const isDM    = r => r === ROLES.DM;
  const isLead  = r => r === ROLES.LEAD;
  const isMe    = r => r === ROLES.ME;

  // Admin, DM, Lead may delete.
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
     Date helpers: start/end of today (local tz)
     ------------------------------------------------------------------ */
  function startOfTodayMs(){
    const d = new Date(); d.setHours(0,0,0,0); return d.getTime();
  }
  function endOfTodayMs(){
    const d = new Date(); d.setHours(23,59,59,999); return d.getTime();
  }

  /* ------------------------------------------------------------------
     DUP helper (phone match in guestinfo)
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
     Get guestinfo status string from entry
     ------------------------------------------------------------------ */
  function entryStatus(entry, guestinfoObj){
    if (entry.guestinfoKey){
      const g = guestinfoObj[entry.guestinfoKey];
      if (g && typeof g.status === "string") return g.status;
    }
    return "new";
  }

  /* ------------------------------------------------------------------
     Visibility rule: hide PROPOSALs from intake queue
     ------------------------------------------------------------------ */
  function shouldDisplayEntry(entry, guestinfoObj){
    const st = entryStatus(entry, guestinfoObj).toLowerCase();
    return st !== "proposal";
  }

  /* ------------------------------------------------------------------
     Escape HTML
     ------------------------------------------------------------------ */
  function esc(str){
    return (str ?? "")
      .toString()
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;")
      .replace(/'/g,"&#39;");
  }

  /* ------------------------------------------------------------------
     Status badge markup
     ------------------------------------------------------------------ */
  function statusBadge(statusRaw){
    const s = (statusRaw||"").toLowerCase();
    let label = "Unknown", cls = "role-guest";
    if (s === "new")      { label="New";      cls="role-me"; }
    else if (s === "working"){label="Working";cls="role-lead";}
    else if (s === "sold")  {label="Sold";    cls="role-dm";}
    else if (s === "proposal"){label="Proposal";cls="role-guest";}
    return `<span class="role-badge ${cls}" title="${esc(statusRaw)}">${label}</span>`;
  }

  /* ------------------------------------------------------------------
     Claimed-by markup
     ------------------------------------------------------------------ */
  function claimedByMarkup(uid){
    if (!uid) return `<small style="opacity:.7;">unclaimed</small>`;
    const u  = (window._users||{})[uid];
    const nm = esc(u?.name || u?.email || uid);
    const rl = (u?.role||"").toLowerCase();
    const cls = rl ? `role-${rl}` : "role-guest";
    return `<small><span class="role-badge ${cls}">${rl?rl.toUpperCase():"?"}</span> ${nm}</small>`;
  }

  /* ------------------------------------------------------------------
     Render table rows helper
     ------------------------------------------------------------------ */
  function buildRows(ids, visFormsObj, guestinfoObj, currentRole){
    return ids.map(id=>{
      const f = visFormsObj[id];
      const ts = f.timestamp ? new Date(f.timestamp).toLocaleString() : "-";
      const name  = esc(f.guestName || "-");
      const phone = esc(f.guestPhone || "-");
      const consumed = !!(f.guestinfoKey || f.consumedBy);

      const st   = entryStatus(f, guestinfoObj);
      const stEl = statusBadge(st);

      const claimEl = claimedByMarkup(f.consumedBy || f.claimedBy);

      const dup = findGuestinfoByPhone(guestinfoObj, f.guestPhone);
      const dupBadge = dup ? `<span class="role-badge role-guest" title="Existing lead">DUP</span>` : "";

      const actionLabel = consumed ? "Open" : "Continue";
      const delBtn = canDeleteForm(currentRole)
        ? `<button class="btn btn-danger btn-sm" onclick="window.guestforms.deleteGuestFormEntry('${id}')">Delete</button>` : "";

      return `<tr class="${consumed?'consumed':''}">
        <td data-label="Name">${name} ${dupBadge}</td>
        <td data-label="Phone">${phone}</td>
        <td data-label="Submitted">${ts}</td>
        <td data-label="Status">${stEl}</td>
        <td data-label="Claimed">${claimEl}</td>
        <td data-label="Action">
          <button class="btn btn-primary btn-sm" onclick="window.guestforms.continueToGuestInfo('${id}')">${actionLabel}</button>
          ${delBtn}
        </td>
      </tr>`;
    }).join("");
  }

  /* ------------------------------------------------------------------
     Render section
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

    // newest first
    idsAll.sort((a,b)=>(visFormsObj[b].timestamp||0)-(visFormsObj[a].timestamp||0));

    // default filter state
    if (typeof window._guestforms_showAll === "undefined") window._guestforms_showAll = false;

    const startToday = startOfTodayMs();
    const endToday   = endOfTodayMs();

    // timeframe
    const idsTimeRaw = window._guestforms_showAll
      ? idsAll
      : idsAll.filter(id=>{
          const ts = visFormsObj[id].timestamp || 0;
          return ts >= startToday && ts <= endToday;
        });

    // hide proposals
    const idsTime = idsTimeRaw.filter(id => shouldDisplayEntry(visFormsObj[id], guestinfoObj));

    const showingTodayOnly = !window._guestforms_showAll;
    const anyOlder = idsAll.some(id=>{
      const ts = visFormsObj[id].timestamp || 0;
      return ts < startToday || ts > endToday;
    });

    // split claimed vs unclaimed
    const unclaimedIDs = [];
    const claimedIDs   = [];
    idsTime.forEach(id=>{
      const f = visFormsObj[id];
      const claimedBy = f.consumedBy || f.claimedBy;
      if (!claimedBy) unclaimedIDs.push(id);
      else claimedIDs.push(id);
    });

    const unclaimedRows = buildRows(unclaimedIDs, visFormsObj, guestinfoObj, currentRole);
    const claimedRows   = buildRows(claimedIDs,   visFormsObj, guestinfoObj, currentRole);

    const unclaimedEmpty = !unclaimedRows
      ? `<tr><td colspan="6" class="text-center"><i>No unclaimed forms.</i></td></tr>` : "";
    const claimedEmpty = !claimedRows
      ? `<tr><td colspan="6" class="text-center"><i>No claimed forms.</i></td></tr>` : "";

    const toggleBtn = anyOlder
      ? `<button class="btn btn-secondary btn-sm" onclick="window.guestforms.toggleShowAll()">
           ${showingTodayOnly ? "Show All" : "Show Today"}
         </button>`
      : "";

    return `
      <section class="admin-section guest-forms-section">
        <h2>Guest Form Submissions</h2>
        <div class="review-controls" style="justify-content:flex-end;">${toggleBtn}</div>

        <!-- Unclaimed -->
        <h3 class="section-subtitle" style="margin-top:1rem;">Unclaimed</h3>
        <div class="guest-forms-table-wrap">
          <table class="store-table guest-forms-table table-stackable">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Submitted</th>
                <th>Status</th>
                <th>Claimed By</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>${unclaimedRows || unclaimedEmpty}</tbody>
          </table>
        </div>

        <!-- Claimed -->
        <h3 class="section-subtitle" style="margin-top:2rem;">Claimed</h3>
        <div class="guest-forms-table-wrap">
          <table class="store-table guest-forms-table table-stackable">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Submitted</th>
                <th>Status</th>
                <th>Claimed By</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>${claimedRows || claimedEmpty}</tbody>
          </table>
        </div>
      </section>
    `;
  }

  /* ------------------------------------------------------------------
     Toggle Today<->All & re-render
     ------------------------------------------------------------------ */
  function toggleShowAll(){
    window._guestforms_showAll = !window._guestforms_showAll;
    window.renderAdminApp();
  }

  /* ------------------------------------------------------------------
     Continue / Open flow
     ------------------------------------------------------------------ */
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
      // If linked guestinfo is proposal, we still just open it (user wants to work in guestinfo)
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

    // back link on form (record who consumed incl role)
    await window.db.ref(`guestEntries/${entryId}`).update({
      guestinfoKey: guestKey,
      consumedBy: currentUid || null,
      consumedRole: currentRole || null,
      consumedAt: Date.now()
    });

    await window.renderAdminApp();

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
      await window.renderAdminApp();
    } catch (err) {
      alert("Error deleting form: " + err.message);
    }
  }

  /* ------------------------------------------------------------------
     Helper: open guest info page
     Include BOTH entry & gid params for backward compatibility.
     Store key in localStorage for fallback.
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
    deleteGuestFormEntry
  };
})();
</script>