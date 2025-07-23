// guestinfo-container.js

// Helpers (import/inline as needed)
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

// Global mode state and setter
if (!window.guestinfoMode) window.guestinfoMode = 'open';

window.setGuestinfoMode = function(mode) {
  window.guestinfoMode = mode;
  window.renderAdminApp();
};

// Mode switcher UI
function modeSwitcherHtml() {
  const m = window.guestinfoMode || 'open';
  const modes = [
    ['open', 'Open'],
    ['edit', 'Quick Edit'],
    ['markSold', 'Mark Sold'],
    ['delete', 'Delete']
  ];
  return `
    <div class="guestinfo-mode-switcher" style="margin-bottom:18px;display:flex;gap:16px;align-items:center;">
      <span style="font-weight:600;color:#444;">Action Mode:</span>
      ${modes.map(([val, lbl]) =>
        `<label style="margin-right:12px;cursor:pointer;">
          <input type="radio" name="guestinfo-mode" value="${val}" ${m===val?'checked':''}
            onchange="window.setGuestinfoMode('${val}')"
            style="margin-right:4px;vertical-align:middle;" /> ${lbl}
        </label>`
      ).join('')}
    </div>
  `;
}

// Filtering and controls bar (same as before)
function controlsBarHtml(propCount, soldCount, role) {
  const f = window._guestinfo_filters;
  const header = `
    <div style="display:flex;gap:8px;align-items:center;">
      <button class="btn btn-secondary btn-sm"
              onclick="window.guestinfo.toggleFilterPanel()">
        ${f.panelOpen ? 'Filters ▴' : 'Filters ▾'}
      </button>
      <button class="btn btn-success btn-sm"
              onclick="window.guestinfo.createNewLead()">
        + New Lead
      </button>
    </div>`;
  const panelStyle = f.panelOpen
    ? 'display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;'
    : 'display:none;';
  const panel = `
    <div id="filter-panel" style="${panelStyle}">
      <div class="search-wrapper">
        <input id="filter-name" type="text" placeholder="🔍 Customer name…" 
               value="${f.name}" 
               oninput="window.guestinfo.setSearchName(this.value)" />
        <button class="clear-btn" onclick="window.guestinfo.clearSearchName()">×</button>
      </div>
      <div class="search-wrapper">
        <input id="filter-emp" type="text" placeholder="🔍 Employee…" 
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
        ${f.filterMode === 'week' ? 'Show All' : 'This Week'}
      </button>
      <button class="btn btn-warning btn-sm"
              onclick="window.guestinfo.toggleShowProposals()">
        ${f.showProposals ? 'Back to Leads' : `⚠ Follow-Ups (${propCount})`}
      </button>
      ${role !== 'me'
        ? `<button class="btn btn-secondary btn-sm"
                   onclick="window.guestinfo.toggleSoldOnly()">
             ${f.soldOnly ? 'Back to Leads' : `Sales (${soldCount})`}
           </button>`
        : ''}
      <button class="btn-clear-filters btn-sm" 
              onclick="window.guestinfo.clearAllFilters()">
        Clear All
      </button>
    </div>`;
  return `<div class="guestinfo-controls">${header}${panel}</div>`;
}

// Empty state UI
function emptyHtml(msg = "No guest leads in this view.") {
  return `
    <div class="guestinfo-empty" style="text-align:center;margin-top:16px;">
      <p><b>${msg}</b></p>
      <button class="btn btn-success btn-sm"
              onclick="window.guestinfo.createNewLead()">
        + New Lead
      </button>
    </div>`;
}

// Role filter logic (unchanged)
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

// Main renderer with mode-based card click
export function renderGuestinfoSection(guestinfo, users, uid, role) {
  const f = window._guestinfo_filters;
  let items = filterByRole(guestinfo, users, uid, role);

  // 1. Name filter
  if (f.name) {
    const nameLower = f.name.toLowerCase();
    items = Object.fromEntries(
      Object.entries(items).filter(([,g]) =>
        g.custName?.toLowerCase().includes(nameLower)
      )
    );
  }

  // 2. Employee filter
  if (f.employee) {
    const empLower = f.employee.toLowerCase();
    items = Object.fromEntries(
      Object.entries(items).filter(([,g]) => {
        const sub = users[g.userUid] || {};
        const n = (sub.name || sub.email || "").toLowerCase();
        return n.includes(empLower);
      })
    );
  }

  // 3. Date filter
  if (f.date) {
    items = Object.fromEntries(
      Object.entries(items).filter(([,g]) =>
        dateToISO(g.submittedAt) === f.date
      )
    );
  }

  // Count for toggles
  const fullGroups = groupByStatus(items);
  const propCount  = fullGroups.proposal.length;
  const soldCount  = fullGroups.sold.length;

  // 4. Timeframe / proposals / sales toggles
  if (!f.showProposals && !f.soldOnly && f.filterMode === 'week' && role !== 'me') {
    items = Object.fromEntries(
      Object.entries(items).filter(([,g]) => inCurrentWeek(g))
    );
  }

  // 5. Regroup by status
  const groups = groupByStatus(items);

  // 6. Build inner HTML for each status section
  let inner = '';
  if (f.soldOnly && role !== 'me') {
    if (groups.sold.length) {
      inner = statusSectionHtml('Sales', groups.sold, users, uid, role);
    } else {
      inner = emptyHtml('No sales in this view.');
    }
  } else if (f.showProposals) {
    if (groups.proposal.length) {
      inner = statusSectionHtml('Follow-Ups', groups.proposal, users, uid, role, true);
    } else {
      inner = emptyHtml('No follow-ups in this view.');
    }
  } else {
    const hasAny = groups.new.length || groups.working.length || groups.proposal.length;
    if (!hasAny) {
      inner = emptyHtml("You're all caught up!");
    } else {
      if (groups.new.length)     inner += statusSectionHtml('New',      groups.new,     users, uid, role);
      if (groups.working.length) inner += statusSectionHtml('Working',  groups.working, users, uid, role);
      if (groups.proposal.length)inner += statusSectionHtml('Proposal', groups.proposal,users, uid, role, true);
    }
  }

  // ---- Render section ----
  return `
    <section class="admin-section guestinfo-section" id="guestinfo-section">
      ${modeSwitcherHtml()}
      ${controlsBarHtml(propCount, soldCount, role)}
      <div id="guestinfo-results">
        ${inner}
      </div>
    </section>
  `;
}

// ---- Card click handler: triggers action for the current mode ----
window.handleGuestCardClick = async function(id) {
  const mode = window.guestinfoMode || 'open';
  if (mode === 'open')        window.guestinfo.openGuestInfoPage(id);
  else if (mode === 'edit')   window.guestinfo.toggleEdit(id);
  else if (mode === 'markSold') await window.guestinfo.markSold(id);
  else if (mode === 'delete')    await window.guestinfo.deleteGuestInfo(id);
};