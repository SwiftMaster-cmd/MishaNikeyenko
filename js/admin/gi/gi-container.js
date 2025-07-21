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

// ── Time & date helpers ────────────────────────────────────────────────────
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

// ── Role-based visibility ──────────────────────────────────────────────────
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

// ── Filter state ───────────────────────────────────────────────────────────
function ensureFilters() {
  if (!window._guestinfo_filters) {
    window._guestinfo_filters = {
      name:         "",
      employee:     "",
      date:         "",
      filterMode:   "week",
      showProposals:false,
      soldOnly:     false
    };
  }
}

// ── Generate filter panel HTML ─────────────────────────────────────────────
function filterPanelHtml(guestinfo, users, uid, role) {
  ensureFilters();
  const f = window._guestinfo_filters;
  const byRole = filterByRole(guestinfo, users, uid, role);
  const groups = groupByStatus(byRole);

  return `
    <div class="search-wrapper">
      <input id="filter-name" type="text"
             placeholder="🔍 Customer name..."
             value="${f.name}"
             oninput="window.guestinfo.setSearchName(this.value)" />
      <button class="clear-btn" onclick="window.guestinfo.clearSearchName()">×</button>
    </div>
    <div class="search-wrapper">
      <input id="filter-emp" type="text"
             placeholder="🔍 Employee..."
             value="${f.employee}"
             oninput="window.guestinfo.setSearchEmployee(this.value)" />
      <button class="clear-btn" onclick="window.guestinfo.clearSearchEmployee()">×</button>
    </div>
    <div class="search-wrapper">
      <input id="filter-date" type="date"
             value="${f.date}"
             onchange="window.guestinfo.setSearchDate(this.value)" />
      <button class="clear-btn" onclick="window.guestinfo.clearSearchDate()">×</button>
    </div>
    <button class="btn btn-secondary btn-sm"
            onclick="window.guestinfo.toggleFilterMode()">
      ${f.filterMode === "week" ? "Show All" : "This Week"}
    </button>
    <button class="btn btn-warning btn-sm"
            onclick="window.guestinfo.toggleShowProposals()">
      ${f.showProposals ? "Back to Leads" : `⚠ Follow-Ups (${groups.proposal.length})`}
    </button>
    <button class="btn btn-secondary btn-sm"
            onclick="window.guestinfo.toggleSoldOnly()">
      ${f.soldOnly ? "Back to Leads" : `Sales (${groups.sold.length})`}
    </button>
    <button class="btn-clear-filters btn-sm"
            onclick="window.guestinfo.clearAllFilters()">Clear Filters</button>
  `;
}

// ── Render the controls (once) ─────────────────────────────────────────────
function renderControls(guestinfo, users, uid, role) {
  ensureFilters();
  const root = document.getElementById('guestinfo-container');
  let wrapper = document.getElementById('guestinfo-controls-wrapper');

  if (!wrapper) {
    wrapper = document.createElement('div');
    wrapper.id = 'guestinfo-controls-wrapper';
    wrapper.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <button id="filter-toggle-btn"
                class="btn btn-primary btn-sm">
          Filters ▾
        </button>
        <button class="btn btn-success btn-sm"
                onclick="window.guestinfo.createNewLead()">
          + New Lead
        </button>
      </div>
      <div id="filter-panel"
           style="display:none;margin-top:8px;gap:8px;flex-wrap:wrap;display:flex;">
      </div>
    `;
    root.appendChild(wrapper);
    root.insertAdjacentHTML('beforeend', '<div id="guestinfo-results"></div>');

    document.getElementById('filter-toggle-btn')
      .addEventListener('click', () => {
        const p = document.getElementById('filter-panel');
        const open = p.style.display === 'flex';
        p.style.display = open ? 'none' : 'flex';
        document.getElementById('filter-toggle-btn').textContent =
          open ? 'Filters ▾' : 'Filters ▴';
      });
  }
  document.getElementById('filter-panel').innerHTML =
    filterPanelHtml(guestinfo, users, uid, role);
}

// ── Render only the results (no controls) ─────────────────────────────────
export function renderResults(guestinfo, users, uid, role) {
  ensureFilters();
  const f = window._guestinfo_filters;

  // apply filters step by step...
  let items = filterByRole(guestinfo, users, uid, role);
  if (f.name)     items = Object.fromEntries(Object.entries(items)
                       .filter(([,g])=>g.custName?.toLowerCase().includes(f.name.toLowerCase())));
  if (f.employee) items = Object.fromEntries(Object.entries(items)
                       .filter(([,g])=>{
                         const sub = users[g.userUid]||{};
                         const n   = (sub.name||sub.email||"").toLowerCase();
                         return n.includes(f.employee.toLowerCase());
                       }));
  if (f.date)     items = Object.fromEntries(Object.entries(items)
                       .filter(([,g])=>dateToISO(g.submittedAt)===f.date));

  const fullGroups = groupByStatus(items);

  if (f.filterMode === "week" && !f.showProposals && !f.soldOnly) {
    items = Object.fromEntries(Object.entries(items)
              .filter(([,g])=>inCurrentWeek(g)));
  }
  if (f.showProposals) {
    // leave items as‐is for proposals view
  } else if (f.soldOnly) {
    // leave items as‐is for sales view
  }

  const groups = groupByStatus(items);
  let html = "";

  if (f.soldOnly) {
    html = statusSectionHtml("Sales", groups.sold, users, uid, role)
         || `<div class="guestinfo-subsection-empty"><i>None.</i></div>`;
  }
  else if (f.showProposals) {
    html = statusSectionHtml("Follow-Ups", groups.proposal, users, uid, role, true)
         || `<div class="guestinfo-subsection-empty"><i>None.</i></div>`;
  }
  else {
    html += statusSectionHtml("New",     groups.new,     users, uid, role);
    html += statusSectionHtml("Working", groups.working, users, uid, role);
    html += statusSectionHtml("Proposal",groups.proposal,users, uid, role);
    html += statusSectionHtml("Sold",    groups.sold,    users, uid, role);
  }

  document.getElementById('guestinfo-results').innerHTML = html;
}

// ── Main render entry ─────────────────────────────────────────────────────
export function renderGuestinfoSection(guestinfo, users, uid, role) {
  // ensure container exists
  let root = document.getElementById('guestinfo-container');
  if (!root) {
    root = document.createElement('div');
    root.id = 'guestinfo-container';
    document.getElementById('adminApp').appendChild(root);
  }
  renderControls(guestinfo, users, uid, role);
  renderResults(guestinfo, users, uid, role);
}

// ── Filter setters & clears ───────────────────────────────────────────────
export function setSearchName(val) {
  ensureFilters();
  window._guestinfo_filters.name = val;
  renderResults(window._guestinfo, window._users, window.currentUid, window.currentRole);
}
export function clearSearchName() {
  ensureFilters();
  window._guestinfo_filters.name = "";
  renderResults(window._guestinfo, window._users, window.currentUid, window.currentRole);
}

export function setSearchEmployee(val) {
  ensureFilters();
  window._guestinfo_filters.employee = val;
  renderResults(window._guestinfo, window._users, window.currentUid, window.currentRole);
}
export function clearSearchEmployee() {
  ensureFilters();
  window._guestinfo_filters.employee = "";
  renderResults(window._guestinfo, window._users, window.currentUid, window.currentRole);
}

export function setSearchDate(val) {
  ensureFilters();
  window._guestinfo_filters.date = val;
  renderResults(window._guestinfo, window._users, window.currentUid, window.currentRole);
}
export function clearSearchDate() {
  ensureFilters();
  window._guestinfo_filters.date = "";
  renderResults(window._guestinfo, window._users, window.currentUid, window.currentRole);
}

export function toggleFilterMode() {
  ensureFilters();
  const f = window._guestinfo_filters;
  f.filterMode    = f.filterMode === "week" ? "all" : "week";
  f.showProposals = false;
  f.soldOnly      = false;
  renderGuestinfoSection(window._guestinfo, window._users, window.currentUid, window.currentRole);
}

export function toggleShowProposals() {
  ensureFilters();
  const f = window._guestinfo_filters;
  f.showProposals = !f.showProposals;
  f.soldOnly      = false;
  renderGuestinfoSection(window._guestinfo, window._users, window.currentUid, window.currentRole);
}

export function toggleSoldOnly() {
  ensureFilters();
  const f = window._guestinfo_filters;
  f.soldOnly      = !f.soldOnly;
  f.showProposals = false;
  renderGuestinfoSection(window._guestinfo, window._users, window.currentUid, window.currentRole);
}

export function clearAllFilters() {
  window._guestinfo_filters = {
    name:         "",
    employee:     "",
    date:         "",
    filterMode:   "week",
    showProposals:false,
    soldOnly:     false
  };
  renderGuestinfoSection(window._guestinfo, window._users, window.currentUid, window.currentRole);
}

// ── Initialization ───────────────────────────────────────────────────────
export function initGuestinfo() {
  window.guestinfo = {
    renderGuestinfoSection,
    renderResults,
    setSearchName,       clearSearchName,
    setSearchEmployee,   clearSearchEmployee,
    setSearchDate,       clearSearchDate,
    toggleFilterMode,
    toggleShowProposals,
    toggleSoldOnly,
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