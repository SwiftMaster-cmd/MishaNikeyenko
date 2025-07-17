// stores.js  -- Responsive, goal-aware, collapsible Stores dashboard cards
(() => {
  const ROLES = { ME:"me", LEAD:"lead", DM:"dm", ADMIN:"admin" };

  /* ------------------------------------------------------------------
   * Permission helpers
   * ------------------------------------------------------------------ */
  const isAdmin = r => r === ROLES.ADMIN;
  const isDM    = r => r === ROLES.DM;
  const isLead  = r => r === ROLES.LEAD;
  // const isMe = r => r === ROLES.ME;  // not currently used

  function canEditStoreNumber(role){ return isAdmin(role); }
  function canAssignTL(role){ return isAdmin(role) || isDM(role); }
  function canSetGoal(role){ return isAdmin(role); }
  function canDelete(role){ return isAdmin(role) || isDM(role); }

  function assertAdmin(){
    if (!isAdmin(window.currentRole)) throw "PERM_DENIED_EDIT";
  }
  function assertAssign(){
    if (!(isAdmin(window.currentRole) || isDM(window.currentRole))) throw "PERM_DENIED_ASSIGN";
  }
  function assertDelete(){
    if (!canDelete(window.currentRole)) throw "PERM_DENIED_DELETE";
  }

  /* ------------------------------------------------------------------
   * State: open/closed per store across re-renders
   * ------------------------------------------------------------------ */
  if (!window._stores_open) window._stores_open = {};  // {storeId:boolean}

  /* ------------------------------------------------------------------
   * Normalization helpers
   * ------------------------------------------------------------------ */
  const UNASSIGNED_KEY = "__UNASSIGNED__";
  const normStore = sn => (sn ?? "").toString().trim();

  /* ------------------------------------------------------------------
   * Date helpers (Month-To-Date)
   * ------------------------------------------------------------------ */
  function startOfMonthMs(d=new Date()){
    return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  }
  const _monthStart = startOfMonthMs();
  function isMTD(ts){ return (ts||0) >= _monthStart; }

  /* ------------------------------------------------------------------
   * Derive store number for a sale (robust)
   * ------------------------------------------------------------------ */
  function deriveStoreNumberForSale(sale, guestinfoObj, users, storesObj){
    let sn = normStore(sale.storeNumber);

    if (!sn && sale.guestinfoKey && guestinfoObj){
      const g = guestinfoObj[sale.guestinfoKey];
      if (g){
        sn = normStore(g.sale?.storeNumber);
        if (!sn) sn = normStore(users?.[g.userUid]?.store);
        if (!sn && g.userUid){
          const submitter = users?.[g.userUid];
          const leadUid   = submitter?.assignedLead;
          if (leadUid){
            const matchStores = Object.values(storesObj||{}).filter(st => st.teamLeadUid === leadUid);
            if (matchStores.length === 1){
              sn = normStore(matchStores[0].storeNumber);
            }
          }
        }
      }
    }
    return sn || UNASSIGNED_KEY;
  }

  /* ------------------------------------------------------------------
   * Summarize sales MTD by store
   * out: { [storeNumber]: {count, units} }
   * ------------------------------------------------------------------ */
  function summarizeSalesByStoreMTD(salesObj, storesObj, guestinfoObj, users){
    const out = {};
    if (!salesObj) return out;
    for (const [,s] of Object.entries(salesObj)){
      // Only count MTD (createdAt preferred; fallback soldAt)
      const sTs = s.createdAt || s.soldAt || 0;
      if (!isMTD(sTs)) continue;

      const sn = deriveStoreNumberForSale(s, guestinfoObj, users, storesObj);
      if (!out[sn]) out[sn] = {count:0, units:0};
      out[sn].count += 1;
      out[sn].units += Number(s.units || 0);
    }
    return out;
  }

  /* ------------------------------------------------------------------
   * Collect associates (MEs) for a store
   * Primary: user.store === storeNumber
   * Fallback: user.assignedLead === store.teamLeadUid
   * ------------------------------------------------------------------ */
  function getMesForStore(users, storeNumber, teamLeadUid){
    const sn = normStore(storeNumber);
    const seen = new Set();
    const mes = [];

    for (const [uid,u] of Object.entries(users)){
      if (u.role !== ROLES.ME) continue;

      if (sn && u.store && normStore(u.store) === sn){
        if (!seen.has(uid)){ seen.add(uid); mes.push({uid,...u}); }
        continue;
      }
      if (teamLeadUid && u.assignedLead === teamLeadUid && !seen.has(uid)){
        seen.add(uid); mes.push({uid,...u});
      }
    }
    return mes;
  }

  /* ------------------------------------------------------------------
   * Staffing + goal utils
   * ------------------------------------------------------------------ */
  const DEFAULT_GOAL = 0;           // "no goal" untreated
  const DEFAULT_MIN_STAFF = 2;      // 1 Lead + 1 ME baseline

  function storeGoalUnits(storeObj){
    // Accept a few legacy keys
    return Number(storeObj.goalUnits ?? storeObj.budgetUnits ?? storeObj.goal ?? DEFAULT_GOAL) || 0;
  }

  function storeStaffGoal(storeObj){
    // target number of total humans; default 2 (lead + me)
    return Number(storeObj.staffGoal ?? DEFAULT_MIN_STAFF) || DEFAULT_MIN_STAFF;
  }

  function staffingCounts(storeObj, users){
    const lead = users[storeObj.teamLeadUid] || null;
    const mes  = getMesForStore(users, storeObj.storeNumber, storeObj.teamLeadUid);
    const meCount = mes.length;
    const hasLead = !!lead;
    const total   = (hasLead?1:0) + meCount;
    return {lead, meCount, total};
  }

  /* ------------------------------------------------------------------
   * Summary chips
   * ------------------------------------------------------------------ */
  function progressChip(unitsNow, goalUnits){
    if (!goalUnits){ // no goal defined
      return `<span class="metric-chip">${unitsNow}u</span>`;
    }
    let cls=""; let icon="";
    if (unitsNow >= goalUnits){ cls="success"; icon="&#10003;"; }           // green check
    else if (unitsNow > 0){ cls="warning"; icon="&#9888;"; }                // yellow caution
    else { cls="danger"; icon="•"; }                                        // red dot if goal>0 no units
    return `<span class="metric-chip ${cls}" title="${unitsNow}/${goalUnits} units MTD">${unitsNow}/${goalUnits}u ${icon}</span>`;
  }

  function staffChip(total, goal, hasLead, meCount){
    // color: success if total>=goal && hasLead, warning if missing lead or <goal, danger if 0
    let cls, icon;
    if (total===0){ cls="danger"; icon="•"; }
    else if (hasLead && total>=goal){ cls="success"; icon="&#10003;"; }
    else { cls="warning"; icon="&#9888;"; }
    const leadDot = hasLead ? `<span class="role-badge role-lead" title="Lead present">L</span>` : `<span class="role-badge role-guest" title="No Lead">L?</span>`;
    const meDot   = `<span class="role-badge role-me" title="MEs">${meCount}</span>`;
    return `<span class="metric-chip ${cls}" title="Staff ${total}/${goal}">${leadDot} ${meDot}</span>`;
  }

  /* ------------------------------------------------------------------
   * Collapsed header row
   * ------------------------------------------------------------------ */
  function storeHeaderHtml(storeId, storeObj, salesSummary, users){
    const storeNumber = normStore(storeObj.storeNumber) || "(no#)";
    const goalUnits   = storeGoalUnits(storeObj);
    const summ        = salesSummary[normStore(storeNumber)] || {units:0,count:0};
    const {lead, meCount, total} = staffingCounts(storeObj, users);
    const staffGoal   = storeStaffGoal(storeObj);

    return `
      <div class="store-card-header" onclick="window.stores.toggleStoreOpen('${storeId}')">
        <div class="store-card-header-main">
          <span class="store-card-title">${storeNumber}</span>
          ${progressChip(summ.units, goalUnits)}
          ${staffChip(total, staffGoal, !!lead, meCount)}
        </div>
        <div class="store-card-header-sub">
          ${lead ? `<span class="store-card-lead-name">${lead.name || lead.email}</span>` : `<span class="store-card-lead-missing">No Lead</span>`}
        </div>
      </div>
    `;
  }

  /* ------------------------------------------------------------------
   * Expanded detail content
   * ------------------------------------------------------------------ */
  function storeDetailHtml(storeId, storeObj, users, currentRole, salesSummary){
    const storeNumber = normStore(storeObj.storeNumber) || "";
    const goalUnits   = storeGoalUnits(storeObj);
    const staffGoal   = storeStaffGoal(storeObj);
    const summ        = salesSummary[normStore(storeNumber)] || {units:0,count:0};
    const {lead, meCount, total} = staffingCounts(storeObj, users);

    const mes = getMesForStore(users, storeNumber, storeObj.teamLeadUid)
      .map(m => `<li>${m.name || m.email} ${roleBadge(m.role)}</li>`).join("") || "<li>-</li>";

    /* editable fields ------------------------------------------------ */
    const storeNumField = canEditStoreNumber(currentRole)
      ? `<input type="text" value="${storeNumber}" onchange="window.stores.updateStoreNumber('${storeId}',this.value)" />`
      : (storeNumber || "-");

    const leadField = canAssignTL(currentRole)
      ? `<select onchange="window.stores.assignTL('${storeId}',this.value)">
          <option value="">-- Unassigned --</option>
          ${Object.entries(users)
            .filter(([,u]) => [ROLES.LEAD,ROLES.DM].includes(u.role))
            .map(([uid,u]) =>
              `<option value="${uid}" ${storeObj.teamLeadUid===uid?'selected':''}>${u.name || u.email}</option>`
            ).join("")}
        </select>`
      : (lead?.name || lead?.email || "-");

    const goalField = canSetGoal(currentRole)
      ? `<input type="number" min="0" value="${goalUnits}" style="width:80px" onchange="window.stores.updateStoreGoal('${storeId}',this.value)" />`
      : goalUnits;

    const staffGoalField = canSetGoal(currentRole)
      ? `<input type="number" min="0" value="${staffGoal}" style="width:60px" onchange="window.stores.updateStaffGoal('${storeId}',this.value)" />`
      : staffGoal;

    const delBtn = canDelete(currentRole)
      ? `<button class="btn btn-danger btn-sm" onclick="window.stores.deleteStore('${storeId}')">Delete</button>`
      : "";

    return `
      <div class="store-card-detail">
        <div class="store-card-detail-grid">
          <div><b>Store #:</b> ${storeNumField}</div>
          <div><b>Lead:</b> ${leadField}</div>
          <div><b>Monthly Unit Goal:</b> ${goalField}</div>
          <div><b>Staff Goal:</b> ${staffGoalField}</div>
          <div><b>MTD Sales:</b> ${summ.count} sales / ${summ.units} units</div>
          <div><b>Current Staff:</b> ${total} (${meCount} ME${meCount===1?"":"s"}${lead?" + Lead":""})</div>
        </div>
        <div class="store-card-mes">
          <b>Associates:</b>
          <ul>${mes}</ul>
        </div>
        <div class="store-card-actions">
          ${delBtn}
        </div>
      </div>
    `;
  }

  /* ------------------------------------------------------------------
   * Decide default open state (first render only)
   * - If store meets/exceeds goalUnits>0 -> start closed
   * - Else open
   * ------------------------------------------------------------------ */
  function defaultOpenForStore(storeId, storeObj, salesSummary){
    if (storeId in window._stores_open) return window._stores_open[storeId];
    const storeNumber = normStore(storeObj.storeNumber);
    const goalUnits   = storeGoalUnits(storeObj);
    if (!goalUnits){ window._stores_open[storeId] = true; return true; } // no goal => open
    const summ = salesSummary[normStore(storeNumber)] || {units:0};
    const open = summ.units < goalUnits;  // below goal => open
    window._stores_open[storeId] = open;
    return open;
  }

  /* ------------------------------------------------------------------
   * Build one store card (collapsed/expanded)
   * ------------------------------------------------------------------ */
  function storeCardHtml(storeId, storeObj, salesSummary, users, currentRole){
    const open = defaultOpenForStore(storeId, storeObj, salesSummary);
    const header = storeHeaderHtml(storeId, storeObj, salesSummary, users);
    const detail = open ? storeDetailHtml(storeId, storeObj, users, currentRole, salesSummary) : "";
    const openCls = open ? "is-open" : "is-collapsed";
    return `<div class="store-card ${openCls}" id="store-card-${storeId}">${header}${detail}</div>`;
  }

  /* ------------------------------------------------------------------
   * Unassigned sales card
   * ------------------------------------------------------------------ */
  function unassignedSalesCardHtml(unassignedSumm){
    if (!unassignedSumm) return "";
    return `
      <div class="store-card unassigned-card">
        <div class="store-card-header">
          <div class="store-card-header-main">
            <span class="store-card-title">Unassigned Sales</span>
            <span class="metric-chip danger">${unassignedSumm.count} / ${unassignedSumm.units}u</span>
          </div>
          <div class="store-card-header-sub">
            <small>Sales w/ no matching store</small>
          </div>
        </div>
      </div>
    `;
  }

  /* ------------------------------------------------------------------
   * Render full Stores section
   * ------------------------------------------------------------------ */
  function renderStoresSection(stores, users, currentRole, salesObj){
    // use globals if missing
    const _stores    = stores    || window._stores    || {};
    const _users     = users     || window._users     || {};
    const _sales     = salesObj  || window._sales     || {};
    const _guestinfo = window._guestinfo || {};

    const salesSummary = summarizeSalesByStoreMTD(_sales, _stores, _guestinfo, _users);

    // build cards in storeNumber sort ascending (numeric fallback lex)
    const entries = Object.entries(_stores).sort((a,b)=>{
      const aN = parseInt(a[1].storeNumber,10);
      const bN = parseInt(b[1].storeNumber,10);
      if (isNaN(aN) || isNaN(bN)) return (''+a[1].storeNumber).localeCompare(''+b[1].storeNumber);
      return aN-bN;
    });

    const cards = entries.map(([id,st]) =>
      storeCardHtml(id, st, salesSummary, _users, currentRole)
    ).join("");

    const unassignedSumm = salesSummary[UNASSIGNED_KEY];
    const unassignedCard = unassignedSalesCardHtml(unassignedSumm);

    const addStoreHtml = isAdmin(currentRole) ? `
      <div class="store-add">
        <input id="newStoreNum" placeholder="New Store #">
        <button class="btn btn-primary" onclick="window.stores.addStore()">Add Store</button>
      </div>` : "";

    return `
      <section class="admin-section stores-section" id="stores-section">
        <h2>Stores</h2>
        <div class="stores-cards-wrapper">
          ${cards}
          ${unassignedCard}
        </div>
        ${addStoreHtml}
      </section>
    `;
  }

  /* ------------------------------------------------------------------
   * Toggle open/closed (user action)
   * ------------------------------------------------------------------ */
  function toggleStoreOpen(storeId){
    const current = !!window._stores_open[storeId];
    window._stores_open[storeId] = !current;
    // re-render just this card if possible
    const stores   = window._stores    || {};
    const users    = window._users     || {};
    const sales    = window._sales     || {};
    const guestinf = window._guestinfo || {};
    const salesSummary = summarizeSalesByStoreMTD(sales, stores, guestinf, users);

    const cardEl = document.getElementById(`store-card-${storeId}`);
    if (!cardEl){
      // fallback full render
      window.renderAdminApp();
      return;
    }
    cardEl.outerHTML = storeCardHtml(storeId, stores[storeId], salesSummary, users, window.currentRole);
  }

  /* ------------------------------------------------------------------
   * Actions (write to DB)
   * ------------------------------------------------------------------ */
  async function assignTL(storeId, uid){
    assertAssign();
    const storesSnap = await window.db.ref("stores").get();
    const stores = storesSnap.val() || {};
    // ensure TL only tied to one store
    for (const sId in stores){
      if (stores[sId].teamLeadUid === uid && sId !== storeId){
        await window.db.ref(`stores/${sId}/teamLeadUid`).set("");
      }
    }
    await window.db.ref(`stores/${storeId}/teamLeadUid`).set(uid || "");
    if (uid){
      const num = (await window.db.ref(`stores/${storeId}/storeNumber`).get()).val();
      await window.db.ref(`users/${uid}`).update({ store:num, role: ROLES.LEAD });
    }
    window.renderAdminApp();
  }

  async function updateStoreNumber(id, val){
    assertAdmin();
    await window.db.ref(`stores/${id}/storeNumber`).set(val);
    window.renderAdminApp();
  }

  async function updateStoreGoal(id, val){
    assertAdmin();
    const n = Math.max(0, Number(val)||0);
    await window.db.ref(`stores/${id}/goalUnits`).set(n);
    window.renderAdminApp();
  }

  async function updateStaffGoal(id, val){
    assertAdmin();
    const n = Math.max(0, Number(val)||0);
    await window.db.ref(`stores/${id}/staffGoal`).set(n);
    window.renderAdminApp();
  }

  async function addStore(){
    assertAdmin();
    const num = document.getElementById("newStoreNum").value.trim();
    if (!num) return alert("Enter store #");
    await window.db.ref("stores").push({
      storeNumber: num,
      teamLeadUid: "",
      goalUnits:   0,
      staffGoal:   DEFAULT_MIN_STAFF
    });
    window.renderAdminApp();
  }

  async function deleteStore(id){
    assertDelete();
    if (!confirm("Delete this store?")) return;
    await window.db.ref(`stores/${id}`).remove();
    window.renderAdminApp();
  }

  /* ------------------------------------------------------------------
   * Expose
   * ------------------------------------------------------------------ */
  window.stores = {
    renderStoresSection,
    toggleStoreOpen,
    assignTL,
    updateStoreNumber,
    updateStoreGoal,
    updateStaffGoal,
    addStore,
    deleteStore,
    summarizeSalesByStoreMTD,
    getMesForStore
  };
})();