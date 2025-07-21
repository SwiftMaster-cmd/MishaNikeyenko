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

// ── Helpers ────────────────────────────────────────────────────────────────
function msNDaysAgo(n) { return Date.now() - n * 864e5; }
function latestActivityTs(g) {
  return Math.max(
    g.updatedAt || 0,
    g.submittedAt || 0,
    g.sale?.soldAt || 0,
    g.solution?.completedAt || 0
  );
}
function inCurrentWeek(g) {
  return latestActivityTs(g) >= msNDaysAgo(7);
}
function dateToISO(ts) {
  return ts ? new Date(ts).toISOString().slice(0, 10) : '';
}

// ── Role-based filtering ────────────────────────────────────────────────────
function getUsersUnderDM(users, dmUid) {
  const leads = Object.entries(users)
    .filter(([,u]) => u.role === 'lead' && u.assignedDM === dmUid)
    .map(([uid]) => uid);
  const mes = Object.entries(users)
    .filter(([,u]) => u.role === 'me' && leads.includes(u.assignedLead))
    .map(([uid]) => uid);
  return new Set([...leads, ...mes]);
}

function filterByRole(guestinfo, users, uid, role) {
  if (!guestinfo || !users || !uid || !role) return {};
  if (role === 'admin') return guestinfo;
  if (role === 'dm') {
    const under = getUsersUnderDM(users, uid);
    under.add(uid);
    return Object.fromEntries(
      Object.entries(guestinfo).filter(([,g]) => under.has(g.userUid))
    );
  }
  if (role === 'lead') {
    const mes = Object.entries(users)
      .filter(([,u]) => u.role === 'me' && u.assignedLead === uid)
      .map(([uid]) => uid);
    const vis = new Set([...mes, uid]);
    return Object.fromEntries(
      Object.entries(guestinfo).filter(([,g]) => vis.has(g.userUid))
    );
  }
  if (role === 'me') {
    return Object.fromEntries(
      Object.entries(guestinfo).filter(([,g]) => g.userUid === uid)
    );
  }
  return {};
}

// ── Persistent filter state ────────────────────────────────────────────────
if (!window._guestinfo_filters) {
  window._guestinfo_filters = {
    name: '',
    employee: '',
    date: '',
    filterMode: 'week',
    showProposals: false,
    soldOnly: false,
    panelOpen: false
  };
}

// ── Controls bar + Filters panel ────────────────────────────────────────────
function controlsBarHtml(propCount, soldCount, role) {
  const f = window._guestinfo_filters;

  return `
    <div class="guestinfo-controls">

      <div class="filter-header">
        <button class="btn btn-secondary btn-sm"
                onclick="window.guestinfo.toggleFilterPanel()">
          ${f.panelOpen ? 'Filters ▴' : 'Filters ▾'}
        </button>
        <button class="btn btn-success btn-sm"
                onclick="window.guestinfo.createNewLead()">
          + New Lead
        </button>
      </div>

      <div class="filter-panel${f.panelOpen ? ' open' : ''}">
        <div class="filter-item search-wrapper">
          <input id="filter-name" type="text" placeholder="🔍 Customer name…"
                 value="${f.name}"
                 oninput="window.guestinfo.setSearchName(this.value)" />
          <button class="clear-btn"
                  onclick="window.guestinfo.clearSearchName()">×</button>
        </div>

        <div class="filter-item search-wrapper">
          <input id="filter-emp" type="text" placeholder="🔍 Employee…"
                 value="${f.employee}"
                 oninput="window.guestinfo.setSearchEmployee(this.value)" />
          <button class="clear-btn"
                  onclick="window.guestinfo.clearSearchEmployee()">×</button>
        </div>

        <div class="filter-item search-wrapper">
          <input id="filter-date" type="date"
                 value="${f.date}"
                 onchange="window.guestinfo.setSearchDate(this.value)" />
          <button class="clear-btn"
                  onclick="window.guestinfo.clearSearchDate()">×</button>
        </div>

        <div class="filter-item">
          <button class="btn btn-secondary btn-sm"
                  onclick="window.guestinfo.toggleFilterMode()">
            ${f.filterMode === 'week' ? 'This Week' : 'Show All'}
          </button>
        </div>

        <div class="filter-item">
          <button class="btn btn-warning btn-sm"
                  onclick="window.guestinfo.toggleShowProposals()">
            ${f.showProposals
              ? 'Back to Leads'
              : `⚠ Follow-Ups (${propCount})`}
          </button>
        </div>

        ${role !== 'me'
          ? `<div class="filter-item">
               <button class="btn btn-secondary btn-sm"
                       onclick="window.guestinfo.toggleSoldOnly()">
                 ${f.soldOnly
                   ? 'Back to Leads'
                   : `Sales (${soldCount})`}
               </button>
             </div>`
          : ''}

        <div class="filter-item">
          <button class="btn-clear-filters btn btn-sm"
                  onclick="window.guestinfo.clearAllFilters()">
            Clear All
          </button>
        </div>
      </div>

    </div>`;
}

// ── Empty state ───────────────────────────────────────────────────────────
function emptyHtml(msg = 'No guest leads in this view.') {
  return `
    <div class="guestinfo-empty">
      <p><strong>${msg}</strong></p>
      <button class="btn btn-success btn-sm"
              onclick="window.guestinfo.createNewLead()">
        + New Lead
      </button>
    </div>`;
}

// ── Main renderer ─────────────────────────────────────────────────────────
export function renderGuestinfoSection(guestinfo, users, uid, role) {
  const f = window._guestinfo_filters;
  let items = filterByRole(guestinfo, users, uid, role);

  // Apply name, employee, date filters...
  if (f.name) {
    const nl = f.name.toLowerCase();
    items = Object.fromEntries(Object.entries(items)
      .filter(([,g]) => g.custName?.toLowerCase().includes(nl)));
  }
  if (f.employee) {
    const elow = f.employee.toLowerCase();
    items = Object.fromEntries(Object.entries(items)
      .filter(([,g]) => {
        const sub = users[g.userUid] || {};
        const n = (sub.name||sub.email||'').toLowerCase();
        return n.includes(elow);
      }));
  }
  if (f.date) {
    items = Object.fromEntries(Object.entries(items)
      .filter(([,g]) => dateToISO(g.submittedAt) === f.date));
  }

  // Counts for toggles
  const fullGroups = groupByStatus(items);
  const propCount  = fullGroups.proposal.length;
  const soldCount  = fullGroups.sold.length;

  // Timeframe / proposal / sales logic
  if (!f.showProposals && !f.soldOnly && f.filterMode === 'week' && role !== 'me') {
    items = Object.fromEntries(Object.entries(items)
      .filter(([,g]) => inCurrentWeek(g)));
  }

  // Regroup
  const groups = groupByStatus(items);

  // Build inner HTML
  let inner = '';
  if (f.soldOnly && role !== 'me') {
    inner = groups.sold.length
      ? statusSectionHtml('Sales', groups.sold, users, uid, role)
      : emptyHtml('No sales in this view.');
  } else if (f.showProposals) {
    inner = groups.proposal.length
      ? statusSectionHtml('Follow-Ups', groups.proposal, users, uid, role, true)
      : emptyHtml('No follow-ups in this view.');
  } else {
    const any = groups.new.length || groups.working.length || groups.proposal.length;
    if (!any) {
      inner = emptyHtml("You're all caught up!");
    } else {
      if (groups.new.length)      inner += statusSectionHtml('New',      groups.new,      users, uid, role);
      if (groups.working.length)  inner += statusSectionHtml('Working',  groups.working,  users, uid, role);
      if (groups.proposal.length) inner += statusSectionHtml('Proposal', groups.proposal, users, uid, role, true);
    }
  }

  return `
    <section class="admin-section guestinfo-section" id="guestinfo-section">
      ${controlsBarHtml(propCount, soldCount, role)}
      <div id="guestinfo-results">
        ${inner}
      </div>
    </section>
  `;
}

// ── Filter setters & clearers ─────────────────────────────────────────────
export function toggleFilterPanel() {
  window._guestinfo_filters.panelOpen = !window._guestinfo_filters.panelOpen;
  window.renderAdminApp();
}
export function setSearchName(val) {
  window._guestinfo_filters.name = val; window.renderAdminApp();
}
export function clearSearchName() {
  window._guestinfo_filters.name = ''; window.renderAdminApp();
}
export function setSearchEmployee(val) {
  window._guestinfo_filters.employee = val; window.renderAdminApp();
}
export function clearSearchEmployee() {
  window._guestinfo_filters.employee = ''; window.renderAdminApp();
}
export function setSearchDate(val) {
  window._guestinfo_filters.date = val; window.renderAdminApp();
}
export function clearSearchDate() {
  window._guestinfo_filters.date = ''; window.renderAdminApp();
}
export function toggleFilterMode() {
  const f = window._guestinfo_filters;
  f.filterMode = f.filterMode === 'week' ? 'all' : 'week';
  f.showProposals = f.soldOnly = false;
  window.renderAdminApp();
}
export function toggleShowProposals() {
  const f = window._guestinfo_filters;
  f.showProposals = !f.showProposals;
  f.soldOnly = false;
  window.renderAdminApp();
}
export function toggleSoldOnly() {
  const f = window._guestinfo_filters;
  f.soldOnly = !f.soldOnly;
  f.showProposals = false;
  window.renderAdminApp();
}
export function clearAllFilters() {
  window._guestinfo_filters = {
    name: '', employee: '', date: '',
    filterMode: 'week',
    showProposals: false,
    soldOnly: false,
    panelOpen: false
  };
  window.renderAdminApp();
}
export function createNewLead() {
  try { localStorage.removeItem('last_guestinfo_key'); } catch(_) {}
  window.location.href = (window.GUESTINFO_PAGE || '../html/guestinfo.html').split('?')[0];
}

// ── Initialization ───────────────────────────────────────────────────────
export function initGuestinfo() {
  window.guestinfo = {
    renderGuestinfoSection,
    toggleFilterPanel,
    setSearchName, clearSearchName,
    setSearchEmployee, clearSearchEmployee,
    setSearchDate, clearSearchDate,
    toggleFilterMode,
    toggleShowProposals,
    toggleSoldOnly,
    clearAllFilters,
    toggleActionButtons,
    toggleEdit, cancelEdit, saveEdit, deleteGuestInfo,
    markSold, deleteSale, openGuestInfoPage,
    createNewLead, recomputePitch
  };
}