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

let nameTimer, empTimer;

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

// ── Role filter ────────────────────────────────────────────────────────────
function getUsersUnderDM(users, dmUid) {
  const leads = Object.entries(users)
    .filter(([,u]) => u.role==="lead" && u.assignedDM===dmUid)
    .map(([uid])=>uid);
  const mes = Object.entries(users)
    .filter(([,u]) => u.role==="me" && leads.includes(u.assignedLead))
    .map(([uid])=>uid);
  return new Set([...leads, ...mes]);
}

function filterByRole(guestinfo, users, uid, role) {
  if (!guestinfo||!users||!uid||!role) return {};
  if (role==="admin") return guestinfo;
  if (role==="dm") {
    const under = getUsersUnderDM(users, uid);
    under.add(uid);
    return Object.fromEntries(
      Object.entries(guestinfo).filter(([,g])=>under.has(g.userUid))
    );
  }
  if (role==="lead") {
    const mes = Object.entries(users)
      .filter(([,u])=>u.role==="me" && u.assignedLead===uid)
      .map(([uid])=>uid);
    const vis = new Set([...mes, uid]);
    return Object.fromEntries(
      Object.entries(guestinfo).filter(([,g])=>vis.has(g.userUid))
    );
  }
  if (role==="me") {
    return Object.fromEntries(
      Object.entries(guestinfo).filter(([,g])=>g.userUid===uid)
    );
  }
  return {};
}

// ── Filter state ───────────────────────────────────────────────────────────
function ensureFilters() {
  if (!window._gf) {
    window._gf = {
      name: "",
      employee: "",
      date: "",
      progress: "all",
      filterMode: "week",
      showProposals: false
    };
  }
}

// ── Controls Renderer ──────────────────────────────────────────────────────
function renderControls(guestinfo, users, uid, role) {
  ensureFilters();
  const f = window._gf;

  // count proposals (unfiltered by search/date but by role)
  const base = filterByRole(guestinfo, users, uid, role);
  const propCount = groupByStatus(base).proposal.length;

  // --- search wrappers ---
  const nameWrapper = `
    <div class="search-wrapper">
      <input id="filter-name" type="text"
             placeholder="🔍 Customer name..."
             value="${f.name}"
             oninput="window.guestinfo.setSearchName(this.value)" />
      <button class="clear-btn" onclick="window.guestinfo.clearSearchName()">×</button>
    </div>`;
  const empWrapper = `
    <div class="search-wrapper">
      <input id="filter-emp" type="text"
             placeholder="🔍 Employee..."
             value="${f.employee}"
             oninput="window.guestinfo.setSearchEmployee(this.value)" />
      <button class="clear-btn" onclick="window.guestinfo.clearSearchEmployee()">×</button>
    </div>`;
  const dateWrapper = `
    <div class="search-wrapper">
      <input id="filter-date" type="date"
             value="${f.date}"
             onchange="window.guestinfo.setSearchDate(this.value)" />
      <button class="clear-btn" onclick="window.guestinfo.clearSearchDate()">×</button>
    </div>`;

  // --- progress filter ---
  const progressOptions = [
    {v:"all",  l:"All Progress"},
    {v:"good", l:"Good ≥75%"},
    {v:"warn", l:"Med 40–74%"},
    {v:"low",  l:"Low <40%"}
  ].map(opt => `<option value="${opt.v}" ${f.progress===opt.v?'selected':''}>${opt.l}</option>`).join("");
  const progressSelect = `
    <select onchange="window.guestinfo.setProgressFilter(this.value)">
      ${progressOptions}
    </select>`;

  // --- week/all toggle & proposals toggle ---
  const filterBtn = `<button class="btn btn-secondary btn-sm" onclick="window.guestinfo.toggleFilterMode()">
                       ${f.filterMode==="week"?"Show All":"This Week"}
                     </button>`;
  const propBtn   = f.showProposals
    ? `<button class="btn btn-secondary btn-sm" onclick="window.guestinfo.toggleShowProposals()">Back to Leads</button>`
    : `<button class="btn btn-warning btn-sm" onclick="window.guestinfo.toggleShowProposals()">⚠ Follow-Ups (${propCount})</button>`;

  // --- clear all ---
  const clearAll   = `<button class="btn-clear-filters btn-sm" onclick="window.guestinfo.clearAllFilters()">Clear Filters</button>`;

  // --- new lead ---
  const createBtn = `<button class="btn btn-success btn-sm" onclick="window.guestinfo.createNewLead()">+ New Lead</button>`;

  const html = `
    <div id="guestinfo-controls" class="guestinfo-controls">
      ${nameWrapper}
      ${empWrapper}
      ${dateWrapper}
      ${progressSelect}
      ${filterBtn}
      ${propBtn}
      ${clearAll}
      ${createBtn}
    </div>`;

  const root = document.getElementById('guestinfo-container');
  if (!root) return;
  if (!root.querySelector('#guestinfo-controls')) {
    root.innerHTML = html + `<div id="guestinfo-results"></div>`;
  } else {
    root.querySelector('#guestinfo-controls').outerHTML = html;
  }
}

// ── Results Renderer ───────────────────────────────────────────────────────
function renderResults(guestinfo, users, uid, role) {
  ensureFilters();
  const f = window._gf;

  // 1) role
  let items = filterByRole(guestinfo, users, uid, role);
  // 2) name
  if (f.name) {
    const nl = f.name.toLowerCase();
    items = Object.fromEntries(
      Object.entries(items)
        .filter(([,g])=>g.custName?.toLowerCase().includes(nl))
    );
  }
  // 3) employee
  if (f.employee) {
    const el = f.employee.toLowerCase();
    items = Object.fromEntries(
      Object.entries(items)
        .filter(([,g])=>{
          const sub = users[g.userUid]||{};
          const n   = (sub.name||sub.email||"").toLowerCase();
          return n.includes(el);
        })
    );
  }
  // 4) date
  if (f.date) {
    items = Object.fromEntries(
      Object.entries(items)
        .filter(([,g])=>dateToISO(g.submittedAt)===f.date)
    );
  }
  // 5) progress
  if (f.progress !== "all") {
    items = Object.fromEntries(
      Object.entries(items)
        .filter(([,g])=>{
          const pct = computeGuestPitchQuality(normGuest(g)).pct;
          return f.progress==="good" ? pct>=75
               : f.progress==="warn" ? (pct>=40 && pct<75)
               : pct<40;
        })
    );
  }
  // 6) proposals/timeframe
  const showProps = f.showProposals;
  if (!showProps) {
    if (f.filterMode==="week" && role!=="me") {
      items = Object.fromEntries(
        Object.entries(items).filter(([,g])=>inCurrentWeek(g))
      );
    }
  }

  // 7) group & render
  const groups = groupByStatus(items);
  let html = "";
  if (showProps) {
    html = statusSectionHtml("Follow-Ups", groups.proposal, users, uid, role, true)
         || `<div class="guestinfo-subsection-empty"><i>None.</i></div>`;
  } else {
    html += statusSectionHtml("New",     groups.new,     users, uid, role);
    html += statusSectionHtml("Working", groups.working, users, uid, role);
    html += statusSectionHtml("Proposal",groups.proposal,users, uid, role);
    html += statusSectionHtml("Sold",    groups.sold,    users, uid, role);
  }

  const resultsDiv = document.getElementById('guestinfo-results');
  if (resultsDiv) {
    resultsDiv.innerHTML = html;
  }
}

// ── Combined render ────────────────────────────────────────────────────────
export function renderGuestinfoSection(guestinfo, users, uid, role) {
  renderControls(guestinfo, users, uid, role);
  renderResults(guestinfo, users, uid, role);
}

// ── Filter setters & clear ─────────────────────────────────────────────────
export function setSearchName(val) {
  ensureFilters();
  window._gf.name = val;
  clearTimeout(nameTimer);
  nameTimer = setTimeout(() => renderResults(window._guestinfo, window._users, window.currentUid, window.currentRole), 100);
}
export function clearSearchName() {
  ensureFilters();
  window._gf.name = "";
  renderResults(window._guestinfo, window._users, window.currentUid, window.currentRole);
}

export function setSearchEmployee(val) {
  ensureFilters();
  window._gf.employee = val;
  clearTimeout(empTimer);
  empTimer = setTimeout(() => renderResults(window._guestinfo, window._users, window.currentUid, window.currentRole), 100);
}
export function clearSearchEmployee() {
  ensureFilters();
  window._gf.employee = "";
  renderResults(window._guestinfo, window._users, window.currentUid, window.currentRole);
}

export function setSearchDate(val) {
  ensureFilters();
  window._gf.date = val;
  renderResults(window._guestinfo, window._users, window.currentUid, window.currentRole);
}
export function clearSearchDate() {
  ensureFilters();
  window._gf.date = "";
  renderResults(window._guestinfo, window._users, window.currentUid, window.currentRole);
}

export function setProgressFilter(val) {
  ensureFilters();
  window._gf.progress = val;
  renderResults(window._guestinfo, window._users, window.currentUid, window.currentRole);
}

export function toggleFilterMode() {
  ensureFilters();
  const f = window._gf;
  f.filterMode = f.filterMode==="week"?"all":"week";
  f.showProposals = false;
  renderResults(window._guestinfo, window._users, window.currentUid, window.currentRole);
}

export function toggleShowProposals() {
  ensureFilters();
  const f = window._gf;
  f.showProposals = !f.showProposals;
  renderResults(window._guestinfo, window._users, window.currentUid, window.currentRole);
}

export function clearAllFilters() {
  window._gf = {
    name: "",
    employee: "",
    date: "",
    progress: "all",
    filterMode: "week",
    showProposals: false
  };
  renderGuestinfoSection(window._guestinfo, window._users, window.currentUid, window.currentRole);
}

export function createNewLead() {
  try { localStorage.removeItem("last_guestinfo_key"); } catch(_) {}
  window.location.href = (window.GUESTINFO_PAGE || "../html/guestinfo.html").split("?")[0];
}

// ── Initialization ───────────────────────────────────────────────────────
export function initGuestinfo() {
  window.guestinfo = {
    renderGuestinfoSection,
    setSearchName,  clearSearchName,
    setSearchEmployee, clearSearchEmployee,
    setSearchDate,  clearSearchDate,
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