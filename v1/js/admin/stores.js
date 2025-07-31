/* stores.js */
(() => {
  const ROLES = { ME: "me", LEAD: "lead", DM: "dm", ADMIN: "admin" };
  const UNASSIGNED_KEY = "__UNASSIGNED__";

  let currentUid = null;
  let currentRole = ROLES.ME;

  let _storesCache = {};
  let _usersCache = {};
  let _salesCache = {};

  // Persist open/closed store UI state
  if (!window._storesOpenById) window._storesOpenById = {};

  function init(uid, role) {
    currentUid = uid;
    currentRole = role;
    bindRealtimeListeners();
  }

  function bindRealtimeListeners() {
    const storesRef = window.db.ref("stores");
    const usersRef = window.db.ref("users");
    const salesRef = window.db.ref("sales");

    storesRef.on("value", (snap) => {
      _storesCache = snap.val() || {};
      render();
    });

    usersRef.on("value", (snap) => {
      _usersCache = snap.val() || {};
      render();
    });

    salesRef.on("value", (snap) => {
      _salesCache = snap.val() || {};
      render();
    });
  }

  // Normalize store number from various data sources
  function normStore(sn) {
    return (sn ?? "").toString().trim();
  }

  // Derive store number for a sale
  function deriveStoreNumberForSale(sale) {
    let sn = normStore(sale.storeNumber);
    if (sn) return sn;

    if (sale.guestinfoKey && _storesCache && _usersCache) {
      const g = _storesCache[sale.guestinfoKey];
      if (g?.sale?.storeNumber) sn = normStore(g.sale.storeNumber);
      if (!sn && g?.userUid) {
        const submitter = _usersCache[g.userUid];
        if (submitter?.store) sn = normStore(submitter.store);
      }
    }
    return sn || UNASSIGNED_KEY;
  }

  // Summarize sales by store
  function summarizeSalesByStore() {
    const summary = {};
    if (!_salesCache) return summary;

    for (const [, sale] of Object.entries(_salesCache)) {
      const sn = deriveStoreNumberForSale(sale);
      if (!summary[sn]) summary[sn] = { count: 0, units: 0, amount: 0 };
      summary[sn].count += 1;
      summary[sn].units += Number(sale.units || 0);
      summary[sn].amount += Number(sale.amount || 0);
    }
    return summary;
  }

  // Compute staffing counts per store
  function getPeopleForStore(storeNumber, teamLeadUid) {
    const sn = normStore(storeNumber);
    const leads = [];
    const mes = [];

    for (const [uid, u] of Object.entries(_usersCache || {})) {
      if (u.role === ROLES.LEAD) {
        if ((teamLeadUid && uid === teamLeadUid) || (sn && normStore(u.store) === sn)) {
          leads.push({ uid, ...u });
        }
      } else if (u.role === ROLES.ME) {
        if (sn && normStore(u.store) === sn) {
          mes.push({ uid, ...u });
        } else if (teamLeadUid && u.assignedLead === teamLeadUid) {
          mes.push({ uid, ...u });
        }
      }
    }
    return { leads, mes };
  }

  // Compute sales progress status
  function computeSalesStatus(mtdSummary, budgetUnits) {
    const units = mtdSummary?.units || 0;
    const goal = Number(budgetUnits) || 0;

    if (!goal) {
      return { type: "sales", goal: 0, units, pct: null, meets: false, cls: "store-nogoal", label: "–" };
    }

    const pct = (units / goal) * 100;
    const meets = units >= goal;
    return { type: "sales", goal, units, pct, meets, cls: meets ? "store-met" : "store-under", label: `${Math.round(pct)}%` };
  }

  // Compute staffing progress status
  function computeStaffStatus(staff, staffGoal) {
    const goal = Number(staffGoal) || 0;
    const count = staff.leads.length + staff.mes.length;

    if (!goal) {
      return { type: "staff", goal: 0, count, meets: false, cls: "store-nogoal", label: "–" };
    }

    const pct = (count / goal) * 100;
    const meets = count >= goal;
    return { type: "staff", goal, count, pct, meets, cls: meets ? "store-met" : "store-under", label: `${count}/${goal}` };
  }

  // Default open/collapse logic for stores
  function defaultIsOpen(storeRec, staffStatus, salesStatus) {
    if (Number(storeRec.staffGoal) > 0) return !staffStatus.meets;
    if (Number(storeRec.budgetUnits) > 0) return !salesStatus.meets;
    return true;
  }

  // Toggle open state for store UI
  function toggleStoreOpen(storeId) {
    window._storesOpenById[storeId] = !window._storesOpenById[storeId];
    render();
  }
  window.stores = window.stores || {};
  window.stores.toggleStoreOpen = toggleStoreOpen;

  // Render function for stores list
  function render() {
    const container = document.getElementById("storesContainer");
    if (!container) return;

    const salesSummary = summarizeSalesByStore();

    let html = "";

    for (const [storeId, store] of Object.entries(_storesCache)) {
      const staff = getPeopleForStore(store.storeNumber, store.teamLeadUid);
      const staffStatus = computeStaffStatus(staff, store.staffGoal);
      const salesStatus = computeSalesStatus(salesSummary[store.storeNumber], store.budgetUnits);

      const isOpen = window._storesOpenById[storeId] ?? defaultIsOpen(store, staffStatus, salesStatus);

      html += `<div class="store-block">
        <div class="store-summary ${isOpen ? "open" : ""}" onclick="window.stores.toggleStoreOpen('${storeId}')">
          <span>${store.storeNumber}</span>
          <span>Staff: ${staff.leads.length + staff.mes.length} / ${store.staffGoal || "–"}</span>
          <span>Sales: ${salesStatus.label}</span>
          <span>${isOpen ? "▾" : "▸"}</span>
        </div>`;

      if (isOpen) {
        html += `<div class="store-details">
          <div><strong>Leads:</strong> ${staff.leads.map(l => l.name || l.email || l.uid).join(", ") || "None"}</div>
          <div><strong>MEs:</strong> ${staff.mes.map(m => m.name || m.email || m.uid).join(", ") || "None"}</div>
        </div>`;
      }

      html += `</div>`;
    }

    container.innerHTML = html;
  }

  window.stores = {
    init,
    render,
    toggleStoreOpen,
  };
})();