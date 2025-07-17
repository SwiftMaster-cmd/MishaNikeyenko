// guestinfo.js  -- dashboard inline Guest Info cards grouped by status, with filters
(() => {
  const ROLES = { ME: "me", LEAD: "lead", DM: "dm", ADMIN: "admin" };

  /* ------------------------------------------------------------------
   * Config: path to full step workflow page
   * ------------------------------------------------------------------ */
  const GUESTINFO_PAGE = window.GUESTINFO_PAGE || "../employee/guestinfo.html";

  /* ------------------------------------------------------------------
   * UI state (persist on window so survives re-renders)
   * ------------------------------------------------------------------ */
  if (typeof window._guestinfo_filterMode === "undefined") window._guestinfo_filterMode = "week"; // 'week' | 'all'
  if (typeof window._guestinfo_showProposals === "undefined") window._guestinfo_showProposals = false;
  if (typeof window._guestinfo_soldOnly === "undefined") window._guestinfo_soldOnly = false;

  /* ------------------------------------------------------------------
   * Role helpers
   * ------------------------------------------------------------------ */
  const isAdmin = r => r === ROLES.ADMIN;
  const isDM    = r => r === ROLES.DM;
  const isLead  = r => r === ROLES.LEAD;
  const isMe    = r => r === ROLES.ME;

  function canDelete(role) {
    return isAdmin(role) || isDM(role) || isLead(role);
  }
  function canEditEntry(currentRole, entryOwnerUid, currentUid) {
    if (!currentRole) return false;
    if (isAdmin(currentRole) || isDM(currentRole) || isLead(currentRole)) return true;
    return entryOwnerUid === currentUid; // ME own only
  }
  const canMarkSold = canEditEntry; // same logic

  /* ------------------------------------------------------------------
   * Hierarchy helpers (DM visibility)
   * ------------------------------------------------------------------ */
  function getUsersUnderDM(users, dmUid) {
    const leads = Object.entries(users)
      .filter(([, u]) => u.role === ROLES.LEAD && u.assignedDM === dmUid)
      .map(([uid]) => uid);
    const mes = Object.entries(users)
      .filter(([, u]) => u.role === ROLES.ME && leads.includes(u.assignedLead))
      .map(([uid]) => uid);
    return new Set([...leads, ...mes]);
  }

  /* ------------------------------------------------------------------
   * Visibility filter by role
   * ------------------------------------------------------------------ */
  function filterGuestinfo(guestinfo, users, currentUid, currentRole) {
    if (!guestinfo || !users || !currentUid || !currentRole) return {};

    if (isAdmin(currentRole)) return guestinfo;

    if (isDM(currentRole)) {
      const under = getUsersUnderDM(users, currentUid);
      under.add(currentUid);
      return Object.fromEntries(
        Object.entries(guestinfo).filter(([, g]) => under.has(g.userUid))
      );
    }

    if (isLead(currentRole)) {
      const mesUnderLead = Object.entries(users)
        .filter(([, u]) => u.role === ROLES.ME && u.assignedLead === currentUid)
        .map(([uid]) => uid);
      const visible = new Set([...mesUnderLead, currentUid]);
      return Object.fromEntries(
        Object.entries(guestinfo).filter(([, g]) => visible.has(g.userUid))
      );
    }

    // ME: own only
    if (isMe(currentRole)) {
      return Object.fromEntries(
        Object.entries(guestinfo).filter(([, g]) => g.userUid === currentUid)
      );
    }

    return {};
  }

  /* ------------------------------------------------------------------
   * Escape HTML
   * ------------------------------------------------------------------ */
  function esc(str) {
    return (str || "")
      .toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* ------------------------------------------------------------------
   * Date helpers
   * ------------------------------------------------------------------ */
  function nowMs(){ return Date.now(); }
  function msNDaysAgo(n){ return nowMs() - n*24*60*60*1000; } // rolling n days
  function latestActivityTs(g){
    return Math.max(
      g.updatedAt || 0,
      g.submittedAt || 0,
      g.sale?.soldAt || 0,
      g.solution?.completedAt || 0
    );
  }
  function inCurrentWeek(g){
    const ts = latestActivityTs(g);
    return ts >= msNDaysAgo(7); // rolling 7 days labelled "This Week"
  }

  /* ------------------------------------------------------------------
   * Status detection & grouping
   * ------------------------------------------------------------------ */
  function detectStatus(g){
    if (g.status) return g.status.toLowerCase();
    if (g.sale) return "sold";
    if (g.solution) return "proposal";
    if (g.evaluate) return "working";
    return "new";
  }

  function groupByStatus(guestMap){
    const groups = { new:[], working:[], proposal:[], sold:[] };
    for (const [id,g] of Object.entries(guestMap)){
      const st = detectStatus(g);
      if (!groups[st]) groups[st] = [];
      groups[st].push([id,g]);
    }
    for (const k in groups){
      groups[k].sort((a,b)=>(latestActivityTs(b[1]) - latestActivityTs(a[1])));
    }
    return groups;
  }

  /* ------------------------------------------------------------------
   * Status Badge
   * ------------------------------------------------------------------ */
  function statusBadge(status) {
    const s = (status || "new").toLowerCase();
    let cls = "role-badge role-guest", label = "NEW";
    if (s === "working")     { cls = "role-badge role-lead";  label = "WORKING"; }
    else if (s === "proposal"){ cls = "role-badge role-dm";    label = "PROPOSAL"; }
    else if (s === "sold")    { cls = "role-badge role-admin"; label = "SOLD"; }
    return `<span class="${cls}">${label}</span>`;
  }

  /* ------------------------------------------------------------------
   * Controls bar
   *  - Hide All + Sales for ME
   *  - Hide Follow-Ups button if none (unless currently viewing)
   *  - showCreateBtn param to suppress top "+ New Lead" when caught-up
   * ------------------------------------------------------------------ */
  function controlsBarHtml(filterMode, proposalCount, soldCount, showProposals, soldOnly, currentRole, showCreateBtn=true){
    const weekActive = filterMode === "week";
    const weekCls = weekActive ? "btn-primary" : "btn-secondary";

    // All button only if NOT ME
    const allCls  = !weekActive ? "btn-primary" : "btn-secondary";
    const allBtn  = isMe(currentRole) ? "" :
      `<button class="btn ${allCls} btn-sm" style="margin-left:8px;" onclick="window.guestinfo.setFilterMode('all')">All</button>`;

    // Follow-Ups button if proposals exist OR currently viewing
    const showFollowBtn = (proposalCount > 0) || showProposals;
    let proposalBtn = "";
    if (showFollowBtn){
      const proposalBtnCls = showProposals ? "btn-secondary" : (proposalCount ? "btn-warning" : "btn-secondary");
      const proposalBtnLabel = showProposals ? "Back to Leads" : `⚠ Follow-Ups (${proposalCount})`;
      proposalBtn = `<button class="btn ${proposalBtnCls} btn-sm" style="margin-left:8px;" onclick="window.guestinfo.toggleShowProposals()">${proposalBtnLabel}</button>`;
    }

    // Sales button only if NOT ME
    let soldBtn = "";
    if (!isMe(currentRole)){
      const soldBtnLabel = soldOnly ? "Back to Leads" : `Sales (${soldCount})`;
      soldBtn = `<button class="btn btn-secondary btn-sm" style="margin-left:8px;" onclick="window.guestinfo.toggleSoldOnly()">${soldBtnLabel}</button>`;
    }

    const createBtn = showCreateBtn
      ? `<button class="btn btn-success btn-sm" style="margin-left:auto;" onclick="window.guestinfo.createNewLead()">+ New Lead</button>`
      : "";

    return `
      <div class="guestinfo-controls review-controls" style="justify-content:flex-start;flex-wrap:wrap;">
        <button class="btn ${weekCls} btn-sm" onclick="window.guestinfo.setFilterMode('week')">This Week</button>
        ${allBtn}
        ${proposalBtn}
        ${soldBtn}
        ${createBtn}
      </div>`;
  }

  /* ------------------------------------------------------------------
   * Motivational empty-state (centered)
   * ------------------------------------------------------------------ */
  function emptyMotivationHtml(msg="No guest leads in this view."){
    return `
      <div class="guestinfo-empty-all text-center" style="margin-top:16px;">
        <p><b>${esc(msg)}</b></p>
        <p style="opacity:.8;">Let's start a conversation and create a new lead.</p>
        <button class="btn btn-success btn-sm" onclick="window.guestinfo.createNewLead()">+ New Lead</button>
      </div>`;
  }

  /* ------------------------------------------------------------------
   * Main renderer
   * ------------------------------------------------------------------ */
  function renderGuestinfoSection(guestinfo, users, currentUid, currentRole) {
    /* Force ME to week-only */
    if (isMe(currentRole)) window._guestinfo_filterMode = "week";

    const vis = filterGuestinfo(guestinfo, users, currentUid, currentRole);

    // apply filter mode (week vs all) -- ME always week
    const filterWeek = isMe(currentRole) ? true : (window._guestinfo_filterMode === "week");
    const visFiltered = filterWeek
      ? Object.fromEntries(Object.entries(vis).filter(([,g]) => inCurrentWeek(g)))
      : vis;

    // group by status
    const groups = groupByStatus(visFiltered);

    const proposalCount = groups.proposal.length;
    const soldCount     = groups.sold.length;

    const showProposals = window._guestinfo_showProposals;
    const soldOnly      = window._guestinfo_soldOnly;

    /* ----- Sales Only view ----- */
    if (soldOnly && !isMe(currentRole)){
      const controlsHtml = controlsBarHtml(window._guestinfo_filterMode, proposalCount, soldCount, showProposals, soldOnly, currentRole, true);
      const soldHtml = statusSectionHtml("Sales", groups.sold, currentUid, currentRole, "sold");
      const none = !groups.sold.length ? emptyMotivationHtml("No sales in this view.") : "";
      return `
        <section class="admin-section guestinfo-section" id="guestinfo-section">
          <h2>Guest Info</h2>
          ${controlsHtml}
          ${soldHtml}
          ${none}
        </section>`;
    }

    /* ----- Follow-Ups (Proposals) only ----- */
    if (showProposals){
      const controlsHtml = controlsBarHtml(window._guestinfo_filterMode, proposalCount, soldCount, showProposals, soldOnly, currentRole, true);
      const proposalHtml = statusSectionHtml("Follow-Ups (Proposals)", groups.proposal, currentUid, currentRole, "proposal", true);
      const none = !groups.proposal.length ? emptyMotivationHtml("No follow-ups in this view.") : "";
      return `
        <section class="admin-section guestinfo-section" id="guestinfo-section">
          <h2>Guest Info</h2>
          ${controlsHtml}
          ${proposalHtml}
          ${none}
        </section>`;
    }

    /* ----- Default view: New + Working (proposal collapsed alert if any) ----- */
    const showEmpty = !groups.new.length && !groups.working.length && !groups.proposal.length;
    const controlsHtml = controlsBarHtml(window._guestinfo_filterMode, proposalCount, soldCount, showProposals, soldOnly, currentRole, !showEmpty);

    // Only include subsections if NOT caught up
    const newHtml     = showEmpty ? "" : statusSectionHtml("New",      groups.new,      currentUid, currentRole, "new");
    const workingHtml = showEmpty ? "" : statusSectionHtml("Working",  groups.working,  currentUid, currentRole, "working");

    // collapsed alert placeholder if proposals exist and we're not empty-caught-up
    const proposalHtml = (!showEmpty && groups.proposal.length)
      ? `
        <div class="guestinfo-proposal-alert">
          <span>⚠ ${groups.proposal.length} follow-up lead${groups.proposal.length===1?"":"s"} awaiting action.</span>
          <span style="opacity:.7;font-size:.85em;margin-left:8px;">Tap "Follow-Ups" above to view.</span>
        </div>`
      : "";

    const emptyHtml = showEmpty ? emptyMotivationHtml("You're all caught up!") : "";

    return `
      <section class="admin-section guestinfo-section" id="guestinfo-section">
        <h2>Guest Info</h2>
        ${controlsHtml}
        ${newHtml}
        ${workingHtml}
        ${proposalHtml}
        ${emptyHtml}
      </section>
    `;
  }

  /* ------------------------------------------------------------------
   * Build a status subsection
   * ------------------------------------------------------------------ */
  function statusSectionHtml(title, rows, currentUid, currentRole, statusKey, highlight=false){
    const hasRows = rows && rows.length;
    if (!hasRows){
      return `
        <div class="guestinfo-subsection guestinfo-subsection-empty status-${statusKey}">
          <h3>${esc(title)}</h3>
          <div class="guestinfo-empty-msg"><i>None.</i></div>
        </div>`;
    }

    const cardsHtml = rows.map(([id,g]) => guestCardHtml(id, g, window._users || {}, currentUid, currentRole)).join("");

    return `
      <div class="guestinfo-subsection status-${statusKey} ${highlight?"guestinfo-subsection-highlight":""}">
        <h3>${esc(title)}</h3>
        <div class="guestinfo-container">${cardsHtml}</div>
      </div>`;
  }

  /* ------------------------------------------------------------------
   * Build guest card (inline preview + quick edit)
   * ------------------------------------------------------------------ */
  function guestCardHtml(id, g, users, currentUid, currentRole) {
    const submitter = users[g.userUid];
    const allowDelete = canDelete(currentRole);
    const allowEdit   = canEditEntry(currentRole, g.userUid, currentUid);
    const allowSold   = canMarkSold(currentRole, g.userUid, currentUid);

    const serviceType = g.serviceType ?? g.evaluate?.serviceType ?? "";
    const situation   = g.situation   ?? g.evaluate?.situation   ?? "";
    const sitPreview  = situation && situation.length > 140
      ? situation.slice(0,137) + "…"
      : situation;

    const status      = detectStatus(g);
    const statBadge   = statusBadge(status);

    const isSold = status === "sold";
    const units  = isSold ? (g.sale?.units ?? "") : "";
    const soldAt = isSold && g.sale?.soldAt ? new Date(g.sale.soldAt).toLocaleString() : "";

    const saleSummary = isSold
      ? `<div class="guest-sale-summary"><b>Sold:</b> ${soldAt || ""} &bull; Units: ${units}</div>`
      : "";

    const actions = [];
    actions.push(
      `<button class="btn btn-secondary btn-sm" onclick="window.guestinfo.openGuestInfoPage('${id}')">
         ${g.evaluate || g.solution || g.sale ? "Open" : "Continue"}
       </button>`
    );
    if (allowEdit) {
      actions.push(
        `<button class="btn btn-primary btn-sm" style="margin-left:8px;" onclick="window.guestinfo.toggleEdit('${id}')">Quick Edit</button>`
      );
    }
    if (!isSold && allowSold) {
      actions.push(
        `<button class="btn btn-success btn-sm" style="margin-left:8px;" onclick="window.guestinfo.markSold('${id}')">Mark Sold</button>`
      );
    }
    if (isSold && allowSold) {
      actions.push(
        `<button class="btn btn-danger btn-sm" style="margin-left:8px;" onclick="window.guestinfo.deleteSale('${id}')">Delete Sale</button>`
      );
    }
    if (allowDelete) {
      actions.push(
        `<button class="btn btn-danger btn-sm" style="margin-left:8px;" onclick="window.guestinfo.deleteGuestInfo('${id}')">Delete Lead</button>`
      );
    }
    const actionRow = actions.join("");

    return `
      <div class="guest-card" id="guest-card-${id}">
        <div class="guest-display">
          <div><b>Status:</b> ${statBadge}</div>
          <div><b>Submitted by:</b> ${esc(submitter?.name || submitter?.email || g.userUid)}</div>
          <div><b>Customer:</b> ${esc(g.custName) || "-"} &nbsp; | &nbsp; <b>Phone:</b> ${esc(g.custPhone) || "-"}</div>
          <div><b>Type:</b> ${esc(serviceType) || "-"}</div>
          <div><b>Situation:</b> ${esc(sitPreview) || "-"}</div>
          <div><b>When:</b> ${g.submittedAt ? new Date(g.submittedAt).toLocaleString() : "-"}</div>
          ${saleSummary}
          <div class="guest-card-actions" style="margin-top:8px;">${actionRow}</div>
        </div>

        <form class="guest-edit-form" id="guest-edit-form-${id}" style="display:none;margin-top:8px;">
          <label>Customer Name
            <input type="text" name="custName" value="${esc(g.custName)}" />
          </label>
          <label>Customer Phone
            <input type="text" name="custPhone" value="${esc(g.custPhone)}" />
          </label>
          <label>Service Type
            <input type="text" name="serviceType" value="${esc(serviceType)}" />
          </label>
          <label>Situation
            <textarea name="situation">${esc(situation)}</textarea>
          </label>
          <div style="margin-top:8px;">
            <button type="button" class="btn btn-primary btn-sm" onclick="window.guestinfo.saveEdit('${id}')">Save</button>
            <button type="button" class="btn btn-secondary btn-sm" onclick="window.guestinfo.cancelEdit('${id}')">Cancel</button>
          </div>
        </form>
      </div>
    `;
  }

  /* ------------------------------------------------------------------
   * Toggle Quick Edit
   * ------------------------------------------------------------------ */
  function toggleEdit(id) {
    const card      = document.getElementById(`guest-card-${id}`);
    if (!card) return;
    const display   = card.querySelector(".guest-display");
    const form      = card.querySelector(".guest-edit-form");
    if (!display || !form) return;
    const showForm = form.style.display === "none";
    form.style.display    = showForm ? "block" : "none";
    display.style.display = showForm ? "none"  : "block";
  }
  function cancelEdit(id) {
    const card    = document.getElementById(`guest-card-${id}`);
    if (!card) return;
    const display = card.querySelector(".guest-display");
    const form    = card.querySelector(".guest-edit-form");
    if (!display || !form) return;
    form.style.display    = "none";
    display.style.display = "block";
  }

  /* ------------------------------------------------------------------
   * Save Quick Edit (top-level fields only)
   * ------------------------------------------------------------------ */
  async function saveEdit(id) {
    const card = document.getElementById(`guest-card-${id}`);
    const form = card?.querySelector(".guest-edit-form");
    if (!form) return alert("Edit form not found.");

    const data = {
      custName:    form.custName.value.trim(),
      custPhone:   form.custPhone.value.trim(),
      serviceType: form.serviceType.value.trim(),
      situation:   form.situation.value.trim(),
      updatedAt:   Date.now()
    };

    try {
      await window.db.ref(`guestinfo/${id}`).update(data);
      cancelEdit(id);
      await window.renderAdminApp(); // full refresh
    } catch (e) {
      alert("Error saving changes: " + e.message);
    }
  }

  /* ------------------------------------------------------------------
   * Delete Lead
   * ------------------------------------------------------------------ */
  async function deleteGuestInfo(id) {
    if (!canDelete(window.currentRole)) {
      alert("You don't have permission to delete.");
      return;
    }
    if (!confirm("Delete this guest lead? This cannot be undone.")) return;
    try {
      await window.db.ref(`guestinfo/${id}`).remove();
      await window.renderAdminApp();
    } catch (e) {
      alert("Error deleting: " + e.message);
    }
  }

  /* ------------------------------------------------------------------
   * Mark Sold (units only)
   * ------------------------------------------------------------------ */
  async function markSold(id) {
    try {
      const snap = await window.db.ref(`guestinfo/${id}`).get();
      const g = snap.val();
      if (!g) {
        alert("Guest record not found.");
        return;
      }
      if (!canMarkSold(window.currentRole, g.userUid, window.currentUid)) {
        alert("You don't have permission to mark this sold.");
        return;
      }

      let unitsStr = prompt("How many units were sold?", "1");
      if (unitsStr === null) return; // cancel
      let units = parseInt(unitsStr, 10);
      if (isNaN(units) || units < 0) units = 0;

      const users = window._users || {};
      const submitter = users[g.userUid] || {};
      let storeNumber = submitter.store;
      if (!storeNumber) {
        storeNumber = prompt("Enter store number for credit:", "") || "";
      }
      storeNumber = storeNumber.toString().trim();

      const now = Date.now();

      const salePayload = {
        guestinfoKey: id,
        storeNumber,
        repUid: window.currentUid || null,
        units,
        createdAt: now
      };
      const saleRef = await window.db.ref("sales").push(salePayload);
      const saleId  = saleRef.key;

      await window.db.ref(`guestinfo/${id}/sale`).set({
        saleId,
        soldAt: now,
        storeNumber,
        units
      });
      await window.db.ref(`guestinfo/${id}/status`).set("sold");

      if (storeNumber) {
        try {
          await window.db.ref(`storeCredits/${storeNumber}`).push({
            saleId,
            guestinfoKey: id,
            creditedAt: now,
            units
          });
        } catch (ledgerErr) {
          console.warn("storeCredits push failed:", ledgerErr);
        }
      }

      await window.renderAdminApp();
    } catch (err) {
      alert("Error marking sold: " + err.message);
    }
  }

  /* ------------------------------------------------------------------
   * Delete Sale (undo)
   * ------------------------------------------------------------------ */
  async function deleteSale(id) {
    try {
      const snap = await window.db.ref(`guestinfo/${id}`).get();
      const g = snap.val();
      if (!g) {
        alert("Guest record not found.");
        return;
      }
      if (!canMarkSold(window.currentRole, g.userUid, window.currentUid)) {
        alert("You don't have permission to modify this sale.");
        return;
      }
      if (!g.sale || !g.sale.saleId) {
        alert("No sale recorded.");
        return;
      }
      if (!confirm("Delete this sale? This will remove store credit.")) return;

      const saleId      = g.sale.saleId;
      const storeNumber = g.sale.storeNumber;
      const hasEval     = !!g.evaluate;

      await window.db.ref(`sales/${saleId}`).remove();
      await window.db.ref(`guestinfo/${id}/sale`).remove();
      await window.db.ref(`guestinfo/${id}/status`).set(hasEval ? "working" : "new");

      if (storeNumber) {
        try {
          const creditsSnap = await window.db.ref(`storeCredits/${storeNumber}`).get();
          const creditsObj = creditsSnap.val() || {};
          const ops = [];
          for (const [cid, c] of Object.entries(creditsObj)) {
            if (c.saleId === saleId) {
              ops.push(window.db.ref(`storeCredits/${storeNumber}/${cid}`).remove());
            }
          }
          await Promise.all(ops);
        } catch (ledgerErr) {
          console.warn("storeCredits cleanup failed:", ledgerErr);
        }
      }

      await window.renderAdminApp();
    } catch (err) {
      alert("Error deleting sale: " + err.message);
    }
  }

  /* ------------------------------------------------------------------
   * Filter setters / toggles
   * ------------------------------------------------------------------ */
  function setFilterMode(mode){
    if (isMe(window.currentRole)) {
      window._guestinfo_filterMode = "week";   // ME locked
    } else {
      window._guestinfo_filterMode = (mode === "all" ? "all" : "week");
    }
    window.renderAdminApp();
  }
  function toggleShowProposals(){
    if (!window._guestinfo_showProposals){
      window._guestinfo_soldOnly = false;
    }
    window._guestinfo_showProposals = !window._guestinfo_showProposals;
    window.renderAdminApp();
  }
  function toggleSoldOnly(){
    if (!window._guestinfo_soldOnly){
      window._guestinfo_showProposals = false;
    }
    window._guestinfo_soldOnly = !window._guestinfo_soldOnly;
    window.renderAdminApp();
  }

  /* ------------------------------------------------------------------
   * Create New Lead (launch step workflow w/out gid param)
   * ------------------------------------------------------------------ */
  function createNewLead(){
    const base = GUESTINFO_PAGE;
    const url = base.split("?")[0]; // strip existing query if any
    try { localStorage.removeItem("last_guestinfo_key"); } catch(_) {}
    window.location.href = url;
  }

  /* ------------------------------------------------------------------
   * Open full workflow page (Step UI) for existing record
   * ------------------------------------------------------------------ */
  function openGuestInfoPage(guestKey) {
    const base = GUESTINFO_PAGE;
    const sep  = base.includes("?") ? "&" : "?";
    const url  = `${base}${sep}gid=${encodeURIComponent(guestKey)}`;
    try { localStorage.setItem("last_guestinfo_key", guestKey); } catch(_) {}
    window.location.href = url;
  }

  /* ------------------------------------------------------------------
   * Expose public API
   * ------------------------------------------------------------------ */
  window.guestinfo = {
    renderGuestinfoSection,
    toggleEdit,
    cancelEdit,
    saveEdit,
    deleteGuestInfo,
    markSold,
    deleteSale,
    openGuestInfoPage,
    // filters
    setFilterMode,
    toggleShowProposals,
    toggleSoldOnly,
    // new lead
    createNewLead
  };
})();