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
function dateToISO(dt) {
  const d = new Date(dt);
  return d.toISOString().slice(0, 10);
}

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
  const nameInput = `
    <input type="text"
           placeholder="🔍 Customer name..."
           value="${window._guestinfo_searchName || ''}"
           oninput="window.guestinfo.setSearchName(this.value)"
           style="flex:1;min-width:100px;padding:4px 8px;border-radius:4px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.05);color:#fff;" />`;
  const empInput = `
    <input type="text"
           placeholder="🔍 Employee..."
           value="${window._guestinfo_searchEmployee || ''}"
           oninput="window.guestinfo.setSearchEmployee(this.value)"
           style="flex:1;min-width:100px;padding:4px 8px;border-radius:4px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.05);color:#fff;" />`;
  const dateInput = `
    <input type="date"
           value="${window._guestinfo_searchDate || ''}"
           onchange="window.guestinfo.setSearchDate(this.value)"
           style="padding:4px 8px;border-radius:4px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.05);color:#fff;" />`;

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
      ${nameInput}
      ${empInput}
      ${dateInput}
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
  // init filter state
  window._guestinfo_searchName      ??= "";
  window._guestinfo_searchEmployee  ??= "";
  window._guestinfo_searchDate      ??= "";
  window._guestinfo_filterMode      ??= "week";
  window._guestinfo_showProposals   ??= false;
  window._guestinfo_soldOnly        ??= false;

  // 1) Role filter
  const byRole = filterGuestinfoByRole(guestinfo, users, uid, role);

  // 2) Name filter
  const nameLower = window._guestinfo_searchName.toLowerCase();
  const byName = Object.fromEntries(
    Object.entries(byRole)
      .filter(([,g]) => g.custName?.toLowerCase().includes(nameLower))
  );

  // 3) Employee filter
  const empLower = window._guestinfo_searchEmployee.toLowerCase();
  const byEmp = Object.fromEntries(
    Object.entries(byName)
      .filter(([,g]) => {
        const sub = users[g.userUid] || {};
        const n = (sub.name||sub.email||"").toLowerCase();
        return n.includes(empLower);
      })
  );

  // 4) Date filter
  const dateVal = window._guestinfo_searchDate;
  const byDate = dateVal
    ? Object.fromEntries(
        Object.entries(byEmp)
          .filter(([,g]) => dateToISO(g.submittedAt) === dateVal)
      )
    : byEmp;

  // 5) count full groups for labels
  const fullGroups = groupByStatus(byDate);
  const propCount  = fullGroups.proposal.length;
  const soldCount  = fullGroups.sold.length;

  // 6) timeframe/proposals/sales
  let items;
  if (window._guestinfo_showProposals) {
    items = byDate;
  } else if (window._guestinfo_soldOnly) {
    items = byDate;
  } else if (window._guestinfo_filterMode === "week" || role === "me") {
    items = Object.fromEntries(
      Object.entries(byDate).filter(([,g]) => inCurrentWeek(g))
    );
  } else {
    items = byDate;
  }

  // 7) group and render
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

// ── Filter setters & toggles ─────────────────────────────────────────────
export function setSearchName(text) {
  window._guestinfo_searchName = text;
  window.renderAdminApp();
}
export function setSearchEmployee(text) {
  window._guestinfo_searchEmployee = text;
  window.renderAdminApp();
}
export function setSearchDate(dateStr) {
  window._guestinfo_searchDate = dateStr;
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
    setSearchName,
    setSearchEmployee,
    setSearchDate,
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