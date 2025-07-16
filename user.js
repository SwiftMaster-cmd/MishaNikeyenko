// admin-user.js

async function renderUsers(users) {
  return Object.entries(users).map(([uid, user]) => {
    const leadUser = users[user.assignedLead];
    const dmUser = users[user.assignedDM];
    return `
      <div class="user-card">
        <div class="user-header">
          <div class="user-name">${user.name || user.email}</div>
          <div class="role-badge role-${user.role}">${user.role.toUpperCase()}</div>
          <button class="btn btn-danger btn-sm" onclick="deleteUser('${uid}')">Delete</button>
        </div>
        <div class="user-info">
          <div><b>Email:</b> ${user.email}</div>
          <div><b>Store:</b> ${user.store || '-'}</div>
          <div><b>Lead:</b> ${leadUser ? leadUser.name || leadUser.email : '-'}</div>
          <div><b>DM:</b> ${dmUser ? dmUser.name || dmUser.email : '-'}</div>
        </div>
        <div class="user-actions">
          <label>Role:
            <select onchange="changeUserRole('${uid}', this.value)">
              <option value="guest" ${user.role === 'guest' ? 'selected' : ''}>Guest</option>
              <option value="lead" ${user.role === 'lead' ? 'selected' : ''}>Lead</option>
              <option value="dm" ${user.role === 'dm' ? 'selected' : ''}>DM</option>
            </select>
          </label>
          <label>Assign Lead:
            <select onchange="assignLeadToGuest('${uid}', this.value)">
              <option value="">None</option>
              ${Object.entries(users).filter(([id, u]) => u.role === 'lead').map(([id, u]) =>
                `<option value="${id}" ${user.assignedLead === id ? 'selected' : ''}>${u.name || u.email}</option>`
              ).join('')}
            </select>
          </label>
          <label>Assign DM:
            <select onchange="assignDMToLead('${uid}', this.value)">
              <option value="">None</option>
              ${Object.entries(users).filter(([id, u]) => u.role === 'dm').map(([id, u]) =>
                `<option value="${id}" ${user.assignedDM === id ? 'selected' : ''}>${u.name || u.email}</option>`
              ).join('')}
            </select>
          </label>
        </div>
      </div>
    `;
  }).join('') || `<p class="text-center">No users found.</p>`;
}

window.changeUserRole = async function(uid, role) {
  await db.ref('users/' + uid + '/role').set(role);
  renderAdminApp();
};

window.deleteUser = async function(uid) {
  if (!confirm("Delete this user?")) return;
  await db.ref('users/' + uid).remove();
  renderAdminApp();
};

window.assignLeadToGuest = async function(guestUid, leadUid) {
  await db.ref('users/' + guestUid + '/assignedLead').set(leadUid || null);
  renderAdminApp();
};

window.assignDMToLead = async function(leadUid, dmUid) {
  await db.ref('users/' + leadUid + '/assignedDM').set(dmUid || null);
  renderAdminApp();
};

window.editUserStore = async function(uid) {
  const storeNum = prompt("Enter store number for this user:");
  if (!storeNum) return;
  const storesSnap = await db.ref('stores').get();
  const stores = storesSnap.val() || {};
  let matchedStoreId = null;
  for (const sId in stores) {
    if (stores[sId].storeNumber == storeNum) matchedStoreId = sId;
  }
  if (matchedStoreId) {
    await db.ref('stores/' + matchedStoreId + '/teamLeadUid').set(uid);
    await db.ref('users/' + uid + '/store').set(storeNum);
    await db.ref('users/' + uid + '/role').set('lead');
  } else {
    if (confirm("Store not found. Create it?")) {
      await db.ref('stores').push({ storeNumber: storeNum, teamLeadUid: uid });
      await db.ref('users/' + uid + '/store').set(storeNum);
      await db.ref('users/' + uid + '/role').set('lead');
    }
  }
  renderAdminApp();
};