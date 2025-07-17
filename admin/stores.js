/* ========================================================================
   Stores Logic
   ===================================================================== */
async function renderStoresSection(stores, users) {
  const storeRows = Object.entries(stores).map(([id, s]) => {
    const tl = users[s.teamLeadUid] || {};
    return `<tr>
      <td>${canEdit(currentRole)
        ? `<input type="text" value="${s.storeNumber || ''}" onchange="updateStoreNumber('${id}', this.value)">`
        : s.storeNumber || '-'}</td>
      <td>
        ${canEdit(currentRole) ? `<select onchange="assignTL('${id}', this.value)">
          <option value="">-- Unassigned --</option>
          ${Object.entries(users)
            .filter(([, u]) => [ROLES.LEAD, ROLES.DM].includes(u.role))
            .map(([uid, u]) => `<option value="${uid}" ${s.teamLeadUid === uid ? 'selected' : ''}>${u.name || u.email}</option>`).join('')}
        </select>` : (tl.name || tl.email || '-')}
        ${tl.role ? roleBadge(tl.role) : ''}
      </td>
      <td>${canDelete(currentRole) ? `<button class="btn btn-danger" onclick="deleteStore('${id}')">Delete</button>` : ''}</td>
    </tr>`;
  }).join('');

  return `
    <section class="admin-section stores-section">
      <h2>Stores</h2>
      <table class="store-table">
        <thead><tr><th>#</th><th>Team Lead</th><th>Actions</th></tr></thead>
        <tbody>${storeRows}</tbody>
      </table>
      ${canEdit(currentRole) ? `
        <div class="store-add">
          <input id="newStoreNum" placeholder="New Store #">
          <button onclick="addStore()">Add Store</button>
        </div>` : ''}
    </section>`;
}

window.assignTL = async (storeId, uid) => {
  assertEdit();
  const stores = (await db.ref("stores").get()).val() || {};
  for (const sId in stores)
    if (stores[sId].teamLeadUid === uid && sId !== storeId)
      await db.ref(`stores/${sId}/teamLeadUid`).set("");

  await db.ref(`stores/${storeId}/teamLeadUid`).set(uid);
  if (uid) {
    const num = (await db.ref(`stores/${storeId}/storeNumber`).get()).val();
    await db.ref(`users/${uid}`).update({ store: num, role: ROLES.LEAD });
  }
  renderAdminApp();
};

window.updateStoreNumber = async (id, val) => {
  assertEdit();
  await db.ref(`stores/${id}/storeNumber`).set(val);
  renderAdminApp();
};

window.addStore = async () => {
  assertEdit();
  const num = document.getElementById("newStoreNum").value.trim();
  if (!num) return alert("Enter store #");
  await db.ref("stores").push({ storeNumber: num, teamLeadUid: "" });
  renderAdminApp();
};

window.editStorePrompt = async storeId => {
  assertEdit();
  const snap = await db.ref(`stores/${storeId}`).get();
  const old = snap.val()?.storeNumber || "";
  const nn = prompt("Edit store number:", old);
  if (nn && nn !== old) {
    await db.ref(`stores/${storeId}/storeNumber`).set(nn);
    renderAdminApp();
  }
};

window.deleteStore = async id => {
  assertDelete();
  if (confirm("Delete this store?")) {
    await db.ref(`stores/${id}`).remove();
    renderAdminApp();
  }
};