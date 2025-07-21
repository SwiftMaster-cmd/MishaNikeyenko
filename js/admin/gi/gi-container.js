// guestinfo-container.js

import {
  groupByStatus,
  statusSectionHtml,
  detectStatus,
  computeGuestPitchQuality,
  normGuest
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

let nameDebounceTimer, empDebounceTimer;

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
function dateToISO(ts) {
  return ts ? new Date(ts).toISOString().slice(0, 10) : '';
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

function filterByRole(guestinfo, users, uid, role) {
  if (!guestinfo || !users || !uid || !role) return {};
  if (role === "admin") return guestinfo;
  if (role === "dm") {
    const under = getUsersUnderDM(users, uid);
    under.add(uid);
    return Object.fromEntries(
      Object.entries(guestinfo).filter(([,g]) => under.has(g.userUid))
    );
  }
  if (role === "lead") {
    const mes = Object.entries(users)
      .filter(([,u]) => u.role === "me" && u.assignedLead === uid)
      .map(([uid]) => uid);
    const vis = new Set([...mes, uid]);
    return Object.fromEntries(
      Object.entries(guestinfo).filter(([,g]) => vis.has(g.userUid))
    );
  }
  if (role === "me") {
    return Object.fromEntries(
      Object.entries(guestinfo).filter(([,g]) => g.userUid === uid)
    );
  }
  return {};
}

// ── Controls & empty state ─────────────────────────────────────────────────
function controlsBarHtml(propCount, role, showCreate = true) {
  const f = window._guestinfo_filters;

  // search name
  const nameWrapper = `
    <div class="search-wrapper">
      <input id="filter-name"
             type="text"
             placeholder="🔍 Customer name..."
             value="${f.name}"
             oninput="window.guestinfo.setSearchName(this.value)" />
      <button class="clear-btn" onclick="window.guestinfo.clearSearchName()">×</button>
    </div>`;

  // search employee
  const empWrapper = `
    <div class="search-wrapper">
      <input id="filter-emp"
             type="text"
             placeholder="🔍 Employee..."
             value="${f.employee}"
             oninput="window.guestinfo.setSearchEmployee(this.value)" />
      <button class="clear-btn" onclick="window.guestinfo.clearSearchEmployee()">×</button>
    </div>`;

  // date filter
  const dateWrapper = `
    <div class="search-wrapper">
      <input id="filter-date"
             type="date"
             value="${f.date}"
             onchange="window.guestinfo.setSearchDate(this.value)" />
      <button class="clear-btn" onclick="window.guestinfo.clearSearchDate()">×</button>
    </div>`;

  // progress filter
  const progOptions = [
    { v: 'all',  l: 'All Progress' },
    { v: 'good', l: 'Good ≥75%' },
    { v: 'warn', l: 'Med 40–74%' },
    { v: 'low',  l: 'Low <40%' },
  ].map(opt => `<option value="${opt.v}" ${f.progress===opt.v?'selected':''}>${opt.l}</option>`).join('');
  const progressSelect = `
    <select onchange="window.guestinfo.setProgressFilter(this.value)">
      ${progOptions}
    </select>`;

  // week/all toggle
  const filterLabel = f.filterMode === "week" ? "Show All" : "This Week";
  const filterBtn = `<button class="btn btn-secondary btn-sm" onclick="window.guestinfo.toggleFilterMode()">${filterLabel}</button>`;

  // proposals toggle
  const propBtn = f.showProposals
    ? `<button class="btn btn-secondary btn-sm" onclick="window.guestinfo.toggleShowProposals()">Back to Leads</button>`
    : `<button class="btn btn-warning btn-sm" onclick="window.guestinfo.toggleShowProposals()">⚠ Follow-Ups (${propCount})</button>`;

  // clear all filters
  const clearAll = `<button class="btn-clear-filters btn-sm" onclick="window.guestinfo.clearAllFilters()">Clear Filters</button>`;

  // new lead
  const createBtn = showCreate
    ? `<button class="btn btn-success btn-sm" onclick="window.guestinfo.createNewLead()">+ New Lead</button>`
    : "";

  return `
    <div class="guestinfo-controls" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
      ${nameWrapper}
      ${empWrapper}
      ${dateWrapper}
      ${progressSelect}
      ${filterBtn}
      ${propBtn}
      ${clearAll}
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
  if (!window._guestinfo_filters) {
    window._guestinfo_filters = {
      name: "",
      employee: "",
      date: "",
      progress: "all",
      filterMode: "week",
      showProposals: false
    };
  }
  const f = window._guestinfo_filters;

  // 1) role filter
  const byRole = filterByRole(guestinfo, users, uid, role);

  // 2) name filter
  const byName = f.name
    ? Object.fromEntries(
        Object.entries(byRole)
          .filter(([,g]) => g.custName?.toLowerCase().includes(f.name.toLowerCase()))
      )
    : byRole;

  // 3) employee filter
  const byEmp = f.employee
    ? Object.fromEntries(
        Object.entries(byName)
          .filter(([,g]) => {
            const sub = users[g.userUid] || {};
            const n = (sub.name||sub.email||"").toLowerCase();
            return n.includes(f.employee.toLowerCase());
          })
      )
    : byName;

  // 4) date filter
  const byDate = f.date
    ? Object.fromEntries(
        Object.entries(byEmp)
          .filter(([,g]) => dateToISO(g.submittedAt) === f.date)
      )
    : byEmp;

  // compute progress for each and filter
  const byProg = f.progress === 'all'
    ? byDate
    : Object.fromEntries(
        Object.entries(byDate).filter(([,g]) => {
          const pct = computeGuestPitchQuality(normGuest(g)).pct;
          return f.progress === 'good' ? pct >= 75
               : f.progress === 'warn' ? pct >= 40 && pct < 75
               : pct < 40;
        })
      );

  // counts for proposals
  const fullGroups = groupByStatus(byProg);
  const propCount  = fullGroups.proposal.length;

  // timeframe / proposals
  let items;
  if (f.showProposals) {
    items = byProg;
  } else if (f.filterMode === "week" || role === "me") {
    items = Object.fromEntries(
      Object.entries(byProg).filter(([,g]) => inCurrentWeek(g))
    );
  } else {
    items = byProg;
  }

  // group and render
  const groups = groupByStatus(items);
  const showProps = f.showProposals;

  let html = "";
  if (showProps) {
    html = `
      <section class="guestinfo-section">
        ${controlsBarHtml(propCount, role)}
        ${statusSectionHtml("Follow-Ups", groups.proposal, users, uid, role, true)}
        ${groups.proposal.length ? "" : emptyHtml("No follow-ups in this view.")}
      </section>`;
  } else {
    const isEmpty = !groups.new.length && !groups.working.length && !groups.proposal.length;
    html = `
      <section class="guestinfo-section">
        ${controlsBarHtml(propCount, role, !isEmpty)}
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

// ── Filter setters & clears ────────────────────────────────────────────────
export function setSearchName(val) {
  window._guestinfo_filters.name = val;
  clearTimeout(nameDebounceTimer);
  nameDebounceTimer = setTimeout(() => window.renderAdminApp(), 300);
}
export function clearSearchName() {
  window._guestinfo_filters.name = "";
  window.renderAdminApp();
}

export function setSearchEmployee(val) {
  window._guestinfo_filters.employee = val;
  clearTimeout(empDebounceTimer);
  empDebounceTimer = setTimeout(() => window.renderAdminApp(), 300);
}
export function clearSearchEmployee() {
  window._guestinfo_filters.employee = "";
  window.renderAdminApp();
}

export function setSearchDate(val) {
  window._guestinfo_filters.date = val;
  window.renderAdminApp();
}
export function clearSearchDate() {
  window._guestinfo_filters.date = "";
  window.renderAdminApp();
}

export function setProgressFilter(val) {
  window._guestinfo_filters.progress = val;
  window.renderAdminApp();
}

export function toggleFilterMode() {
  const f = window._guestinfo_filters;
  f.filterMode = f.filterMode === "week" ? "all" : "week";
  f.showProposals = false;
  window.renderAdminApp();
}

export function toggleShowProposals() {
  const f = window._guestinfo_filters;
  f.showProposals = !f.showProposals;
  window.renderAdminApp();
}

export function clearAllFilters() {
  window._guestinfo_filters = {
    name: "",
    employee: "",
    date: "",
    progress: "all",
    filterMode: "week",
    showProposals: false
  };
  window.renderAdminApp();
}

export function createNewLead() {
  try { localStorage.removeItem("last_guestinfo_key"); } catch(_) {}
  window.location.href = (window.GUESTINFO_PAGE||"../html/guestinfo.html").split("?")[0];
}

// ── Initialization ───────────────────────────────────────────────────────
export function initGuestinfo() {
  window.guestinfo = {
    renderGuestinfoSection,
    setSearchName, clearSearchName,
    setSearchEmployee, clearSearchEmployee,
    setSearchDate, clearSearchDate,
    setProgressFilter,
    toggleFilterMode,
    toggleShowProposals,
    clearAllFilters,
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