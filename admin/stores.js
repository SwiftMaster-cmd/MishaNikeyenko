(() => {
  const ROLES = { ME: "me", LEAD: "lead", DM: "dm", ADMIN: "admin" };

  function canEdit(role) {
    return role !== ROLES.ME;
  }
  function canDelete(role) {
    return role === ROLES.DM || role === ROLES.ADMIN;
  }
  function assertEdit() {
    if (!window.currentRole || window.currentRole === ROLES.ME) throw "PERM_DENIED_EDIT";
  }
  function assertDelete() {
    if (!canDelete(window.currentRole)) throw "PERM_DENIED_DELETE";
  }
  const roleBadge = r => `<span class="role-badge role-${r}">${r.toUpperCase()}</span>`;

  function renderStoresSection(stores, users, currentRole) {
    const storeRows = Object.entries(stores).map(([id,s])=>{
      const tl = users[s.teamLeadUid] || {};
      return `<tr>
        <td>${canEdit(currentRole)
          ? `<input type="text" value="${s.storeNumber||''}" onchange="window.stores.updateStoreNumber('${id}',this.value)">`
          : s.storeNumber||'-'}</td>
        <td>
          ${canEdit(currentRole) ? `<select onchange="window.stores.assignTL('${id}',this.value)">
            <option value="">-- Unassigned --</option>
            ${Object.entries(users)
                .filter(([,u])=>[ROLES.LEAD,ROLES.DM].includes(u.role))
                .map(([uid,u])=>`<option value="${uid}" ${s.teamLeadUid===uid?'selected':''}>${u.name||u.email}</option>`).join('')}
          </select>` : (tl.name||tl.email||'-')}
          ${tl.role ? roleBadge(tl.role) : ''}
        </td>
        <td>${canDelete(currentRole)?`<button class="btn btn-danger" onclick="window.stores.deleteStore('${id}')">Delete</button>`:''}</td>
      </tr>`;
    }).join('');

    return `
      <section class="admin-section stores-section">
        <h2>Stores</h2>
        <table class="store-table">
          <thead><tr><th>#</th><th>Team Lead</th><th>Actions</th></tr></thead>
          <tbody>${storeRows}</tbody>
        </table>
        ${canEdit(currentRole)?`
          <div class="store-add">
            <input id="newStoreNum" placeholder="New Store #">
            <button onclick="window.stores.addStore()">Add Store</button>
          </div>`:''}
      </section>
    `;
  }

  async function assignTL(storeId, uid) {
    assertEdit();
    const stores = (await window.db.ref("stores").get()).val()||{};
    for(const sId in stores) if(stores[sId].teamLeadUid===uid && sId!==storeId)
      await window.db.ref(`stores/${sId}/teamLeadUid`).set("");
    await window.db.ref(`stores/${storeId}/teamLeadUid`).set(uid);
    if(uid){
      const num = (await window.db.ref(`stores/${storeId}/storeNumber`).get()).val();
      await window.db.ref(`users/${uid}`).update({store: num, role: ROLES.LEAD});
    }
    window.renderAdminApp();
  }

  async function updateStoreNumber(id,val) {
    assertEdit();
    await window.db.ref(`stores/${id}/storeNumber`).set(val);
    window.renderAdminApp();
  }

  async function addStore() {
    assertEdit();
    const num = document.getElementById("newStoreNum").value.trim();
    if(!num) return alert("Enter store #");
    await window.db.ref("stores").push({storeNumber: num, teamLeadUid: ""});
    window.renderAdminApp();
  }

  async function deleteStore(id) {
    assertDelete();
    if(confirm("Delete this store?")) {
      await window.db.ref(`stores/${id}`).remove();
      window.renderAdminApp();
    }
  }

  window.stores = {
    renderStoresSection,
    assignTL,
    updateStoreNumber,
    addStore,
    deleteStore
  };
})();