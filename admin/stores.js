/* =======================================================================
 * stores.js  (Dashboard Stores / Staffing & Budget module)
 * -----------------------------------------------------------------------
 * Features
 *  - Admin sets per-store monthly "budget" (unit goal) => stores/<id>/budgetUnits
 *  - Auto-collapse store block when MTD units >= goal (unless user re-opens)
 *  - Collapsed summary shows: store #, role-mix pills (Lead/ME counts),
 *    MTD progress % (and units/goal), status color (meets / under / no goal).
 *  - Expanded detail: edit store # (Admin), set budget (Admin), assign TL
 *    (Admin+DM), view Associates (MEs) auto-collected, lifetime & MTD sales,
 *    delete store (Admin+DM).
 *  - Handles orphaned sales (unassigned bucket).
 *  - Normalizes sales store numbers via guestinfo & user submitter fallback.
 * -----------------------------------------------------------------------
 * Globals expected:
 *    window.db
 *    window.currentUid
 *    window.currentRole
 *    window._stores, window._users, window._guestinfo, window._sales  (caches)
 * -----------------------------------------------------------------------
 * Exports:
 *    renderStoresSection(stores, users, currentRole, salesObj)
 *    assignTL(storeId, uid)
 *    updateStoreNumber(id, val)
 *    updateStoreBudget(id, val)
 *    addStore()
 *    deleteStore(id)
 *    summarizeSalesByStore(...)
 *    summarizeSalesByStoreMTD(...)
 *    getMesForStore(...)
 *    toggleStoreOpen(id)
 * ======================================================================= */
(() => {

  const ROLES = { ME:"me", LEAD:"lead", DM:"dm", ADMIN:"admin" };
  const UNASSIGNED_KEY = "__UNASSIGNED__";

  /* --------------------------------------------------------------------
   * UI open/close state (persist across re-renders)
   * storeId -> boolean open/closed
   * ------------------------------------------------------------------ */
  if (!window._storesOpenById) window._storesOpenById = {};

  /* --------------------------------------------------------------------
   * Permission helpers
   * ------------------------------------------------------------------ */
  const isAdmin = r => r === ROLES.ADMIN;
  const isDM    = r => r === ROLES.DM;

  function canEditStoreNumber(role){ return isAdmin(role); }
  function canAssignTL(role){ return isAdmin(role) || isDM(role); }
  function canDeleteStore(role){ return isAdmin(role) || isDM(role); }
  function canEditBudget(role){ return isAdmin(role); }

  function assertEdit(){
    if (!isAdmin(window.currentRole)) throw "PERM_DENIED_EDIT";
  }
  function assertAssign(){
    if (!(isAdmin(window.currentRole) || isDM(window.currentRole))) throw "PERM_DENIED_ASSIGN";
  }
  function assertDelete(){
    if (!canDeleteStore(window.currentRole)) throw "PERM_DENIED_DELETE";
  }

  const roleBadge = r => `<span class="role-badge role-${r}">${r.toUpperCase()}</span>`;

  /* --------------------------------------------------------------------
   * Utilities
   * ------------------------------------------------------------------ */
  const normStore = sn => (sn ?? "").toString().trim();

  function monthStartMs(){
    const d = new Date();
    d.setDate(1);
    d.setHours(0,0,0,0);
    return d.getTime();
  }

  /* --------------------------------------------------------------------
   * Sale → storeNumber normalization
   * ------------------------------------------------------------------ */
  function deriveStoreNumberForSale(sale, guestinfoObj, users, storesObj) {
    // 1) sale.storeNumber
    let sn = normStore(sale.storeNumber);

    if (!sn && sale.guestinfoKey && guestinfoObj) {
      const g = guestinfoObj[sale.guestinfoKey];
      if (g) {
        // 2) guestinfo.sale.storeNumber
        sn = normStore(g.sale?.storeNumber);
        // 3) submitter's user.store
        if (!sn) sn = normStore(users?.[g.userUid]?.store);
        // 4) lead's store (if submitter has a lead who owns exactly 1 store)
        if (!sn && g.userUid) {
          const submitter = users?.[g.userUid];
          const leadUid   = submitter?.assignedLead;
          if (leadUid) {
            const matchStores = Object.values(storesObj || {}).filter(
              st => st.teamLeadUid === leadUid
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

  /* --------------------------------------------------------------------
   * Sales summarizers
   * out[storeNumber] = { count, units, amount }
   * ------------------------------------------------------------------ */
  function summarizeSalesByStore(salesObj, storesObj, guestinfoObj, users){
    const out = {};
    if (!salesObj) return out;
    for (const [,s] of Object.entries(salesObj)){
      const sn = deriveStoreNumberForSale(s, guestinfoObj, users, storesObj);
      if (!out[sn]) out[sn] = { count:0, units:0, amount:0 };
      out[sn].count += 1;
      out[sn].units += Number(s.units || 0);
      out[sn].amount+= Number(s.amount|| 0);
    }
    return out;
  }

  function summarizeSalesByStoreMTD(salesObj, storesObj, guestinfoObj, users){
    const out = {};
    if (!salesObj) return out;
    const mStart = monthStartMs();
    for (const [,s] of Object.entries(salesObj)){
      const ts = s.createdAt || s.soldAt || 0;
      if (ts < mStart) continue;
      const sn = deriveStoreNumberForSale(s, guestinfoObj, users, storesObj);
      if (!out[sn]) out[sn] = { count:0, units:0, amount:0 };
      out[sn].count += 1;
      out[sn].units += Number(s.units || 0);
      out[sn].amount+= Number(s.amount|| 0);
    }
    return out;
  }

  /* --------------------------------------------------------------------
   * Staff lookups
   * ------------------------------------------------------------------ */
  function getPeopleForStore(users, storeNumber, teamLeadUid){
    const sn = normStore(storeNumber);
    const leads = [];
    const mes   = [];
    for (const [uid,u] of Object.entries(users||{})){
      if (u.role === ROLES.LEAD){
        // explicit TL for store OR user.store matches sn
        if ((teamLeadUid && uid === teamLeadUid) || (sn && normStore(u.store)===sn)){
          leads.push({uid,...u});
        }
      } else if (u.role === ROLES.ME){
        if (sn && normStore(u.store)===sn){
          mes.push({uid,...u});
        } else if (teamLeadUid && u.assignedLead === teamLeadUid){
          mes.push({uid,...u});
        }
      }
    }
    return { leads, mes };
  }

  function fmtPeopleCell(arr){
    if (!arr.length) return "-";
    const names = arr.map(u=>u.name||u.email||u.uid);
    const shown = names.slice(0,3).join(", ");
    const extra = names.length>3 ? ` +${names.length-3}`:"";
    return shown+extra;
  }

  /* --------------------------------------------------------------------
   * Format Sales cells
   * ------------------------------------------------------------------ */
  const fmtSalesCell = s => s ? `${s.count} / ${s.units}u` : "-";

  /* --------------------------------------------------------------------
   * Compute % to goal + status class
   * budgetUnits default 0 => no-goal
   * ------------------------------------------------------------------ */
  function computeBudgetStatus(mtdSummary, budgetUnits){
    const units = mtdSummary?.units || 0;
    const goal  = Number(budgetUnits||0);
    if (!goal){
      return {pct:null, meets:false, cls:"store-nogoal", label:"–"};
    }
    const pct = (units/goal)*100;
    const meets = units >= goal;
    const pctStr = Math.round(pct) + "%";
    const cls = meets ? "store-met" : "store-under";
    return {pct, pctStr, meets, goal, units, cls, label:pctStr};
  }

  /* --------------------------------------------------------------------
   * Store summary (collapsed header row)
   * ------------------------------------------------------------------ */
  function storeSummaryHtml(storeId, storeRec, staff, mtdSumm, budgetStatus, isOpen, isAdminView){
    const sn = storeRec.storeNumber || "";
    const caret = isOpen ? "▾" : "▸";

    // Role mix pills
    const leadCnt = staff.leads.length;
    const meCnt   = staff.mes.length;
    const pills = [
      leadCnt ? `<span class="store-pill lead">L${leadCnt>1?leadCnt:""}</span>` : "",
      meCnt   ? `<span class="store-pill me">M${meCnt>1?meCnt:""}</span>`       : ""
    ].join("");

    // Budget progress label
    const bs = budgetStatus;
    const progressLabel = (bs.pct!=null)
      ? `${mtdSumm?.units||0}/${bs.goal}u • ${bs.label}`
      : fmtSalesCell(mtdSumm); // fallback show MTD (count/units)

    // Inline goal input (Admin) - stopPropagation so clicking input doesn't toggle
    const budgetInput = isAdminView
      ? `<input type="number" min="0" class="store-budget-input" value="${Number(storeRec.budgetUnits||0)}"
          onclick="event.stopPropagation();"
          onchange="window.stores.updateStoreBudget('${storeId}', this.value)" />`
      : "";

    const cls = `user-store-summary ${bs.cls} ${isOpen?"open":""}`;

    return `
      <div class="${cls}" data-storeid="${storeId}"
           onclick="window.stores.toggleStoreOpen('${storeId}')"
           title="Month-to-date: ${progressLabel}">
        <span class="uss-caret">${caret}</span>
        <span class="uss-name">#${sn||"?"}</span>
        <span class="uss-role-mix">${pills}</span>
        <span class="uss-progress">${progressLabel}</span>
        ${budgetInput}
      </div>
    `;
  }

  /* --------------------------------------------------------------------
   * Expanded store detail
   * ------------------------------------------------------------------ */
  function storeDetailHtml(storeId, storeRec, staff, users, currentRole, salesAllSumm, salesMtdSumm){
    const sn = storeRec.storeNumber || "";
    const tlUid = storeRec.teamLeadUid;
    const tl    = users[tlUid] || {};
    const leads = staff.leads;
    const mes   = staff.mes;

    /* ---- TL cell ---- */
    const tlCell = canAssignTL(currentRole)
      ? `<select onchange="window.stores.assignTL('${storeId}',this.value)">
          <option value="">-- Unassigned --</option>
          ${Object.entries(users)
            .filter(([,u])=>[ROLES.LEAD,ROLES.DM].includes(u.role))
            .map(([uid,u])=>
              `<option value="${uid}" ${tlUid===uid?'selected':''}>${u.name||u.email}</option>`
            ).join("")}
        </select>`
      : (tl.name || tl.email || "-");

    const tlBadge = tl.role ? roleBadge(tl.role) : "";

    /* ---- Associates ---- */
    const mesCell = fmtPeopleCell(mes);

    /* ---- Sales cells ---- */
    const allCell = fmtSalesCell(salesAllSumm);
    const mtdCell = fmtSalesCell(salesMtdSumm);

    /* ---- Store # edit ---- */
    const storeNumCell = canEditStoreNumber(currentRole)
      ? `<input type="text" value="${sn}" onchange="window.stores.updateStoreNumber('${storeId}',this.value)">`
      : `#${sn||"-"}`;

    /* ---- Delete btn ---- */
    const deleteBtn = canDeleteStore(currentRole)
      ? `<button class="btn btn-danger btn-sm" onclick="window.stores.deleteStore('${storeId}')">Delete</button>`
      : "";

    return `
      <div class="user-store-detail">
        <table class="store-table">
          <thead>
            <tr>
              <th>Store</th>
              <th>Team Lead</th>
              <th>Associates (MEs)</th>
              <th>Sales<br><small>All / MTD</small></th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>${storeNumCell}</td>
              <td>${tlCell} ${tlBadge}</td>
              <td>${mesCell}</td>
              <td>${allCell} / ${mtdCell}</td>
              <td>${deleteBtn}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }

  /* --------------------------------------------------------------------
   * Store block (summary + optional detail)
   * Auto-open logic: if user hasn’t toggled yet, open unless at/above goal.
   * ------------------------------------------------------------------ */
  function storeBlockHtml(storeId, storeRec, users, currentRole,
                          salesAllSumm, salesMtdSumm){
    const staff = getPeopleForStore(users, storeRec.storeNumber, storeRec.teamLeadUid);
    const budgetStatus = computeBudgetStatus(salesMtdSumm, storeRec.budgetUnits);

    // Determine open/closed
    let isOpen = window._storesOpenById.hasOwnProperty(storeId)
      ? !!window._storesOpenById[storeId]
      : !(budgetStatus.meets && budgetStatus.pct!=null); // default collapse if met goal

    const summaryHtml = storeSummaryHtml(
      storeId, storeRec, staff, salesMtdSumm, budgetStatus, isOpen, isAdmin(currentRole)
    );
    const detailHtml = isOpen
      ? storeDetailHtml(storeId, storeRec, staff, users, currentRole, salesAllSumm, salesMtdSumm)
      : "";

    return `
      <div class="user-store-block ${isOpen?'open':''}">
        ${summaryHtml}
        ${detailHtml}
      </div>
    `;
  }

  /* --------------------------------------------------------------------
   * UNASSIGNED sales block (if any)
   * ------------------------------------------------------------------ */
  function unassignedSalesBlockHtml(unassignedSumm){
    if (!unassignedSumm) return "";
    return `
      <div class="user-store-block user-store-block-unassigned">
        <div class="user-store-summary store-under open" title="Orphaned sales with no store match">
          <span class="uss-caret">•</span>
          <span class="uss-name">(Unassigned)</span>
          <span class="uss-progress">${fmtSalesCell(unassignedSumm)}</span>
        </div>
      </div>
    `;
  }

  /* --------------------------------------------------------------------
   * RENDER STORES SECTION
   * ------------------------------------------------------------------ */
  function renderStoresSection(stores, users, currentRole, salesObj) {
    // Use caches if args omitted
    const _salesObj  = salesObj          || window._sales     || {};
    const _users     = users             || window._users     || {};
    const _stores    = stores            || window._stores    || {};
    const _guestinfo = window._guestinfo || {};

    // Sales summaries
    const salesAll = summarizeSalesByStore(_salesObj, _stores, _guestinfo, _users);
    const salesMtd = summarizeSalesByStoreMTD(_salesObj, _stores, _guestinfo, _users);

    // Sort stores by numeric storeNumber asc (fallback alpha)
    const sorted = Object.entries(_stores).sort(([,a],[,b])=>{
      const an = parseInt(a.storeNumber,10), bn = parseInt(b.storeNumber,10);
      if (!isNaN(an) && !isNaN(bn)) return an - bn;
      return (a.storeNumber||"").localeCompare(b.storeNumber||"");
    });

    // Build blocks
    const blocksHtml = sorted.map(([id,s]) => {
      const sn = normStore(s.storeNumber);
      const allSumm = salesAll[sn];
      const mtdSumm = salesMtd[sn];
      return storeBlockHtml(id, s, _users, currentRole, allSumm, mtdSumm);
    }).join("");

    // Orphaned sales
    const unassignedBlock = unassignedSalesBlockHtml(salesAll[UNASSIGNED_KEY]);

    // Add-store form (Admin)
    const addForm = isAdmin(currentRole) ? `
      <div class="store-add">
        <input id="newStoreNum" placeholder="New Store #">
        <button onclick="window.stores.addStore()">Add Store</button>
      </div>` : "";

    return `
      <section class="admin-section stores-section" id="stores-section">
        <h2>Stores</h2>
        <div class="stores-container">
          ${blocksHtml}
          ${unassignedBlock}
        </div>
        ${addForm}
      </section>
    `;
  }

  /* --------------------------------------------------------------------
   * Toggle open / closed
   * ------------------------------------------------------------------ */
  function toggleStoreOpen(storeId){
    window._storesOpenById[storeId] = !window._storesOpenById[storeId];
    window.renderAdminApp();
  }

  /* --------------------------------------------------------------------
   * ACTIONS
   * ------------------------------------------------------------------ */
  async function assignTL(storeId, uid) {
    assertAssign();
    const storesSnap = await window.db.ref("stores").get();
    const stores = storesSnap.val() || {};

    // ensure TL tied to just one store
    for (const sId in stores) {
      if (stores[sId].teamLeadUid === uid && sId !== storeId) {
        await window.db.ref(`stores/${sId}/teamLeadUid`).set("");
      }
    }
    await window.db.ref(`stores/${storeId}/teamLeadUid`).set(uid || "");

    if (uid) {
      // ensure user record updated to reflect store + role LEAD
      const numSnap = await window.db.ref(`stores/${storeId}/storeNumber`).get();
      const num = numSnap.val();
      await window.db.ref(`users/${uid}`).update({ store:num, role:ROLES.LEAD });
    }
    window.renderAdminApp();
  }

  async function updateStoreNumber(id, val) {
    assertEdit();
    await window.db.ref(`stores/${id}/storeNumber`).set(val);
    window.renderAdminApp();
  }

  async function updateStoreBudget(id, val){
    assertEdit();
    let n = parseInt(val,10);
    if (isNaN(n) || n < 0) n = 0;
    await window.db.ref(`stores/${id}/budgetUnits`).set(n);
    window.renderAdminApp();
  }

  async function addStore() {
    assertEdit();
    const inp = document.getElementById("newStoreNum");
    const num = inp?.value.trim();
    if (!num) return alert("Enter store #");
    await window.db.ref("stores").push({
      storeNumber: num,
      teamLeadUid: "",
      budgetUnits: 0
    });
    window.renderAdminApp();
  }

  async function deleteStore(id) {
    assertDelete();
    if (!confirm("Delete this store?")) return;
    await window.db.ref(`stores/${id}`).remove();
    window.renderAdminApp();
  }

  /* --------------------------------------------------------------------
   * BACK-COMPAT exports (legacy funcs used in other modules)
   * ------------------------------------------------------------------ */
  function getMesForStore(users, storeNumber, teamLeadUid){
    // legacy alias returning only mes array
    return getPeopleForStore(users, storeNumber, teamLeadUid).mes;
  }

  /* --------------------------------------------------------------------
   * Expose
   * ------------------------------------------------------------------ */
  window.stores = {
    renderStoresSection,
    assignTL,
    updateStoreNumber,
    updateStoreBudget,
    addStore,
    deleteStore,
    summarizeSalesByStore,
    summarizeSalesByStoreMTD,
    getMesForStore,
    toggleStoreOpen
  };

})();