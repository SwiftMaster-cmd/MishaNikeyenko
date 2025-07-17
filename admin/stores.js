(() => {
  const ROLES = { ME: "me", LEAD: "lead", DM: "dm", ADMIN: "admin" };

  /* ====================================================================
     Permission helpers
     ==================================================================== */
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

  /* ====================================================================
     Normalization helpers
     ==================================================================== */
  const UNASSIGNED_KEY = "__UNASSIGNED__";

  const normStore = (sn) => (sn ?? "").toString().trim();

  /**
   * Try to derive a canonical storeNumber for a sale record that may not
   * have a (valid) storeNumber. Order:
   *   1. sale.storeNumber
   *   2. guestinfo[guestinfoKey].sale.storeNumber
   *   3. users[guestinfo.userUid].store
   *   4. If submitter has a lead (assignedLead) and exactly one store
   *      uses that TL, use that store's number.
   * Else returns UNASSIGNED_KEY.
   */
  function deriveStoreNumberForSale(sale, guestinfoObj, users, storesObj) {
    let sn = normStore(sale.storeNumber);

    if (!sn && sale.guestinfoKey && guestinfoObj) {
      const g = guestinfoObj[sale.guestinfoKey];
      if (g) {
        sn = normStore(g.sale?.storeNumber);
        if (!sn) sn = normStore(users?.[g.userUid]?.store);
        if (!sn && g.userUid) {
          const submitter = users?.[g.userUid];
          const leadUid = submitter?.assignedLead;
          if (leadUid) {
            const matchStores = Object.values(storesObj || {}).filter(
              (st) => st.teamLeadUid === leadUid
            );
            if (matchStores.length === 1) {
              sn = normStore(matchStores[0].storeNumber);
            }
          }
        }
      }
    }

    return sn || UNASSIGNED_KEY;
  }

  /* ====================================================================
     Sales summarizer (normalized)
     Returns { [storeNumber]: {count, units, amount} }
     amount kept for possible future reporting; not displayed.
     ==================================================================== */
  function summarizeSalesByStore(salesObj, storesObj, guestinfoObj, users) {
    const out = {};
    if (!salesObj) return out;

    for (const [, s] of Object.entries(salesObj)) {
      const sn = deriveStoreNumberForSale(s, guestinfoObj, users, storesObj);
      if (!out[sn]) out[sn] = { count: 0, units: 0, amount: 0 };
      out[sn].count += 1;
      out[sn].units += Number(s.units || 0);
      out[sn].amount += Number(s.amount || 0); // legacy
    }
    return out;
  }

  /* ====================================================================
     Associates (MEs) listing per store
     Primary: user.store === storeNumber
     Fallback: user.assignedLead === store.teamLeadUid
     ==================================================================== */
  function getMesForStore(users, storeNumber, teamLeadUid) {
    const sn = normStore(storeNumber);
    const seen = new Set();
    const mes = [];

    for (const [uid, u] of Object.entries(users)) {
      if (u.role !== ROLES.ME) continue;

      if (sn && u.store && normStore(u.store) === sn) {
        if (!seen.has(uid)) {
          seen.add(uid);
          mes.push({ uid, ...u });
        }
        continue;
      }

      if (teamLeadUid && u.assignedLead === teamLeadUid && !seen.has(uid)) {
        seen.add(uid);
        mes.push({ uid, ...u });
      }
    }
    return mes;
  }

  function fmtMesCell(mesArr) {
    if (!mesArr || !mesArr.length) return "-";
    const names = mesArr.map((u) => u.name || u.email || u.uid);
    const shown = names.slice(0, 3).join(", ");
    const extra = names.length > 3 ? ` +${names.length - 3}` : "";
    return `${shown}${extra}`;
  }

  /* ====================================================================
     Sales cell formatting (count / units)
     ==================================================================== */
  function fmtSalesCell(summ) {
    if (!summ) return "-";
    return `${summ.count} / ${summ.units}u`;
  }

  /* ====================================================================
     Render Stores
     ==================================================================== */
  function renderStoresSection(stores, users, currentRole, salesObj) {
    // Use globals if arguments missing
    const _salesObj  = salesObj            || window._sales     || {};
    const _users     = users               || window._users     || {};
    const _stores    = stores              || window._stores    || {};
    const _guestinfo = window._guestinfo   || {}; // needed for normalization

    const salesSummary = summarizeSalesByStore(_salesObj, _stores, _guestinfo, _users);

    const storeRows = Object.entries(stores).map(([id, s]) => {
      const tl = users[s.teamLeadUid] || {};
      const storeNumber = s.storeNumber || "";
      const summ  = salesSummary[normStore(storeNumber)];
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
              .map(([uid, u]) =>
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

    // Unassigned bucket row (if any orphaned sales exist)
    const unassignedSumm = salesSummary[UNASSIGNED_KEY];
    const unassignedRow = unassignedSumm
      ? `<tr class="unassigned-row">
          <td colspan="3"><i>Unassigned sales (no matching store)</i></td>
          <td>${fmtSalesCell(unassignedSumm)}</td>
          <td></td>
        </tr>`
      : "";

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
          <tbody>${storeRows}${unassignedRow}</tbody>
        </table>
        ${currentRole === ROLES.ADMIN ? `
          <div class="store-add">
            <input id="newStoreNum" placeholder="New Store #">
            <button onclick="window.stores.addStore()">Add Store</button>
          </div>` : ''}
      </section>
    `;
  }

  /* ====================================================================
     Actions
     ==================================================================== */
  async function assignTL(storeId, uid) {
    assertAssign();
    const stores = (await window.db.ref("stores").get()).val() || {};
    // ensure TL only tied to one store
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

  /* ====================================================================
     Expose
     ==================================================================== */
  window.stores = {
    renderStoresSection,
    assignTL,
    updateStoreNumber,
    addStore,
    deleteStore,
    summarizeSalesByStore,
    getMesForStore
  };
})();