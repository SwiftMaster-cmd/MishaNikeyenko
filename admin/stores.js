(() => {
  const ROLES = { ME: "me", LEAD: "lead", DM: "dm", ADMIN: "admin" };

  /* ------------------------------------------------------------------
     Permission helpers
     ------------------------------------------------------------------ */
  function canEditStoreNumber(role) {
    return role === ROLES.ADMIN;
  }
  function canAssignTL(role) {
    return role === ROLES.ADMIN || role === ROLES.DM;
  }
  function canDelete(role) {
    return role === ROLES.ADMIN || role === ROLES.DM;
  }
  function assertEdit() {
    if (!window.currentRole || window.currentRole !== ROLES.ADMIN) throw "PERM_DENIED_EDIT";
  }
  function assertAssign() {
    if (
      !window.currentRole ||
      !(window.currentRole === ROLES.ADMIN || window.currentRole === ROLES.DM)
    ) {
      throw "PERM_DENIED_ASSIGN";
    }
  }
  function assertDelete() {
    if (!canDelete(window.currentRole)) throw "PERM_DENIED_DELETE";
  }

  const roleBadge = (r) => `<span class="role-badge role-${r}">${r.toUpperCase()}</span>`;

  /* ------------------------------------------------------------------
     Sales summarizer
     salesObj: { saleId: {storeNumber, units, amount?, ...}, ... }
     Returns { [storeNumber]: {count, units, amount} }
     ------------------------------------------------------------------ */
  function summarizeSalesByStore(salesObj) {
    const out = {};
    if (!salesObj) return out;
    for (const [, s] of Object.entries(salesObj)) {
      const sn = (s.storeNumber || "").toString().trim();
      if (!sn) continue;
      if (!out[sn]) out[sn] = { count: 0, units: 0, amount: 0 };
      out[sn].count += 1;
      out[sn].units += Number(s.units || 0);
      out[sn].amount += Number(s.amount || 0); // kept for possible reporting even if UI hides $
    }
    return out;
  }

  /* ------------------------------------------------------------------
     Get ME users tied to a store
     - Primary: user.store === storeNumber (string compare)
     - Backup:  if teamLeadUid exists, include MEs whose assignedLead === teamLeadUid
     Deduped; returns array of user objects
     ------------------------------------------------------------------ */
  function getMesForStore(users, storeNumber, teamLeadUid) {
    const match = new Set();
    const mes = [];

    const sn = (storeNumber || "").toString().trim();

    for (const [uid, u] of Object.entries(users)) {
      if (u.role !== ROLES.ME) continue;

      // store match
      if (sn && u.store && u.store.toString().trim() === sn) {
        if (!match.has(uid)) {
          match.add(uid);
          mes.push({ uid, ...u });
          continue;
        }
      }

      // lead relationship fallback
      if (teamLeadUid && u.assignedLead === teamLeadUid) {
        if (!match.has(uid)) {
          match.add(uid);
          mes.push({ uid, ...u });
        }
      }
    }
    return mes;
  }

  function fmtMesCell(mesArr) {
    if (!mesArr || !mesArr.length) return "-";
    // Shorten: show up to 3 names, then +N
    const names = mesArr.map((u) => u.name || u.email || u.uid);
    const shown = names.slice(0, 3).join(", ");
    const extra = names.length > 3 ? ` +${names.length - 3}` : "";
    return `${shown}${extra}`;
  }

  /* ------------------------------------------------------------------
     Format sales cell: count / units
     ------------------------------------------------------------------ */
  function fmtSalesCell(summ) {
    if (!summ) return "-";
    const { count, units } = summ;
    return `${count} / ${units}u`;
  }

  /* ------------------------------------------------------------------
     Render Stores
     ------------------------------------------------------------------ */
  function renderStoresSection(stores, users, currentRole, salesObj) {
    // allow optional param; fall back to cached global
    const _salesObj = salesObj || window._sales || {};
    const salesSummary = summarizeSalesByStore(_salesObj);

    const storeRows = Object.entries(stores).map(([id, s]) => {
      const tl = users[s.teamLeadUid] || {};
      const storeNumber = s.storeNumber || "";
      const summ = salesSummary[storeNumber];
      const mesArr = getMesForStore(users, storeNumber, s.teamLeadUid);
      const mesCell = fmtMesCell(mesArr);

      return `<tr>
        <td>${canEditStoreNumber(currentRole)
          ? `<input type="text" value="${storeNumber}" onchange="window.stores.updateStoreNumber('${id}',this.value)">`
          : storeNumber || '-'}</td>
        <td>
          ${canAssignTL(currentRole) ? `<select onchange="window.stores.assignTL('${id}',this.value)">
            <option value="">-- Unassigned --</option>
            ${Object.entries(users)
              .filter(([, u]) => [ROLES.LEAD, ROLES.DM].includes(u.role))
              .map(
                ([uid, u]) =>
                  `<option value="${uid}" ${s.teamLeadUid === uid ? 'selected' : ''}>${u.name || u.email}</option>`
              )
              .join("")}
          </select>` : (tl.name || tl.email || '-')}
          ${tl.role ? roleBadge(tl.role) : ''}
        </td>
        <td>${mesCell}</td>
        <td>${fmtSalesCell(summ)}</td>
        <td>${canDelete(currentRole)
          ? `<button class="btn btn-danger" onclick="window.stores.deleteStore('${id}')">Delete</button>`
          : ''}</td>
      </tr>`;
    }).join("");

    return `
      <section class="admin-section stores-section">
        <h2>Stores</h2>
        <table class="store-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Team Lead</th>
              <th>Associates (MEs)</th>
              <th>Sales<br><small>Cnt / Units</small></th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>${storeRows}</tbody>
        </table>
        ${currentRole === ROLES.ADMIN ? `
          <div class="store-add">
            <input id="newStoreNum" placeholder="New Store #">
            <button onclick="window.stores.addStore()">Add Store</button>
          </div>` : ''}
      </section>
    `;
  }

  /* ------------------------------------------------------------------
     Actions
     ------------------------------------------------------------------ */
  async function assignTL(storeId, uid) {
    assertAssign();
    const stores = (await window.db.ref("stores").get()).val() || {};
    for (const sId in stores) {
      if (stores[sId].teamLeadUid === uid && sId !== storeId) {
        await window.db.ref(`stores/${sId}/teamLeadUid`).set("");
      }
    }
    await window.db.ref(`stores/${storeId}/teamLeadUid`).set(uid);
    if (uid) {
      const num = (await window.db.ref(`stores/${storeId}/storeNumber`).get()).val();
      await window.db.ref(`users/${uid}`).update({ store: num, role: ROLES.LEAD });
    }
    window.renderAdminApp();
  }

  async function updateStoreNumber(id, val) {
    assertEdit();
    await window.db.ref(`stores/${id}/storeNumber`).set(val);
    window.renderAdminApp();
  }

  async function addStore() {
    assertEdit();
    const num = document.getElementById("newStoreNum").value.trim();
    if (!num) return alert("Enter store #");
    await window.db.ref("stores").push({ storeNumber: num, teamLeadUid: "" });
    window.renderAdminApp();
  }

  async function deleteStore(id) {
    assertDelete();
    if (confirm("Delete this store?")) {
      await window.db.ref(`stores/${id}`).remove();
      window.renderAdminApp();
    }
  }

  // expose
  window.stores = {
    renderStoresSection,
    assignTL,
    updateStoreNumber,
    addStore,
    deleteStore,
    summarizeSalesByStore,
    getMesForStore // export in case you want usage elsewhere
  };
})();