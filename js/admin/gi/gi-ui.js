(() => {
  const ROLES = window.ROLES || { ME: "me", LEAD: "lead", DM: "dm", ADMIN: "admin" };

  const esc = str => String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  // Controls bar with filters and New Lead button
  function controlsBarHtml(filterMode, proposalCount, soldCount, showProposals, soldOnly, currentRole, showCreateBtn = true) {
    const isMe = role => role === ROLES.ME;
    const weekActive = filterMode === "week";

    const allBtn = isMe(currentRole) ? "" : `<button class="btn ${weekActive ? "btn-secondary" : "btn-primary"} btn-sm" style="margin-left:8px;" onclick="window.guestinfo.setFilterMode('all')">All</button>`;

    const proposalBtn = (proposalCount > 0 || showProposals)
      ? `<button class="btn ${showProposals ? "btn-secondary" : (proposalCount ? "btn-warning" : "btn-secondary")} btn-sm" style="margin-left:8px;" onclick="window.guestinfo.toggleShowProposals()">${showProposals ? "Back to Leads" : `⚠ Follow-Ups (${proposalCount})`}</button>`
      : "";

    const soldBtn = !isMe(currentRole)
      ? `<button class="btn btn-secondary btn-sm" style="margin-left:8px;" onclick="window.guestinfo.toggleSoldOnly()">${soldOnly ? "Back to Leads" : `Sales (${soldCount})`}</button>`
      : "";

    const createBtn = showCreateBtn ? `<button class="btn btn-success btn-sm" style="margin-left:auto;" onclick="window.guestinfo.createNewLead()">+ New Lead</button>` : "";

    return `
      <div class="guestinfo-controls review-controls" style="justify-content:flex-start;flex-wrap:wrap;">
        <button class="btn ${weekActive ? "btn-primary" : "btn-secondary"} btn-sm" onclick="window.guestinfo.setFilterMode('week')">This Week</button>
        ${allBtn}
        ${proposalBtn}
        ${soldBtn}
        ${createBtn}
      </div>`;
  }

  // Empty state message
  function emptyMotivationHtml(msg = "No guest leads in this view.") {
    return `
      <div class="guestinfo-empty-all text-center" style="margin-top:16px;">
        <p><b>${esc(msg)}</b></p>
        <p style="opacity:.8;">Let's start a conversation and create a new lead.</p>
        <button class="btn btn-success btn-sm" onclick="window.guestinfo.createNewLead()">+ New Lead</button>
      </div>`;
  }

  // Set filter mode (week/all)
  function setFilterMode(mode) {
    const isMe = (role) => role === ROLES.ME;
    window._guestinfo_filterMode = isMe(window.currentRole) ? "week" : (mode === "all" ? "all" : "week");
    window.renderAdminApp();
  }

  // Toggle show proposals filter
  function toggleShowProposals() {
    if (!window._guestinfo_showProposals) window._guestinfo_soldOnly = false;
    window._guestinfo_showProposals = !window._guestinfo_showProposals;
    window.renderAdminApp();
  }

  // Toggle sold only filter
  function toggleSoldOnly() {
    if (!window._guestinfo_soldOnly) window._guestinfo_showProposals = false;
    window._guestinfo_soldOnly = !window._guestinfo_soldOnly;
    window.renderAdminApp();
  }

  // Create a new lead, clearing last key and redirecting
  function createNewLead() {
    try { localStorage.removeItem("last_guestinfo_key"); } catch {}
    const GUESTINFO_PAGE = window.GUESTINFO_PAGE || "../html/guestinfo.html";
    window.location.href = GUESTINFO_PAGE.split("?")[0];
  }

  // Main render entry for guestinfo section
  function renderGuestinfoSection(guestinfo, users, currentUid, currentRole) {
    if (window.ROLES && currentRole === ROLES.ME) window._guestinfo_filterMode = "week";

    // Filter logic delegated to guestinfo-status.js
    const visible = window.guestinfo.filterGuestinfo
      ? window.guestinfo.filterGuestinfo(guestinfo, users, currentUid, currentRole)
      : guestinfo || {};

    const filterWeek = (currentRole === ROLES.ME) || window._guestinfo_filterMode === "week";

    const filtered = filterWeek && window.guestinfo.inCurrentWeek
      ? Object.fromEntries(Object.entries(visible).filter(([, g]) => window.guestinfo.inCurrentWeek(g)))
      : visible;

    const groups = window.guestinfo.groupByStatus
      ? window.guestinfo.groupByStatus(filtered)
      : { new: [], working: [], proposal: [], sold: [] };

    const proposalCount = groups.proposal.length;
    const soldCount = groups.sold.length;

    const showProposals = window._guestinfo_showProposals;
    const soldOnly = window._guestinfo_soldOnly;

    // Delegate status section rendering to guestinfo-status.js
    if (soldOnly && currentRole !== ROLES.ME) {
      return `
      <section class="admin-section guestinfo-section" id="guestinfo-section">
        <h2>Guest Info</h2>
        ${controlsBarHtml(window._guestinfo_filterMode, proposalCount, soldCount, showProposals, soldOnly, currentRole)}
        ${window.guestinfo.statusSectionHtml ? window.guestinfo.statusSectionHtml("Sales", groups.sold, currentUid, currentRole, "sold") : ""}
        ${groups.sold.length ? "" : emptyMotivationHtml("No sales in this view.")}
      </section>`;
    }

    if (showProposals) {
      return `
      <section class="admin-section guestinfo-section" id="guestinfo-section">
        <h2>Guest Info</h2>
        ${controlsBarHtml(window._guestinfo_filterMode, proposalCount, soldCount, showProposals, soldOnly, currentRole)}
        ${window.guestinfo.statusSectionHtml ? window.guestinfo.statusSectionHtml("Follow-Ups (Proposals)", groups.proposal, currentUid, currentRole, "proposal", true) : ""}
        ${groups.proposal.length ? "" : emptyMotivationHtml("No follow-ups in this view.")}
      </section>`;
    }

    const showEmpty = !groups.new.length && !groups.working.length && !groups.proposal.length;

    return `
      <section class="admin-section guestinfo-section" id="guestinfo-section">
        <h2>Guest Info</h2>
        ${controlsBarHtml(window._guestinfo_filterMode, proposalCount, soldCount, showProposals, soldOnly, currentRole, !showEmpty)}
        ${showEmpty ? emptyMotivationHtml("You're all caught up!") : ""}
        ${!showEmpty && window.guestinfo.statusSectionHtml ? window.guestinfo.statusSectionHtml("New", groups.new, currentUid, currentRole, "new") : ""}
        ${!showEmpty && window.guestinfo.statusSectionHtml ? window.guestinfo.statusSectionHtml("Working", groups.working, currentUid, currentRole, "working") : ""}
        ${(!showEmpty && groups.proposal.length) ? `<div class="guestinfo-proposal-alert" style="margin-top:8px;">
          <span>⚠ ${groups.proposal.length} follow-up lead${groups.proposal.length === 1 ? "" : "s"} awaiting action.</span>
          <span style="opacity:.7;font-size:.85em;margin-left:8px;">Tap "Follow-Ups" above to view.</span>
        </div>` : ""}
      </section>`;
  }

  // Expose public API
  window.guestinfo = window.guestinfo || {};
  Object.assign(window.guestinfo, {
    controlsBarHtml,
    emptyMotivationHtml,
    setFilterMode,
    toggleShowProposals,
    toggleSoldOnly,
    createNewLead,
    renderGuestinfoSection
  });
})();