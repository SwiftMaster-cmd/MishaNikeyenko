/* users.js */
(() => {
  const ROLES = window.ROLES || { ME: "me", LEAD: "lead", DM: "dm", ADMIN: "admin" };

  let currentUid = null;
  let currentRole = ROLES.ME;

  let _usersCache = {};
  let _storesCache = {};

  let _userStoresOpen = window._userStoresOpen || {}; // Store open/closed state

  function init(uid, role) {
    currentUid = uid;
    currentRole = role;
    bindRealtimeListeners();
  }

  function bindRealtimeListeners() {
    const usersRef = window.db.ref("users");
    const storesRef = window.db.ref("stores");

    usersRef.on("value", (snap) => {
      _usersCache = snap.val() || {};
      render();
    });

    storesRef.on("value", (snap) => {
      _storesCache = snap.val() || {};
      render();
    });
  }

  function isAdmin() {
    return currentRole === ROLES.ADMIN;
  }

  function isDM() {
    return currentRole === ROLES.DM;
  }

  // Role-based user visibility filter
  function filterVisibleUsers() {
    if (!currentUid || !currentRole) return {};

    if (isAdmin()) return _usersCache;

    if (isDM()) {
      return Object.fromEntries(
        Object.entries(_usersCache).filter(([uid, u]) => u.role !== ROLES.ADMIN)
      );
    }

    if (currentRole === ROLES.LEAD) {
      const currentUser = _usersCache[currentUid] || {};
      return Object.fromEntries(
        Object.entries(_usersCache).filter(([uid, u]) =>
          uid === currentUid ||
          (u.role === ROLES.ME && u.assignedLead === currentUid) ||
          (u.role === ROLES.DM && currentUser.assignedDM === uid)
        )
      );
    }

    if (currentRole === ROLES.ME) {
      const currentUser = _usersCache[currentUid] || {};
      return Object.fromEntries(
        Object.entries(_usersCache).filter(([uid]) =>
          uid === currentUid ||
          uid === currentUser.assignedLead ||
          uid === currentUser.assignedDM
        )
      );
    }

    return {};
  }

  // Compute staffing per store
  function computeStoreStaffing(storeNumber) {
    const users = filterVisibleUsers();
    let leadCount = 0;
    let meCount = 0;
    for (const u of Object.values(users)) {
      if (u.store == storeNumber) {
        if (u.role === ROLES.LEAD) leadCount++;
        else if (u.role === ROLES.ME) meCount++;
      }
    }
    return { leadCount, meCount };
  }

  // Toggle store open/closed state
  function toggleStoreOpen(storeNumber) {
    _userStoresOpen[storeNumber] = !_userStoresOpen[storeNumber];
    window._userStoresOpen = _userStoresOpen;
    render();
  }

  // Render users grouped by store
  function render() {
    const container = document.getElementById("usersContainer");
    if (!container) return;

    const visibleUsers = filterVisibleUsers();
    const stores = _storesCache || {};

    let html = "";

    // Group users by store
    const storeGroups = {};
    for (const [uid, user] of Object.entries(visibleUsers)) {
      const sn = user.store || "__unassigned__";
      if (!storeGroups[sn]) storeGroups[sn] = [];
      storeGroups[sn].push({ uid, ...user });
    }

    for (const [storeNumber, users] of Object.entries(storeGroups)) {
      const isOpen = _userStoresOpen[storeNumber] || false;
      const staff = computeStoreStaffing(storeNumber);
      const staffCount = staff.leadCount + staff.meCount;

      html += `<div class="store-group">
        <div class="store-header" onclick="window.users.toggleStoreOpen('${storeNumber}')">
          <span>${storeNumber === "__unassigned__" ? "Unassigned" : esc(storeNumber)}</span>
          <span>Staff: ${staffCount} (L:${staff.leadCount} M:${staff.meCount})</span>
          <span>${isOpen ? "▾" : "▸"}</span>
        </div>`;

      if (isOpen) {
        html += `<ul class="user-list">`;
        for (const user of users) {
          html += `<li>${esc(user.name || user.email || user.uid)} (${user.role.toUpperCase()})</li>`;
        }
        html += `</ul>`;
      }
      html += `</div>`;
    }

    container.innerHTML = html;
  }

  // HTML escape utility
  function esc(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Update staffing goal (Admin only)
  async function updateStoreStaffGoal(storeNumber, val) {
    if (!isAdmin()) return;
    let num = parseInt(val, 10);
    if (isNaN(num) || num <= 0) num = 1;

    const stores = _storesCache || {};
    let storeKey = null;
    for (const [k, s] of Object.entries(stores)) {
      const sn = s.storeNumber ?? s.number ?? k;
      if (sn == storeNumber) {
        storeKey = k;
        break;
      }
    }

    try {
      if (storeKey) {
        await window.db.ref(`stores/${storeKey}/staffGoal`).set(num);
      } else {
        await window.db.ref(`storeStaffGoals/${storeNumber}`).set(num);
      }
      render();
    } catch (e) {
      alert("Error updating store goal: " + e.message);
    }
  }

  window.users = {
    init,
    render,
    toggleStoreOpen,
    updateStoreStaffGoal
  };
})();