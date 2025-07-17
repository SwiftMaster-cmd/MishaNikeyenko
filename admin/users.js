(() => {
  const ROLES = window.ROLES || { ME: "me", LEAD: "lead", DM: "dm", ADMIN: "admin" };

  const roleBadge = r => `<span class="role-badge role-${r}">${r.toUpperCase()}</span>`;

  // Use dynamic permission checks from admin.js
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

  function renderUsersSection(users, currentRole) {
    return `
      <section class="admin-section users-section">
        <h2>Users</h2>
        <div class="users-container">
          ${Object.entries(users).map(([uid,u])=>{
            const lead = users[u.assignedLead] || {};
            const dm   = users[u.assignedDM]   || {};
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
              ${canEdit(currentRole)?`<div class="user-card-actions">
                <label>Role:
                  <select onchange="window.users.changeUserRole('${uid}',this.value)">
                    <option value="${ROLES.ME}"   ${u.role===ROLES.ME?'selected':''}>ME</option>
                    <option value="${ROLES.LEAD}" ${u.role===ROLES.LEAD?'selected':''}>Lead</option>
                    <option value="${ROLES.DM}"   ${u.role===ROLES.DM?'selected':''}>DM</option>
                    <option value="${ROLES.ADMIN}"${u.role===ROLES.ADMIN?'selected':''}>Admin</option>
                  </select>
                </label>
                <label>Assign Lead:
                  <select onchange="window.users.assignLeadToGuest('${uid}',this.value)">
                    <option value="">None</option>
                    ${Object.entries(users).filter(([,x])=>x.role===ROLES.LEAD)
                       .map(([id,x])=>`<option value="${id}" ${u.assignedLead===id?'selected':''}>${x.name||x.email}</option>`).join('')}
                  </select>
                </label>
                <label>Assign DM:
                  <select onchange="window.users.assignDMToLead('${uid}',this.value)">
                    <option value="">None</option>
                    ${Object.entries(users).filter(([,x])=>x.role===ROLES.DM)
                       .map(([id,x])=>`<option value="${id}" ${u.assignedDM===id?'selected':''}>${x.name||x.email}</option>`).join('')}
                  </select>
                </label>
                ${canDelete(currentRole)?`<button class="btn btn-danger-outline" onclick="window.users.deleteUser('${uid}')">Delete</button>`:''}
              </div>`:''}
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