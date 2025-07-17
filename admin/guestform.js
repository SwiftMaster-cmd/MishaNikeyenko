/* guestform.js  -------------------------------------------------------------
 * Dashboard "Guest Form Submissions" module
 * - Splits into Unclaimed / Claimed
 * - Shows status + who claimed
 * - Today / All toggle
 * - Claim creates guestinfo, flags consumedBy/consumedRole
 * ------------------------------------------------------------------------ */
(() => {
  const ROLES = { ME:"me", LEAD:"lead", DM:"dm", ADMIN:"admin" };

  /* -------------------------------------------------------------------- *
   * Path to full guest-info workflow page (employee area)
   * -------------------------------------------------------------------- */
  const GUESTINFO_PAGE = window.GUESTINFO_PAGE || "../employee/guestinfo.html";

  /* -------------------------------------------------------------------- *
   * Role helpers
   * -------------------------------------------------------------------- */
  const isAdmin = r => r === ROLES.ADMIN;
  const isDM    = r => r === ROLES.DM;
  const isLead  = r => r === ROLES.LEAD;
  const isMe    = r => r === ROLES.ME;

  /* who can delete an intake form? */
  function canDeleteForm(role){
    return isAdmin(role) || isDM(role) || isLead(role);
  }

  /* -------------------------------------------------------------------- *
   * Date helpers (browser-local "today")
   * -------------------------------------------------------------------- */
  function startOfTodayMs(){ const d=new Date(); d.setHours(0,0,0,0);   return d.getTime(); }
  function endOfTodayMs(){   const d=new Date(); d.setHours(23,59,59,999); return d.getTime(); }

  /* -------------------------------------------------------------------- *
   * DUP helper (match phone in guestinfo)
   * -------------------------------------------------------------------- */
  const phoneDigits = str => (str||"").replace(/\D+/g,"");
  function findGuestinfoByPhone(guestinfoObj, phone){
    const pd = phoneDigits(phone);
    if (!pd) return null;
    for (const [gid,g] of Object.entries(guestinfoObj||{})){
      if (phoneDigits(g.custPhone) === pd) return {gid,g};
    }
    return null;
  }

  /* -------------------------------------------------------------------- *
   * Escape HTML
   * -------------------------------------------------------------------- */
  function esc(str){
    return (str ?? "")
      .toString()
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;")
      .replace(/'/g,"&#39;");
  }

  /* -------------------------------------------------------------------- *
   * Status badge (tiny)
   * -------------------------------------------------------------------- */
  function statusBadge(status){
    const s = (status||"new").toLowerCase();
    let cls = "role-badge role-guest", label = "NEW";
    if (s === "working")  { cls="role-badge role-lead";  label="WORK"; }
    else if (s === "proposal"){ cls="role-badge role-dm"; label="PROP"; }
    else if (s === "sold")    { cls="role-badge role-admin"; label="SOLD"; }
    return `<span class="${cls}">${label}</span>`;
  }

  /* -------------------------------------------------------------------- *
   * Determine status for a guestEntry row
   * - If linked (guestinfoKey) → read guestinfoObj[gKey].status || fallback
   * - Else NEW
   * -------------------------------------------------------------------- */
  function entryStatus(entry, guestinfoObj){
    if (entry.guestinfoKey && guestinfoObj[entry.guestinfoKey]){
      const g = guestinfoObj[entry.guestinfoKey];
      if (g.status) return g.status;
      if (g.sale) return "sold";
      if (g.evaluate) return "working";
      return "new";
    }
    return "new";
  }

  /* -------------------------------------------------------------------- *
   * Which forms does this role see?
   * - Admin/DM: all
   * - Lead/ME: unclaimed + claimedBy self
   * -------------------------------------------------------------------- */
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

  /* -------------------------------------------------------------------- *
   * Render main section
   * -------------------------------------------------------------------- */
  function renderGuestFormsSection(guestForms, currentRole, currentUid){
    currentUid  = currentUid  || window.currentUid;
    currentRole = currentRole || window.currentRole;

    const fullFormsObj = guestForms || {};
    const visFormsObj  = visibleGuestForms(fullFormsObj, currentRole, currentUid);
    const guestinfoObj = window._guestinfo || {};
    const usersObj     = window._users    || {};

    const idsAll = Object.keys(visFormsObj);
    if (!idsAll.length){
      return `
        <section class="admin-section guest-forms-section">
          <h2>Guest Form Submissions</h2>
          <p class="text-center">No guest form submissions.</p>
        </section>`;
    }

    // sort newest first across visible
    idsAll.sort((a,b)=>(visFormsObj[b].timestamp||0)-(visFormsObj[a].timestamp||0));

    // init global toggle default (Admin & DM default show-all; others show today)
    if (typeof window._guestforms_showAll === "undefined"){
      window._guestforms_showAll = (isAdmin(currentRole) || isDM(currentRole));
    }

    const startToday = startOfTodayMs();
    const endToday   = endOfTodayMs();

    // Filter timeframe
    const idsTime = window._guestforms_showAll
      ? idsAll
      : idsAll.filter(id=>{
          const ts = visFormsObj[id].timestamp || 0;
          return ts >= startToday && ts <= endToday;
        });

    // separate unclaimed & claimed
    const unclaimedIds = [];
    const claimedIds   = [];
    for (const id of idsTime){
      const f = visFormsObj[id];
      const claimedBy = f.consumedBy || f.claimedBy;
      if (claimedBy) claimedIds.push(id); else unclaimedIds.push(id);
    }

    // detect if there are older items (to show toggle)
    const anyOlder = idsAll.some(id=>{
      const ts = visFormsObj[id].timestamp || 0;
      return ts < startToday || ts > endToday;
    });

    /* ---- Build tables -------------------------------------------------- */
    const unclaimedTable = buildTableHtml({
      ids: unclaimedIds,
      forms: visFormsObj,
      guestinfoObj,
      usersObj,
      currentRole,
      type: "unclaimed"
    });

    const claimedTable = buildTableHtml({
      ids: claimedIds,
      forms: visFormsObj,
      guestinfoObj,
      usersObj,
      currentRole,
      type: "claimed"
    });

    const toggleBtn = anyOlder
      ? `<button class="btn btn-secondary btn-sm" onclick="window.guestforms.toggleShowAll()">
           ${window._guestforms_showAll ? "Show Today" : "Show All"}
         </button>`
      : "";

    return `
      <section class="admin-section guest-forms-section">
        <h2>Guest Form Submissions</h2>
        <div class="review-controls" style="justify-content:flex-end;">${toggleBtn}</div>

        <div class="guestforms-subsection">
          <h3 class="guestforms-subheading">Unclaimed</h3>
          ${unclaimedTable}
        </div>

        <div class="guestforms-subsection" style="margin-top:1.5rem;">
          <h3 class="guestforms-subheading">Claimed</h3>
          ${claimedTable}
        </div>
      </section>
    `;
  }

  /* -------------------------------------------------------------------- *
   * Build one table (unclaimed or claimed)
   * -------------------------------------------------------------------- */
  function buildTableHtml({ids, forms, guestinfoObj, usersObj, currentRole, type}){
    if (!ids.length){
      return `<div class="guest-forms-table-wrap"><table class="store-table guest-forms-table"><tbody><tr><td colspan="5" class="text-center"><i>No ${type} forms.</i></td></tr></tbody></table></div>`;
    }

    const rows = ids.map(id=>{
      const f = forms[id];
      const ts = f.timestamp ? new Date(f.timestamp).toLocaleString() : "-";
      const name = esc(f.guestName || "-");
      const phone = esc(f.guestPhone || "-");
      const status = entryStatus(f, guestinfoObj);       // string
      const statBadge = statusBadge(status);

      // Claimer info
      let claimCell = "--";
      const claimedBy = f.consumedBy || f.claimedBy;
      if (claimedBy){
        const u = usersObj[claimedBy];
        const role = u?.role || f.consumedRole || "";
        let badgeCls = "role-badge role-guest";
        if (role === ROLES.ADMIN) badgeCls="role-badge role-admin";
        else if (role === ROLES.DM) badgeCls="role-badge role-dm";
        else if (role === ROLES.LEAD) badgeCls="role-badge role-lead";
        else if (role === ROLES.ME) badgeCls="role-badge role-me";
        claimCell = `${esc(u?.name || u?.email || claimedBy)} <span class="${badgeCls}">${(role||"").toUpperCase()}</span>`;
      }

      // DUP?
      const dup = findGuestinfoByPhone(guestinfoObj, f.guestPhone);
      const dupBadge = dup ? `<span class="role-badge role-guest" title="Existing lead">DUP</span>` : "";

      // Delete button
      const deleteBtn = canDeleteForm(currentRole)
        ? `<button class="btn btn-danger btn-sm" onclick="window.guestforms.deleteGuestFormEntry('${id}')">Delete</button>`
        : "";

      // Action: Continue vs Open
      const consumed = !!claimedBy;
      const actionLabel = consumed ? "Open" : "Continue";
      const actionBtn = `<button class="btn btn-primary btn-sm" onclick="window.guestforms.continueToGuestInfo('${id}')">${actionLabel}</button>`;

      return `
        <tr class="${consumed ? 'consumed' : ''} status-${status}">
          <td data-label="Name">${name} ${dupBadge}</td>
          <td data-label="Phone">${phone}</td>
          <td data-label="Status">${statBadge}</td>
          <td data-label="Claimed By">${claimCell}</td>
          <td data-label="Submitted">${ts}</td>
          <td data-label="Action" class="nowrap">
            ${actionBtn}
            ${deleteBtn}
          </td>
        </tr>`;
    }).join("");

    return `
      <div class="guest-forms-table-wrap">
        <table class="store-table guest-forms-table table-stackable">
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Status</th>
              <th>Claimed By</th>
              <th>Submitted</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  /* -------------------------------------------------------------------- *
   * Toggle Today/All & re-render
   * -------------------------------------------------------------------- */
  function toggleShowAll(){
    window._guestforms_showAll = !window._guestforms_showAll;
    window.renderAdminApp();
  }

  /* -------------------------------------------------------------------- *
   * Continue / Open flow
   *  - If already linked → open
   *  - Else create guestinfo record, mark consumedBy + consumedRole
   * -------------------------------------------------------------------- */
  async function continueToGuestInfo(entryId){
    const currentUid  = window.currentUid;
    const currentRole = window.currentRole;
    const db = window.db;
    if (!db){
      alert("Database not ready.");
      return;
    }

    const entrySnap = await db.ref(`guestEntries/${entryId}`).get();
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

    // Create guestinfo
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
    const gRef = await db.ref("guestinfo").push(payload);
    const guestKey = gRef.key;

    // Mark consumed
    await db.ref(`guestEntries/${entryId}`).update({
      guestinfoKey: guestKey,
      consumedBy: currentUid || null,
      consumedRole: currentRole || null,
      consumedAt: Date.now()
    });

    // Re-render
    await window.renderAdminApp();

    // Redirect into workflow
    openGuestInfoPage(guestKey);
  }

  /* -------------------------------------------------------------------- *
   * Delete intake form
   *  - Does NOT delete linked guestinfo record
   * -------------------------------------------------------------------- */
  async function deleteGuestFormEntry(entryId){
    const db = window.db;
    if (!db){
      alert("Database not ready.");
      return;
    }
    if (!canDeleteForm(window.currentRole)){
      alert("You don't have permission to delete this submission.");
      return;
    }

    const entrySnap = await db.ref(`guestEntries/${entryId}`).get();
    const entry = entrySnap.val();
    if (!entry) return;

    const linked = !!entry.guestinfoKey;
    const msg = linked
      ? "Delete this guest form submission? (The full guest info record will NOT be deleted.)"
      : "Delete this guest form submission?";
    if (!confirm(msg)) return;

    try {
      await db.ref(`guestEntries/${entryId}`).remove();
      await window.renderAdminApp();
    } catch (err) {
      alert("Error deleting form: " + err.message);
    }
  }

  /* -------------------------------------------------------------------- *
   * Open full guest-info workflow page
   * -------------------------------------------------------------------- */
  function openGuestInfoPage(guestKey){
    const base = GUESTINFO_PAGE || "guest-info.html";
    const sep  = base.includes("?") ? "&" : "?";
    const url  = `${base}${sep}gid=${encodeURIComponent(guestKey)}`;
    try { localStorage.setItem("last_guestinfo_key", guestKey); } catch(_){}
    window.location.href = url;
  }

  /* -------------------------------------------------------------------- *
   * Expose public API
   * -------------------------------------------------------------------- */
  window.guestforms = {
    renderGuestFormsSection,
    toggleShowAll,
    continueToGuestInfo,
    deleteGuestFormEntry
  };
})();