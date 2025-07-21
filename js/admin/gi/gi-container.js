// guestinfo-container.js

import {
  groupByStatus,
  statusSectionHtml,
  detectStatus
} from './gi-render.js';

import {
  toggleEdit,
  cancelEdit,
  saveEdit,
  deleteGuestInfo,
  markSold,
  deleteSale,
  openGuestInfoPage,
  recomputePitch,
  toggleActionButtons
} from './gi-action.js';

// ── Time & filter helpers ─────────────────────────────────────────────────
function msNDaysAgo(n) { return Date.now() - n * 864e5; }
function latestActivityTs(g) {
  return Math.max(
    g.updatedAt || 0,
    g.submittedAt || 0,
    g.sale?.soldAt || 0,
    g.solution?.completedAt || 0
  );
}
function inCurrentWeek(g) { return latestActivityTs(g) >= msNDaysAgo(7); }

function getUsersUnderDM(users, dmUid) {
  const leads = Object.entries(users)
    .filter(([,u]) => u.role === "lead" && u.assignedDM === dmUid)
    .map(([uid]) => uid);
  const mes = Object.entries(users)
    .filter(([,u]) => u.role === "me" && leads.includes(u.assignedLead))
    .map(([uid]) => uid);
  return new Set([...leads, ...mes]);
}

function filterGuestinfoByRole(guestinfo, users, uid, role) {
  if (!guestinfo || !users || !uid || !role) return {};
  if (role === "admin") return guestinfo;
  if (role === "dm") {
    const under = getUsersUnderDM(users, uid);
    under.add(uid);
    return Object.fromEntries(
      Object.entries(guestinfo)
        .filter(([,g]) => under.has(g.userUid))
    );
  }
  if (role === "lead") {
    const mes = Object.entries(users)
      .filter(([,u]) => u.role === "me" && u.assignedLead === uid)
      .map(([uid]) => uid);
    const vis = new Set([...mes, uid]);
    return Object.fromEntries(
      Object.entries(guestinfo)
        .filter(([,g]) => vis.has(g.userUid))
    );
  }
  if (role === "me") {
    return Object.fromEntries(
      Object.entries(guestinfo)
        .filter(([,g]) => g.userUid === uid)
    );
  }
  return {};
}

// ── Controls & empty state ─────────────────────────────────────────────────
function controlsBarHtml(filterMode, showProposals, soldOnly, role, showCreate = true) {
  const searchInput = `
    <input type="text"
           placeholder="🔍 Search by name..."
           value="${window._guestinfo_searchText || ''}"
           oninput="window.guestinfo.setSearch(this.value)"
           style="flex:1;min-width:120px;padding:4px 8px;border-radius:4px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.05);color:#fff;" />`;

  const statusOptions = ["all","new","working","proposal","sold"]
    .map(status => {
      const label = status === "all" ? "All Status" : status.charAt(0).toUpperCase() + status.slice(1);
      const sel = window._guestinfo_statusFilter === status ? "selected" : "";
      return `<option value="${status}" ${sel}>${label}</option>`;
    }).join("");
  const statusSelect = `
    <select onchange="window.guestinfo.setStatusFilter(this.value)"
            style="padding:4px 8px;border-radius:4px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.05);color:#fff;">
      ${statusOptions}
    </select>`;

  const toggleLabel = filterMode === "week" ? "Show All" : "This Week";
  const filterBtn = `
    <button class="btn btn-secondary btn-sm"
            onclick="window.guestinfo.toggleFilterMode()">
      ${toggleLabel}
    </button>`;

  const propBtn = showProposals
    ? `<button class="btn btn-secondary btn-sm" onclick="window.guestinfo.toggleShowProposals()">Back to Leads</button>`
    : `<button class="btn btn-warning btn-sm" onclick="window.guestinfo.toggleShowProposals()">⚠ Follow-Ups</button>`;

  const soldBtn = role === "me"
    ? ""
    : (soldOnly
      ? `<button class="btn btn-secondary btn-sm" onclick="window.guestinfo.toggleSoldOnly()">Back to Leads</button>`
      : `<button class="btn btn-secondary btn-sm" onclick="window.guestinfo.toggleSoldOnly()">Sales</button>`);

  const createBtn = showCreate
    ? `<button class="btn btn-success btn-sm" onclick="window.guestinfo.createNewLead()">+ New Lead</button>`
    : "";

  return `
    <div class="guestinfo-controls" style="display:flex;gap:8px;align-items:center;">
      ${searchInput}
      ${statusSelect}
      ${filterBtn}
      ${propBtn}
      ${soldBtn}
      ${createBtn}
    </div>`;
}

function emptyHtml(msg = "No guest leads in this view.") {
  return `
    <div class="guestinfo-empty" style="text-align:center;margin-top:16px;">
      <p><b>${msg}</b></p>
      <button class="btn btn-success btn-sm" onclick="window.guestinfo.createNewLead()">+ New Lead</button>
    </div>`;
}

// ── Main renderer ─────────────────────────────────────────────────────────
export function renderGuestinfoSection(guestinfo, users, uid, role) {
  // ensure filter defaults exist
  window._guestinfo_searchText     ??= "";
  window._guestinfo_statusFilter   ??= "all";
  window._guestinfo_filterMode     ??= "week";
  window._guestinfo_showProposals  ??= false;
  window._guestinfo_soldOnly       ??= false;

  // 1) Role-based visibility
  const byRole = filterGuestinfoByRole(guestinfo, users, uid, role);

  // 2) Search filter
  const searchLower = (window._guestinfo_searchText || "").toLowerCase();
  const bySearch = Object.fromEntries(
    Object.entries(byRole)
      .filter(([,g]) => g.custName?.toLowerCase().includes(searchLower))
  );

  // 3) Status filter
  const statusF = window._guestinfo_statusFilter;
  const byStatus = statusF === "all"
    ? bySearch
    : Object.fromEntries(
        Object.entries(bySearch)
          .filter(([,g]) => detectStatus(g) === statusF)
      );

  // 4) Count full groups (for button labels when needed)
  const fullGroups = groupByStatus(byRole);
  const propCount  = fullGroups.proposal.length;
  const soldCount  = fullGroups.sold.length;

  // 5) Timeframe or proposals/sales view determines final items
  let items;
  if (window._guestinfo_showProposals) {
    items = byStatus;
  } else if (window._guestinfo_soldOnly) {
    items = byStatus;
  } else if (window._guestinfo_filterMode === "week" || role === "me") {
    items = Object.fromEntries(
      Object.entries(byStatus).filter(([,g]) => inCurrentWeek(g))
    );
  } else {
    items = byStatus;
  }

  // 6) Group and render
  const groups    = groupByStatus(items);
  const showProps = window._guestinfo_showProposals;
  const soldOnly  = window._guestinfo_soldOnly;
  const filterMode= window._guestinfo_filterMode;

  let html = "";

  if (soldOnly && role !== "me") {
    html = `
      <section class="guestinfo-section">
        ${controlsBarHtml(filterMode, showProps, soldOnly, role)}
        ${statusSectionHtml("Sales", groups.sold, users, uid, role)}
        ${groups.sold.length ? "" : emptyHtml("No sales in this view.")}
      </section>`;
  }
  else if (showProps) {
    html = `
      <section class="guestinfo-section">
        ${controlsBarHtml(filterMode, showProps, soldOnly, role)}
        ${statusSectionHtml("Follow-Ups", groups.proposal, users, uid, role, true)}
        ${groups.proposal.length ? "" : emptyHtml("No follow-ups in this view.")}
      </section>`;
  }
  else {
    const isEmpty = !groups.new.length && !groups.working.length && !groups.proposal.length;
    html = `
      <section class="guestinfo-section">
        ${controlsBarHtml(filterMode, showProps, soldOnly, role, !isEmpty)}
        ${isEmpty ? emptyHtml("You're all caught up!") : ""}
        ${!isEmpty ? statusSectionHtml("New",     groups.new,     users, uid, role) : ""}
        ${!isEmpty ? statusSectionHtml("Working", groups.working, users, uid, role) : ""}
        ${!isEmpty && groups.proposal.length
           ? statusSectionHtml("Follow-Ups", groups.proposal, users, uid, role, true)
           : ""}
      </section>`;
  }

  return `<div id="guestinfo-container">${html}</div>`;
}

// ── Filter controls & toggles ─────────────────────────────────────────────
export function setSearch(text) {
  window._guestinfo_searchText = text;
  window.renderAdminApp();
}

export function setStatusFilter(status) {
  window._guestinfo_statusFilter = status;
  window._guestinfo_showProposals = false;
  window._guestinfo_soldOnly = false;
  window.renderAdminApp();
}

export function toggleFilterMode() {
  if (window.currentRole === "me") return;
  window._guestinfo_filterMode = window._guestinfo_filterMode === "week" ? "all" : "week";
  window._guestinfo_showProposals = false;
  window._guestinfo_soldOnly = false;
  window.renderAdminApp();
}

export function toggleShowProposals() {
  window._guestinfo_showProposals = !window._guestinfo_showProposals;
  window._guestinfo_soldOnly = false;
  window.renderAdminApp();
}

export function toggleSoldOnly() {
  window._guestinfo_soldOnly = !window._guestinfo_soldOnly;
  window._guestinfo_showProposals = false;
  window.renderAdminApp();
}

export function createNewLead() {
  try { localStorage.removeItem("last_guestinfo_key"); } catch(_) {}
  window.location.href = (window.GUESTINFO_PAGE || "../html/guestinfo.html").split("?")[0];
}

// ── Initialization ───────────────────────────────────────────────────────
export function initGuestinfo() {
  window.guestinfo = {
    renderGuestinfoSection,
    setSearch,
    setStatusFilter,
    toggleFilterMode,
    toggleShowProposals,
    toggleSoldOnly,
    toggleActionButtons,
    toggleEdit,
    cancelEdit,
    saveEdit,
    deleteGuestInfo,
    markSold,
    deleteSale,
    openGuestInfoPage,
    createNewLead,
    recomputePitch
  };
}