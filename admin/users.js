// users.js
async function renderUsersSection(users) {
  const userCards = Object.entries(users).map(([uid, u]) => {
    const lead = users[u.assignedLead] || {};
    const dm = users[u.assignedDM] || {};

    return `<div class="user-card">
      <div class="user-card-header">
        <div><div class="user-name">${u.name || u.email}</div><div class="user-email">${u.email}</div></div>
        ${roleBadge(u.role)}
      </div>
      <div class="user-card-info">
        <div><b>Store:</b> ${u.store || '-'}</div>
        <div><b>Lead:</b> ${lead.name || lead.email || '-'}</div>
        <div><b>DM:</b> ${dm.name || dm.email || '-'}</div>
      </div>
      ${canEdit(currentRole) ? `<div class="user-card-actions">
        <label>Role:
          <select onchange="changeUserRole('${uid}',this.value)">
            <option value="me" ${u.role === ROLES.ME ? 'selected' : ''}>ME</option>
            <option value="lead" ${u.role === ROLES.LEAD ? 'selected' : ''}>Lead</option>
            <option value="dm" ${u.role === ROLES.DM ? 'selected' : ''}>DM</option>
            <option value="admin" ${u.role === ROLES.ADMIN ? 'selected' : ''}>Admin</option>
          </select>
        </label>
        <label>Assign Lead:
          <select onchange="assignLeadToGuest('${uid}',this.value)">
            <option value="">None</option>
            ${Object.entries(users)
              .filter(([, x]) => x.role === ROLES.LEAD)
              .map(([id, x]) => `<option value="${id}" ${u.assignedLead === id ? 'selected' : ''}>${x.name || x.email}</option>`).join('')}
          </select>
        </label>
        <label>Assign DM:
          <select onchange="assignDMToLead('${uid}',this.value)">
            <option value="">None</option>
            ${Object.entries(users)
              .filter(([, x]) => x.role === ROLES.DM)
              .map(([id, x]) => `<option value="${id}" ${u.assignedDM === id ? 'selected' : ''}>${x.name || x.email}</option>`).join('')}
          </select>
        </label>
        ${canDelete(currentRole) ? `<button class="btn btn-danger-outline" onclick="deleteUser('${uid}')">Delete</button>` : ''}
      </div>` : ''}
    </div>`;
  }).join('');

  return `<section class="admin-section users-section">
    <h2>Users</h2>
    <div class="users-container">${userCards}</div>
  </section>`;
}

// User actions
window.assignLeadToGuest = async (guestUid, leadUid) => {
  assertEdit();
  await db.ref(`users/${guestUid}/assignedLead`).set(leadUid || null);
  renderAdminApp();
};

window.assignDMToLead = async (leadUid, dmUid) => {
  assertEdit();
  await db.ref(`users/${leadUid}/assignedDM`).set(dmUid || null);
  renderAdminApp();
};

window.changeUserRole = async (uid, role) => {
  assertEdit();
  await db.ref(`users/${uid}/role`).set(role);
  renderAdminApp();
};

window.deleteUser = async id => {
  assertDelete();
  if (confirm("Delete this user?")) {
    await db.ref(`users/${id}`).remove();
    renderAdminApp();
  }
};