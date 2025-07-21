// guestinfo-container.js

import {
  groupByStatus,
  statusSectionHtml
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

function filterGuestinfo(guestinfo, users, uid, role) {
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
function controlsBarHtml(filterMode, proposalCount, soldCount, showProposals, soldOnly, role, showCreate = true) {
  // single-toggle for week/all
  const filterLabel = filterMode === "week" ? "Show All" : "This Week";
  const filterBtn = `<button class="btn btn-secondary btn-sm" onclick="window.guestinfo.toggleFilterMode()">${filterLabel}</button>`;

  const propBtn = (proposalCount > 0 || showProposals)
    ? `<button class="btn ${showProposals ? "btn-secondary" : "btn-warning"} btn-sm" onclick="window.guestinfo.toggleShowProposals()">
         ${showProposals ? "Back to Leads" : `⚠ Follow-Ups (${proposalCount})`}
       </button>`
    : "";

  const soldBtn = role === "me"
    ? ""
    : `<button class="btn btn-secondary btn-sm" onclick="window.guestinfo.toggleSoldOnly()">
         ${soldOnly ? "Back to Leads" : `Sales (${soldCount})`}
       </button>`;

  const createBtn = showCreate
    ? `<button class="btn btn-success btn-sm" onclick="window.guestinfo.createNewLead()">+ New Lead</button>`
    : "";

  return `
    <div class="guestinfo-controls" style="display:flex;gap:8px;align-items:center;">
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
  if (role === "me") window._guestinfo_filterMode = "week";

  // filter by role
  const visible = filterGuestinfo(guestinfo, users, uid, role);

  // count proposals & sales on full set
  const fullGroups = groupByStatus(visible);
  const propCount  = fullGroups.proposal.length;
  const soldCount  = fullGroups.sold.length;

  // choose subset to render
  let items;
  if (window._guestinfo_showProposals) {
    items = visible;
  } else if (window._guestinfo_filterMode === "week" || role === "me") {
    items = Object.fromEntries(
      Object.entries(visible).filter(([,g]) => inCurrentWeek(g))
    );
  } else {
    items = visible;
  }

  const groups    = groupByStatus(items);
  const showProps = window._guestinfo_showProposals;
  const soldOnly  = window._guestinfo_soldOnly;

  // build the inner section HTML
  let sectionHtml = "";

  // sales view
  if (soldOnly && role !== "me") {
    sectionHtml = `
      <section class="guestinfo-section">
        <h2>Guest Info</h2>
        ${controlsBarHtml(window._guestinfo_filterMode, propCount, soldCount, showProps, soldOnly, role)}
        ${statusSectionHtml("Sales", groups.sold, users, uid, role)}
        ${groups.sold.length ? "" : emptyHtml("No sales in this view.")}
      </section>`;
  }
  // proposals view
  else if (showProps) {
    sectionHtml = `
      <section class="guestinfo-section">
        <h2>Guest Info</h2>
        ${controlsBarHtml(window._guestinfo_filterMode, propCount, soldCount, showProps, soldOnly, role)}
        ${statusSectionHtml("Follow-Ups (Proposals)", groups.proposal, users, uid, role, true)}
        ${groups.proposal.length ? "" : emptyHtml("No follow-ups in this view.")}
      </section>`;
  }
  // default view (inline proposals at bottom)
  else {
    const isEmpty = !groups.new.length && !groups.working.length && !groups.proposal.length;
    sectionHtml = `
      <section class="guestinfo-section">
        <h2>Guest Info</h2>
        ${controlsBarHtml(window._guestinfo_filterMode, propCount, soldCount, showProps, soldOnly, role, !isEmpty)}
        ${isEmpty ? emptyHtml("You're all caught up!") : ""}
        ${!isEmpty ? statusSectionHtml("New",     groups.new,     users, uid, role) : ""}
        ${!isEmpty ? statusSectionHtml("Working", groups.working, users, uid, role) : ""}
        ${!isEmpty && groups.proposal.length
           ? statusSectionHtml("Follow-Ups (Proposals)", groups.proposal, users, uid, role, true)
           : ""}
      </section>`;
  }

  // wrap in a container
  return `<div id="guestinfo-container">${sectionHtml}</div>`;
}

// ── Filter controls & toggles ─────────────────────────────────────────────
export function toggleFilterMode() {
  if (window.currentRole === "me") return;
  window._guestinfo_filterMode = window._guestinfo_filterMode === "week" ? "all" : "week";
  window.renderAdminApp();
}

export function setFilterMode(mode) {
  window._guestinfo_filterMode = mode === "all" ? "all" : "week";
  window.renderAdminApp();
}

export function toggleShowProposals() {
  if (!window._guestinfo_showProposals) window._guestinfo_soldOnly = false;
  window._guestinfo_showProposals = !window._guestinfo_showProposals;
  window.renderAdminApp();
}

export function toggleSoldOnly() {
  if (!window._guestinfo_soldOnly) window._guestinfo_showProposals = false;
  window._guestinfo_soldOnly = !window._guestinfo_soldOnly;
  window.renderAdminApp();
}

export function createNewLead() {
  try { localStorage.removeItem("last_guestinfo_key"); } catch(_) {}
  window.location.href = (window.GUESTINFO_PAGE || "../html/guestinfo.html").split("?")[0];
}

// ── Initialization ────────────────────────────────────────────────────────
export function initGuestinfo() {
  // inject any needed CSS here if not already done
  window.guestinfo = {
    renderGuestinfoSection,
    toggleFilterMode,      // ← single-toggle for week/all
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