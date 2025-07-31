(() => {
  const ROLES = window.ROLES || { ME:"me", LEAD:"lead", DM:"dm", ADMIN:"admin" };

  let currentUid = null;
  let currentRole = ROLES.ME;

  let _usersCache = {};
  let _storesCache = {};

  function init(uid, role) {
    currentUid = uid;
    currentRole = role;
    fetchData().then(() => render());
  }

  async function fetchData() {
    const [usersSnap, storesSnap] = await Promise.all([
      window.db.ref("users").get(),
      window.db.ref("stores").get(),
    ]);
    _usersCache = usersSnap.val() || {};
    _storesCache = storesSnap.val() || {};
  }

  function filterVisibleUsers() {
    // Filter _usersCache by role and currentUid
    // Return filtered array or map
  }

  function render() {
    // Render filtered users grouped by store into UI
  }

  function updateStoreStaffGoal(storeNumber, val) {
    // Update staffing goals in Firebase, with permission checks
  }

  window.users = {
    init,
    updateStoreStaffGoal,
  };
})();