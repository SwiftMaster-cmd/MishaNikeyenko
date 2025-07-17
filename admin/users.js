(() => {
  const ROLES = window.ROLES || { ME: "me", LEAD: "lead", DM: "dm", ADMIN: "admin" };

  const roleBadge = r => `<span class="role-badge role-${r}">${r.toUpperCase()}</span>`;

  function assertEdit() {
    if (!window.canEdit || !window.canEdit(window.currentRole)) throw "PERM_DENIED_EDIT";
  }

  function canEdit(role) {
    if (!window.canEdit) return false;
    return window.canEdit(role);
  }

  function canDelete(role) {
    if (!window.canDelete) return false;
    return window.canDelete(role);
  }

  // Filter users based on currentRole & visibility rules
  function filterVisibleUsers(users, currentUid, currentRole) {
    return Object.entries(users).filter(([uid,u]) => {
      if (currentRole === ROLES.ADMIN) {
        // Admin sees all
        return true;
      }
      if (currentRole === ROLES.DM) {
        // DM sees all except Admins
        return u.role !== ROLES.ADMIN;
      }
      if (currentRole === ROLES.LEAD) {
        // Lead sees only ME assigned to them and their own DM
        if (u.role === ROLES.ME && u.assignedLead === currentUid) return true;
        if (u.role === ROLES.DM && u.assignedDM === currentUid) return true;
        // Lead can see self too for sanity
        if (uid === currentUid) return true;
        return false;
      }
      if (currentRole === ROLES.ME) {
        // ME sees only self, their Lead, and their DM
        if (uid === currentUid) return true;
        if (uid === users[currentUid]?.assignedLead) return true;
        if (uid === users[currentUid]?.assignedDM) return true;
        return false;
      }
      // fallback deny
      return false;
    });
  }

  function renderUsersSection(users, currentUid, currentRole) {
    // Filter visible users first
    const visibleUsers = filterVisibleUsers(users, currentUid, currentRole);

    return `
      <section class="admin-section users-section">
        <h2>Users</h2>
        <div class="users-container">
          ${visibleUsers.map(([uid,u])=>{
            const lead = users[u.assignedLead] || {};
            const dm   = users[u.assignedDM]   || {};

            // Permissions per currentRole
            const canEditRole = (currentRole === ROLES.ADMIN) || (currentRole === ROLES.DM && u.role !== ROLES.ADMIN);
            const canAssignLead = (currentRole === ROLES.ADMIN) || (currentRole === ROLES.DM);
            const canAssignDM = (currentRole === ROLES.ADMIN);
            const canDeleteUser = (currentRole === ROLES.ADMIN) || (currentRole === ROLES.DM);

            // ME and Lead cannot edit or assign or delete
            const isEditable = canEditRole || canAssignLead || canAssignDM || canDeleteUser;

            return `<div class="user-card">
              <div class="user-card-header">
                <div><div class="user-name">${u.name||u.email}</div><div class="user-email">${u.email}</div></div>
                ${roleBadge(u.role)}
              </div>
              <div class="user-card-info">
                <div><b>Store:</b> ${u.store||'-'}</div>
                <div><b>Lead:</b> ${lead.name||lead.email||'-'}</div>
                <div><b>DM:</b>   ${dm.name||dm.email||'-'}</div>
              </div>
              ${isEditable ? `<div class="user-card-actions">
                ${canEditRole ? `
                <label>Role:
                  <select onchange="window.users.changeUserRole('${uid}',this.value)">
                    <option value="${ROLES.ME}"   ${u.role===ROLES.ME?'selected':''}>ME</option>
                    <option value="${ROLES.LEAD}" ${u.role===ROLES.LEAD?'selected':''}>Lead</option>
                    <option value="${ROLES.DM}"   ${u.role===ROLES.DM?'selected':''}>DM</option>
                    <option value="${ROLES.ADMIN}"${u.role===ROLES.ADMIN?'selected':''}>Admin</option>
                  </select>
                </label>` : ''}
                ${canAssignLead ? `
                <label>Assign Lead:
                  <select onchange="window.users.assignLeadToGuest('${uid}',this.value)">
                    <option value="">None</option>
                    ${Object.entries(users).filter(([,x])=>x.role===ROLES.LEAD)
                      .map(([id,x])=>`<option value="${id}" ${u.assignedLead===id?'selected':''}>${x.name||x.email}</option>`).join('')}
                  </select>
                </label>` : ''}
                ${canAssignDM ? `
                <label>Assign DM:
                  <select onchange="window.users.assignDMToLead('${uid}',this.value)">
                    <option value="">None</option>
                    ${Object.entries(users).filter(([,x])=>x.role===ROLES.DM)
                      .map(([id,x])=>`<option value="${id}" ${u.assignedDM===id?'selected':''}>${x.name||x.email}</option>`).join('')}
                  </select>
                </label>` : ''}
                ${canDeleteUser ? `<button class="btn btn-danger-outline" onclick="window.users.deleteUser('${uid}')">Delete</button>` : ''}
              </div>` : ''}
            </div>`;
          }).join('')}
        </div>
      </section>
    `;
  }

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
    if (!window.canDelete || !window.canDelete(window.currentRole)) throw "PERM_DENIED_DELETE";
    if (confirm("Delete this user?")) {
      await window.db.ref(`users/${uid}`).remove();
      await window.renderAdminApp();
    }
  }

  window.users = {
    renderUsersSection,
    changeUserRole,
    assignLeadToGuest,
    assignDMToLead,
    deleteUser
  };
})();