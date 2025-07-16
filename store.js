// admin-store.js

async function renderStores(stores, users) {
  return Object.entries(stores).map(([id, store]) => {
    const tlUser = users[store.teamLeadUid];
    return `
      <tr>
        <td><input type="text" value="${store.storeNumber || ''}" onchange="updateStoreNumber('${id}', this.value)" /></td>
        <td>
          <select onchange="assignTL('${id}', this.value)">
            <option value="">-- Unassigned --</option>
            ${Object.entries(users).filter(([uid, u]) => u.role === 'lead' || u.role === 'dm').map(([uid, u]) =>
              `<option value="${uid}" ${store.teamLeadUid === uid ? 'selected' : ''}>${u.name || u.email}</option>`
            ).join('')}
          </select>
          ${tlUser ? `<span class="role-badge role-${tlUser.role}">${tlUser.name || tlUser.email}</span>` : ''}
        </td>
        <td><button class="btn btn-danger" onclick="deleteStore('${id}')">Delete</button></td>
      </tr>
    `;
  }).join('') || `<tr><td colspan="3" class="text-center">No stores added.</td></tr>`;
}

window.assignTL = async function(storeId, uid) {
  const storesSnap = await db.ref('stores').get();
  const stores = storesSnap.val() || {};
  for (const sId in stores) {
    if (stores[sId].teamLeadUid === uid && sId !== storeId) {
      await db.ref('stores/' + sId + '/teamLeadUid').set('');
    }
  }
  await db.ref('stores/' + storeId + '/teamLeadUid').set(uid);
  if (uid) {
    const storeNum = (await db.ref('stores/' + storeId + '/storeNumber').get()).val();
    await db.ref('users/' + uid + '/store').set(storeNum);
    await db.ref('users/' + uid + '/role').set('lead');
  }
  renderAdminApp();
};

window.updateStoreNumber = async function(storeId, val) {
  await db.ref('stores/' + storeId + '/storeNumber').set(val);
  renderAdminApp();
};

window.deleteStore = async function(storeId) {
  if (!confirm("Delete this store?")) return;
  await db.ref('stores/' + storeId).remove();
  renderAdminApp();
};

window.addStore = async function() {
  const num = document.getElementById('newStoreNum').value.trim();
  if (!num) return alert("Enter store #");
  await db.ref('stores').push({ storeNumber: num, teamLeadUid: "" });
  renderAdminApp();
};