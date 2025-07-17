/* users.js  -- store-grouped user cards w/ staffing goals & collapse
 * v2 adds:
 *   - store staffing goal (default 2 incl. TL) editable by Admin
 *   - grouped by store summary 2/2 ✓ etc
 *   - auto-collapse full stores, auto-expand under/empty
 *   - click summary toggles details
 */

(() => {
  const ROLES = window.ROLES || { ME: "me", LEAD: "lead", DM: "dm", ADMIN: "admin" };
  const DEFAULT_STORE_GOAL = 2;

  /* ------------------------------------------------------------------
   * UI open/closed memory (persist across renders)
   *  - if user toggles, we remember in these sets.
   *  - we store encoded storeNumber strings.
   * ------------------------------------------------------------------ */
  if (!window._users_ui_openStores) window._users_ui_openStores = new Set();   // explicitly opened
  if (!window._users_ui_closedStores) window._users_ui_closedStores = new Set(); // explicitly closed

  /* ------------------------------------------------------------------
   * Role badge HTML helper
   * ------------------------------------------------------------------ */
  const roleBadge = r => `<span class="role-badge role-${r}">${r.toUpperCase()}</span>`;

  /* ------------------------------------------------------------------
   * Global permission adapters (wrapping legacy globals)
   * ------------------------------------------------------------------ */
  function canEdit(role) {
    if (typeof window.canEdit === "function") return window.canEdit(role);
    return role === ROLES.ADMIN || role === ROLES.DM; // fallback
  }
  function canDelete(role) {
    if (typeof window.canDelete === "function") return window.canDelete(role);
    return role === ROLES.ADMIN; // fallback
  }
  function assertEdit() {
    if (!canEdit(window.currentRole)) throw "PERM_DENIED_EDIT";
  }

  /* ------------------------------------------------------------------
   * Visible users filter (same logic you had; kept + slight cleanup)
   * ------------------------------------------------------------------ */
  function filterVisibleUsers(users, currentUid, currentRole) {
    if (!users || !currentUid || !currentRole) return [];

    const currentUser = users[currentUid] || {};

    return Object.entries(users).filter(([uid, u]) => {
      if (currentRole === ROLES.ADMIN) return true;

      if (currentRole === ROLES.DM) {
        return u.role !== ROLES.ADMIN; // hide Admin peers
      }

      if (currentRole === ROLES.LEAD) {
        if (u.role === ROLES.ME && u.assignedLead === currentUid) return true;
        if (u.role === ROLES.DM && currentUser.assignedDM === uid) return true;
        if (uid === currentUid) return true;
        return false;
      }

      if (currentRole === ROLES.ME) {
        if (uid === currentUid) return true;
        if (uid === currentUser.assignedLead) return true;
        if (uid === currentUser.assignedDM) return true;
        return false;
      }
      return false;
    });
  }

  /* ------------------------------------------------------------------
   * Group visible users by storeNumber (string). Also return unassigned.
   * ------------------------------------------------------------------ */
  function groupUsersByStore(visibleUsers) {
    const stores = {}; // storeNumber -> array<[uid,user]>
    const unassigned = [];
    for (const [uid, u] of visibleUsers) {
      const storeNum = u.store ? String(u.store) : null;
      if (!storeNum) {
        unassigned.push([uid, u]);
      } else {
        if (!stores[storeNum]) stores[storeNum] = [];
        stores[storeNum].push([uid, u]);
      }
    }
    return { stores, unassigned };
  }

  /* ------------------------------------------------------------------
   * Load staffing goals from global cache (dashboard writes window._staffGoals)
   * Fallback to DEFAULT_STORE_GOAL if missing.
   * ------------------------------------------------------------------ */
  function getStoreGoal(storeNumber) {
    const goalsObj = window._staffGoals || {};
    const rec = goalsObj[storeNumber];
    const val = parseInt(rec?.goal, 10);
    return (!isNaN(val) && val > 0) ? val : DEFAULT_STORE_GOAL;
  }

  /* ------------------------------------------------------------------
   * Compute staffing status for a store
   * count LEAD + ME only; require at least 1 LEAD
   * ------------------------------------------------------------------ */
  function computeStaffStatus(entries, storeNumber) {
    let count = 0;
    let hasLead = false;
    for (const [, u] of entries) {
      if (u.role === ROLES.ME || u.role === ROLES.LEAD) {
        count++;
        if (u.role === ROLES.LEAD) hasLead = true;
      }
    }
    const goal = getStoreGoal(storeNumber);
    let status, icon, cls;
    if (count === 0) {
      status = "empty"; icon = "✖"; cls = "staff-empty";
    } else if (count >= goal && hasLead) {
      status = "full"; icon = "✓"; cls = "staff-full";
    } else {
      status = "under"; icon = "⚠"; cls = "staff-under";
    }
    return { count, goal, hasLead, status, icon, cls };
  }

  /* ------------------------------------------------------------------
   * Should store render expanded?
   * Honor user toggles; else auto-expand under/empty, collapse full.
   * ------------------------------------------------------------------ */
  function isStoreOpen(storeNumber, staffStatus) {
    const key = encodeURIComponent(storeNumber);
    if (window._users_ui_openStores.has(key)) return true;
    if (window._users_ui_closedStores.has(key)) return false;
    // default behavior:
    return staffStatus.status !== "full"; // open if under/empty
  }

  /* ------------------------------------------------------------------
   * Toggle store open/closed (click handler)
   * ------------------------------------------------------------------ */
  function toggleStoreOpen(storeNumber) {
    const key = encodeURIComponent(storeNumber);
    // detect current from DOM
    const node = document.querySelector(`.user-store-summary[data-store="${CSS.escape(storeNumber)}"]`);
    const currentlyOpen = node?.classList.contains("open");

    window._users_ui_openStores.delete(key);
    window._users_ui_closedStores.delete(key);
    if (!currentlyOpen) {
      window._users_ui_openStores.add(key);
    } else {
      window._users_ui_closedStores.add(key);
    }
    window.renderAdminApp();
  }

  /* ------------------------------------------------------------------
   * Render store summary row (collapsed header)
   * ------------------------------------------------------------------ */
  function storeSummaryHtml(storeNumber, staffStatus, isOpen, isAdminView) {
    const { count, goal, icon, cls } = staffStatus;
    const tooltip = staffStatus.hasLead
      ? `${count}/${goal} staffed`
      : `${count}/${goal} staffed (no TL)`;
    const editGoalHtml = isAdminView
      ? `<input type="number" min="1" class="store-goal-input" value="${goal}"
           onchange="window.users.updateStoreStaffGoal('${storeNumber}', this.value)"
           onclick="event.stopPropagation();" />`
      : "";
    const caret = isOpen ? "▾" : "▸";

    return `
      <div class="user-store-summary ${cls} ${isOpen?"open":""}" data-store="${storeNumber}"
           onclick="window.users.toggleStoreOpen('${storeNumber}')"
           title="${tooltip}">
        <span class="uss-caret">${caret}</span>
        <span class="uss-name">${storeNumber}</span>
        <span class="uss-count">${count}/${goal}</span>
        <span class="uss-icon">${icon}</span>
        ${editGoalHtml}
      </div>
    `;
  }

  /* ------------------------------------------------------------------
   * Render full user card (existing markup mostly preserved)
   * ------------------------------------------------------------------ */
  function userCardHtml(uid, u, users, currentRole, currentUid) {
    const lead = users[u.assignedLead] || {};
    const dm   = users[u.assignedDM]   || {};

    const canEditRole   = (currentRole === ROLES.ADMIN) || (currentRole === ROLES.DM && u.role !== ROLES.ADMIN);
    const canAssignLead = (currentRole === ROLES.ADMIN) || (currentRole === ROLES.DM);
    const canAssignDM   = (currentRole === ROLES.ADMIN);
    const canDeleteUser = (currentRole === ROLES.ADMIN) || (currentRole === ROLES.DM);
    const isEditable    = canEditRole || canAssignLead || canAssignDM || canDeleteUser;

    return `<div class="user-card">
      <div class="user-card-header">
        <div>
          <div class="user-name">${u.name || u.email}</div>
          <div class="user-email">${u.email}</div>
        </div>
        ${roleBadge(u.role)}
      </div>
      <div class="user-card-info">
        <div><b>Store:</b> ${u.store || '-'}</div>
        <div><b>Lead:</b> ${lead.name || lead.email || '-'}</div>
        <div><b>DM:</b> ${dm.name || dm.email || '-'}</div>
      </div>
      ${isEditable ? `<div class="user-card-actions">
        ${canEditRole ? `
        <label>Role:
          <select onchange="window.users.changeUserRole('${uid}', this.value)">
            <option value="${ROLES.ME}" ${u.role === ROLES.ME ? 'selected' : ''}>ME</option>
            <option value="${ROLES.LEAD}" ${u.role === ROLES.LEAD ? 'selected' : ''}>Lead</option>
            <option value="${ROLES.DM}" ${u.role === ROLES.DM ? 'selected' : ''}>DM</option>
            <option value="${ROLES.ADMIN}" ${u.role === ROLES.ADMIN ? 'selected' : ''}>Admin</option>
          </select>
        </label>` : ''}
        ${canAssignLead ? `
        <label>Assign Lead:
          <select onchange="window.users.assignLeadToGuest('${uid}', this.value)">
            <option value="">None</option>
            ${Object.entries(users).filter(([, x]) => x.role === ROLES.LEAD)
              .map(([id, x]) => `<option value="${id}" ${u.assignedLead === id ? 'selected' : ''}>${x.name || x.email}</option>`).join('')}
          </select>
        </label>` : ''}
        ${canAssignDM ? `
        <label>Assign DM:
          <select onchange="window.users.assignDMToLead('${uid}', this.value)">
            <option value="">None</option>
            ${Object.entries(users).filter(([, x]) => x.role === ROLES.DM)
              .map(([id, x]) => `<option value="${id}" ${u.assignedDM === id ? 'selected' : ''}>${x.name || x.email}</option>`).join('')}
          </select>
        </label>` : ''}
        ${canDeleteUser ? `<button class="btn btn-danger-outline" onclick="window.users.deleteUser('${uid}')">Delete</button>` : ''}
      </div>` : ''}
    </div>`;
  }

  /* ------------------------------------------------------------------
   * Render one store block (summary + optional user cards)
   * ------------------------------------------------------------------ */
  function storeBlockHtml(storeNumber, entries, users, currentRole, currentUid) {
    const staffStatus = computeStaffStatus(entries, storeNumber);
    const isOpen = isStoreOpen(storeNumber, staffStatus);
    const summary = storeSummaryHtml(storeNumber, staffStatus, isOpen, currentRole === ROLES.ADMIN);

    if (!isOpen) return summary;

    const cards = entries
      .sort((a,b) => {
        // TL first, then name
        const ar = a[1].role === ROLES.LEAD ? 0 : 1;
        const br = b[1].role === ROLES.LEAD ? 0 : 1;
        if (ar !== br) return ar - br;
        return (a[1].name||"").localeCompare(b[1].name||"", undefined, {sensitivity:"base"});
      })
      .map(([uid,u]) => userCardHtml(uid,u,users,currentRole,currentUid))
      .join("");

    return `
      ${summary}
      <div class="user-store-detail" data-store="${storeNumber}">
        ${cards}
      </div>
    `;
  }

  /* ------------------------------------------------------------------
   * Render "Unassigned" block (if any users missing store)
   * ------------------------------------------------------------------ */
  function unassignedBlockHtml(entries, users, currentRole, currentUid) {
    if (!entries.length) return "";
    const storeNumber = "(Unassigned)";
    const staffStatus = {count:entries.length,goal:0,icon:"⚠",cls:"staff-under",status:"under",hasLead:false};
    const isOpen = isStoreOpen(storeNumber, staffStatus);
    const summary = storeSummaryHtml(storeNumber, staffStatus, isOpen, currentRole === ROLES.ADMIN);
    if (!isOpen) return summary;
    const cards = entries.map(([uid,u]) => userCardHtml(uid,u,users,currentRole,currentUid)).join("");
    return `
      ${summary}
      <div class="user-store-detail" data-store="${storeNumber}">
        ${cards}
      </div>
    `;
  }

  /* ------------------------------------------------------------------
   * Main section renderer (called by dashboard)
   * ------------------------------------------------------------------ */
  function renderUsersSection(users, currentRole, currentUid) {
    const visibleUsers = filterVisibleUsers(users, currentUid, currentRole);
    const { stores, unassigned } = groupUsersByStore(visibleUsers);

    const blocks = Object.entries(stores)
      .sort((a,b)=>a[0].localeCompare(b[0],undefined,{numeric:true,sensitivity:'base'}))
      .map(([storeNumber, entries]) =>
        storeBlockHtml(storeNumber, entries, users, currentRole, currentUid)
      )
      .join("");

    const unassignedHtml = unassignedBlockHtml(unassigned, users, currentRole, currentUid);

    return `
      <section class="admin-section users-section">
        <h2>Users</h2>
        <div class="users-stores-wrapper">
          ${blocks || `<p class="text-center">No users found.</p>`}
          ${unassignedHtml}
        </div>
      </section>
    `;
  }

  /* ------------------------------------------------------------------
   * DATA MUTATIONS
   * ------------------------------------------------------------------ */
  async function changeUserRole(uid, role) {
    assertEdit();
    await window.db.ref(`users/${uid}/role`).set(role);
    await window.renderAdminApp();
  }

  async function assignLeadToGuest(guestUid, leadUid) {
    assertEdit();
    await window.db.ref(`users/${guestUid}/assignedLead`).set(leadUid || null);
    await window.renderAdminApp();
  }

  async function assignDMToLead(leadUid, dmUid) {
    assertEdit();
    await window.db.ref(`users/${leadUid}/assignedDM`).set(dmUid || null);
    await window.renderAdminApp();
  }

  async function deleteUser(uid) {
    if (!canDelete(window.currentRole)) throw "PERM_DENIED_DELETE";
    if (confirm("Delete this user?")) {
      await window.db.ref(`users/${uid}`).remove();
      await window.renderAdminApp();
    }
  }

  /* ------------------------------------------------------------------
   * Store goal update (Admin only)
   * ------------------------------------------------------------------ */
  async function updateStoreStaffGoal(storeNumber, rawVal) {
    if (window.currentRole !== ROLES.ADMIN) return;
    let goal = parseInt(rawVal, 10);
    if (isNaN(goal) || goal < 1) goal = 1;
    await window.db.ref(`staffGoals/${storeNumber}`).set({ goal });
    // refresh staffGoals cache
    try {
      const snap = await window.db.ref("staffGoals").get();
      window._staffGoals = snap.val() || {};
    } catch(_) {}
    window.renderAdminApp();
  }

  /* ------------------------------------------------------------------
   * Public API
   * ------------------------------------------------------------------ */
  window.users = {
    renderUsersSection,
    changeUserRole,
    assignLeadToGuest,
    assignDMToLead,
    deleteUser,
    updateStoreStaffGoal,
    toggleStoreOpen
  };
})();