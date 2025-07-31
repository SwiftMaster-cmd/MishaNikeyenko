/* =======================================================================
 * users.js  (Dashboard Users / Staffing module)
 * -----------------------------------------------------------------------
 * Features
 *  - Groups users by store.
 *  - Collapsed store summary row shows staffing level + role mix pills.
 *  - Admin can set per-store staffing goal (# bodies counted: LEAD + ME).
 *  - Color codes: full / under / empty; shows ✓ / ⚠ / ✖.
 *  - Expand to reveal detailed user cards + action controls.
 *  - Visibility filtered by viewer role hierarchy.
 *  - Includes "Unassigned" bucket.
 * -----------------------------------------------------------------------
 * Globals expected:
 *    window.db              Firebase db instance
 *    window.currentUid
 *    window.currentRole
 *    window._stores         (optional) stores obj keyed by id or number
 * -----------------------------------------------------------------------
 * CSS hooks required (see dashboard theme patch):
 *    .user-store-summary, .staff-full, .staff-under, .staff-empty,
 *    .uss-role-pill.lead, .uss-role-pill.me, etc.
 * =======================================================================
 */
(() => {

  const ROLES = window.ROLES || { ME:"me", LEAD:"lead", DM:"dm", ADMIN:"admin" };

  /* --------------------------------------------------------------------
   * Local UI expansion state
   * ------------------------------------------------------------------ */
  if (!window._userStoresOpen) window._userStoresOpen = {}; // storeNumber -> bool

  /* --------------------------------------------------------------------
   * Lightweight role helpers
   * ------------------------------------------------------------------ */
  const isAdmin = r => r === ROLES.ADMIN;
  const isDM    = r => r === ROLES.DM;
  const isLead  = r => r === ROLES.LEAD;
  const isMe    = r => r === ROLES.ME;

  /* --------------------------------------------------------------------
   * Permission wrappers
   * (Dashboard roots define window.canEdit / window.canDelete; fallbacks)
   * ------------------------------------------------------------------ */
  function canEdit(role){
    if (typeof window.canEdit === "function") return window.canEdit(role);
    return role !== ROLES.ME; // fallback: everyone but ME
  }
  function canDelete(role){
    if (typeof window.canDelete === "function") return window.canDelete(role);
    return isAdmin(role) || isDM(role); // fallback
  }
  function assertEdit(){
    if (!canEdit(window.currentRole)) throw "PERM_DENIED_EDIT";
  }
  function assertDelete(){
    if (!canDelete(window.currentRole)) throw "PERM_DENIED_DELETE";
  }

  /* --------------------------------------------------------------------
   * VISIBILITY: which users render for viewer?
   * ------------------------------------------------------------------ */
  function filterVisibleUsers(users, currentUid, currentRole) {
    if (!users || !currentUid || !currentRole) return [];

    const currentUser = users[currentUid] || {};

    return Object.entries(users).filter(([uid, u]) => {
      if (isAdmin(currentRole)) return true;

      if (isDM(currentRole)) {
        // DM sees everyone except Admin accounts
        return u.role !== ROLES.ADMIN;
      }

      if (isLead(currentRole)) {
        // Lead sees: self, their DM, and all MEs assigned to them
        if (uid === currentUid) return true;
        if (u.role === ROLES.ME && u.assignedLead === currentUid) return true;
        if (u.role === ROLES.DM && currentUser.assignedDM === uid) return true;
        return false;
      }

      if (isMe(currentRole)) {
        // ME sees: self, own Lead, own DM
        if (uid === currentUid) return true;
        if (uid === currentUser.assignedLead) return true;
        if (uid === currentUser.assignedDM) return true;
        return false;
      }

      return false;
    });
  }

  /* --------------------------------------------------------------------
   * Store goal lookup
   *   Priority: stores/<key>.staffGoal -> stores/<key>.goal -> fallback 2
   *   We try to match storeNumber against _stores keys or storeNumber/number props.
   * ------------------------------------------------------------------ */
  function getStoreGoal(storeNumber){
    const stores = window._stores || {};
    let goal = null;
    for (const [k,s] of Object.entries(stores)){
      const sn = s.storeNumber ?? s.number ?? k;
      if (sn == storeNumber){ // loose compare
        goal = parseInt(s.staffGoal ?? s.goal ?? s.staff_goal ?? s.target ?? 2, 10);
        break;
      }
    }
    if (goal == null || isNaN(goal) || goal <= 0) goal = 2; // default
    return goal;
  }

  /* --------------------------------------------------------------------
   * Persist store staffing goal (Admin only)
   *   We attempt to find a matching store record; if not found,
   *   we fall back to /storeStaffGoals/<storeNumber>.
   * ------------------------------------------------------------------ */
  async function updateStoreStaffGoal(storeNumber, val){
    if (!isAdmin(window.currentRole)) return;
    let num = parseInt(val,10);
    if (isNaN(num) || num <= 0) num = 1;

    const stores = window._stores || {};
    let storeKey = null;
    for (const [k,s] of Object.entries(stores)){
      const sn = s.storeNumber ?? s.number ?? k;
      if (sn == storeNumber){ storeKey = k; break; }
    }

    try {
      if (storeKey){
        await window.db.ref(`stores/${storeKey}/staffGoal`).set(num);
      } else {
        await window.db.ref(`storeStaffGoals/${storeNumber}`).set(num);
      }
      await window.renderAdminApp();
    } catch (e){
      alert("Error updating store goal: " + e.message);
    }
  }

  /* --------------------------------------------------------------------
   * Compute staffing status for a store
   *   Count LEAD + ME only (bodies on floor); require at least 1 LEAD
   * ------------------------------------------------------------------ */
  function computeStaffStatus(entries, storeNumber) {
    let leadCount = 0;
    let meCount   = 0;

    for (const [, u] of entries) {
      if (u.role === ROLES.LEAD) leadCount++;
      else if (u.role === ROLES.ME) meCount++;
    }

    const count   = leadCount + meCount;
    const hasLead = leadCount > 0;
    const goal    = getStoreGoal(storeNumber);

    let status, icon, cls;
    if (count === 0) {
      status = "empty"; icon = "✖"; cls = "staff-empty";
    } else if (count >= goal && hasLead) {
      status = "full"; icon = "✓"; cls = "staff-full";
    } else {
      status = "under"; icon = "⚠"; cls = "staff-under";
    }

    // compact role mix pills (Lead & ME only)
    const pills = [];
    if (leadCount) pills.push(`<span class="uss-role-pill lead">L${leadCount>1?leadCount:""}</span>`);
    if (meCount)   pills.push(`<span class="uss-role-pill me">M${meCount>1?meCount:""}</span>`);
    const roleMixHtml = pills.join("");

    return { count, goal, hasLead, status, icon, cls, leadCount, meCount, roleMixHtml };
  }

  /* --------------------------------------------------------------------
   * Collapsed store summary row
   * ------------------------------------------------------------------ */
  function storeSummaryHtml(storeNumber, staffStatus, isOpen, isAdminView) {
    const { count, goal, icon, cls, roleMixHtml, hasLead } = staffStatus;
    const tooltip = hasLead
      ? `${count}/${goal} staffed`
      : `${count}/${goal} staffed (no TL)`;
    const caret = isOpen ? "▾" : "▸";
    const editGoalHtml = isAdminView
      ? `<input type="number" min="1" class="store-goal-input"
           value="${goal}"
           onchange="window.users.updateStoreStaffGoal('${storeNumber}', this.value)"
           onclick="event.stopPropagation();" />`
      : "";

    return `
      <div class="user-store-summary ${cls} ${isOpen?"open":""}" data-store="${storeNumber}"
           onclick="window.users.toggleStoreOpen('${storeNumber}')"
           title="${tooltip}">
        <span class="uss-caret">${caret}</span>
        <span class="uss-name">${storeNumber}</span>
        <span class="uss-role-mix">${roleMixHtml || ""}</span>
        <span class="uss-count">${count}/${goal}</span>
        <span class="uss-icon">${icon}</span>
        ${editGoalHtml}
      </div>
    `;
  }

  /* --------------------------------------------------------------------
   * Full user card (expanded detail)
   * ------------------------------------------------------------------ */
  function userDetailCardHtml(uid, u, users, currentRole) {
    const lead = users[u.assignedLead] || {};
    const dm   = users[u.assignedDM]   || {};
    const editableRole = (isAdmin(currentRole)) || (isDM(currentRole) && u.role !== ROLES.ADMIN);
    const canAssignLead = isAdmin(currentRole) || isDM(currentRole);
    const canAssignDM   = isAdmin(currentRole);
    const canDeleteUser = isAdmin(currentRole) || isDM(currentRole);

    const roleSelect = editableRole ? `
      <label>Role:
        <select onchange="window.users.changeUserRole('${uid}', this.value)">
          <option value="${ROLES.ME}" ${u.role===ROLES.ME?'selected':''}>ME</option>
          <option value="${ROLES.LEAD}" ${u.role===ROLES.LEAD?'selected':''}>Lead</option>
          <option value="${ROLES.DM}" ${u.role===ROLES.DM?'selected':''}>DM</option>
          <option value="${ROLES.ADMIN}" ${u.role===ROLES.ADMIN?'selected':''}>Admin</option>
        </select>
      </label>` : "";

    const leadSelect = canAssignLead ? `
      <label>Assign Lead:
        <select onchange="window.users.assignLeadToGuest('${uid}', this.value)">
          <option value="">None</option>
          ${Object.entries(users)
            .filter(([, x]) => x.role === ROLES.LEAD)
            .map(([id,x])=>`<option value="${id}" ${u.assignedLead===id?'selected':''}>${x.name||x.email}</option>`)
            .join("")}
        </select>
      </label>` : "";

    const dmSelect = canAssignDM ? `
      <label>Assign DM:
        <select onchange="window.users.assignDMToLead('${uid}', this.value)">
          <option value="">None</option>
          ${Object.entries(users)
            .filter(([, x]) => x.role === ROLES.DM)
            .map(([id,x])=>`<option value="${id}" ${u.assignedDM===id?'selected':''}>${x.name||x.email}</option>`)
            .join("")}
        </select>
      </label>` : "";

    const deleteBtn = canDeleteUser
      ? `<button class="btn btn-danger-outline" onclick="window.users.deleteUser('${uid}')">Delete</button>`
      : "";

    return `
      <div class="user-card">
        <div class="user-card-header">
          <div>
            <div class="user-name">${u.name || u.email}</div>
            <div class="user-email">${u.email}</div>
          </div>
          <span class="role-badge role-${u.role}">${u.role.toUpperCase()}</span>
        </div>
        <div class="user-card-info">
          <div><b>Store:</b> ${u.store || '-'}</div>
          <div><b>Lead:</b> ${lead.name || lead.email || '-'}</div>
          <div><b>DM:</b> ${dm.name || dm.email || '-'}</div>
        </div>
        ${(roleSelect || leadSelect || dmSelect || deleteBtn) ? `
        <div class="user-card-actions">
          ${roleSelect}
          ${leadSelect}
          ${dmSelect}
          ${deleteBtn}
        </div>` : ""}
      </div>
    `;
  }

  /* --------------------------------------------------------------------
   * Expanded store block (summary + list of user cards)
   * ------------------------------------------------------------------ */
  function storeBlockHtml(storeNumber, entries, users, currentRole) {
    const isOpen = !!window._userStoresOpen[storeNumber];
    const status = computeStaffStatus(entries, storeNumber);
    const summaryHtml = storeSummaryHtml(storeNumber, status, isOpen, isAdmin(currentRole));

    if (!isOpen) {
      return `
        <div class="user-store-block">${summaryHtml}</div>
      `;
    }

    const cards = entries.map(([uid,u]) => userDetailCardHtml(uid,u,users,currentRole)).join("");
    return `
      <div class="user-store-block user-store-block-open">
        ${summaryHtml}
        <div class="user-store-detail">
          ${cards}
        </div>
      </div>
    `;
  }

  /* --------------------------------------------------------------------
   * Main render
   * ------------------------------------------------------------------ */
  function renderUsersSection(users, currentRole, currentUid) {
    const visibleUsers = filterVisibleUsers(users, currentUid, currentRole);

    // group by store
    const storeMap = new Map(); // storeNumber -> array of [uid,u]
    const UNASSIGNED = "(Unassigned)";
    for (const [uid,u] of visibleUsers){
      const sn = (u.store ?? "").toString().trim() || UNASSIGNED;
      if (!storeMap.has(sn)) storeMap.set(sn, []);
      storeMap.get(sn).push([uid,u]);
    }

    // sort store keys numeric when possible
    const sortedStores = Array.from(storeMap.keys()).sort((a,b)=>{
      const an = parseInt(a,10), bn = parseInt(b,10);
      if (!isNaN(an) && !isNaN(bn)) return an - bn;
      return a.localeCompare(b);
    });

    const blocksHtml = sortedStores.map(sn =>
      storeBlockHtml(sn, storeMap.get(sn), users, currentRole)
    ).join("");

    return `
      <section class="admin-section users-section">
        <h2>Users</h2>
        <div class="users-by-store-container">
          ${blocksHtml}
        </div>
      </section>
    `;
  }

  /* --------------------------------------------------------------------
   * Store open/close toggle
   * ------------------------------------------------------------------ */
  function toggleStoreOpen(storeNumber){
    window._userStoresOpen[storeNumber] = !window._userStoresOpen[storeNumber];
    window.renderAdminApp();
  }

  /* --------------------------------------------------------------------
   * CRUD ops delegated to Firebase
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
    assertDelete();
    if (!confirm("Delete this user?")) return;
    await window.db.ref(`users/${uid}`).remove();
    await window.renderAdminApp();
  }

  /* --------------------------------------------------------------------
   * Expose public API
   * ------------------------------------------------------------------ */
  window.users = {
    renderUsersSection,
    changeUserRole,
    assignLeadToGuest,
    assignDMToLead,
    deleteUser,
    toggleStoreOpen,
    updateStoreStaffGoal
  };

})();