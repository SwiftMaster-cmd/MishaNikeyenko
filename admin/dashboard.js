/* ========================================================================
   Dashboard Main Script
   Order: Guest Form Submissions → Guest Info → Stores → Users → Reviews → Role Mgmt
   ===================================================================== */

const ROLES = window.ROLES || { ME: "me", LEAD: "lead", DM: "dm", ADMIN: "admin" };

const firebaseConfig = {
  apiKey: "AIzaSyD9fILTNJQ0wsPftUsPkdLrhRGV9dslMzE",
  authDomain: "osls-644fd.firebaseapp.com",
  databaseURL: "https://osls-644fd-default-rtdb.firebaseio.com",
  projectId: "osls-644fd",
  storageBucket: "osls-644fd.appspot.com",
  messagingSenderId: "798578046321",
  appId: "1:798578046321:web:8758776701786a2fccf2d0",
  measurementId: "G-9HWXNSBE1T"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db   = firebase.database();
const auth = firebase.auth();

window.db = db; // expose for modules

const adminAppDiv = document.getElementById("adminApp");

let currentUid  = null;
let currentRole = ROLES.ME;

/* ------------------------------------------------------------------------
   Auth guard + profile bootstrap
   ------------------------------------------------------------------------ */
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }
  currentUid = user.uid;
  window.currentUid = currentUid; // expose globally

  const snap = await db.ref("users/" + user.uid).get();
  const prof = snap.val() || {
    role: ROLES.ME,
    name: user.displayName || user.email,
    email: user.email,
  };

  currentRole = (prof.role || ROLES.ME).toLowerCase();
  window.currentRole = currentRole;

  // ensure profile exists / normalized
  await db.ref("users/" + user.uid).update(prof);

  document.getElementById("logoutBtn")?.addEventListener("click", () => auth.signOut());

  await renderAdminApp();
});

/* ------------------------------------------------------------------------
   Permission helpers (legacy; modules use own asserts)
   ------------------------------------------------------------------------ */
function assertEdit() {
  if (!window.canEdit || !window.canEdit(currentRole)) throw "PERM_DENIED_EDIT";
}
function assertDelete() {
  if (!window.canDelete || !window.canDelete(currentRole)) throw "PERM_DENIED_DELETE";
}

/* ------------------------------------------------------------------------
   Main render
   ------------------------------------------------------------------------ */
async function renderAdminApp() {
  adminAppDiv.innerHTML = "<div>Loading data…</div>";

  // Fetch everything needed
  const [
    storesSnap,
    usersSnap,
    reviewsSnap,
    guestSnap,
    guestFormsSnap,
    salesSnap
  ] = await Promise.all([
    db.ref("stores").get(),
    db.ref("users").get(),
    db.ref("reviews").get(),
    db.ref("guestinfo").get(),
    db.ref("guestEntries").get(), // Step-1 QR submissions
    db.ref("sales").get()
  ]);

  const stores     = storesSnap.val()     || {};
  const users      = usersSnap.val()      || {};
  const reviews    = reviewsSnap.val()    || {};
  const guestinfo  = guestSnap.val()      || {};
  const guestForms = guestFormsSnap.val() || {};
  const sales      = salesSnap.val()      || {};

  /* ---------------------------------------------------------------
     Build each section's HTML in requested order
     --------------------------------------------------------------- */

  // 1) Guest Form Submissions
  const guestFormsHtml = window.guestforms?.renderGuestFormsSection
    ? window.guestforms.renderGuestFormsSection(guestForms, currentRole)
    : `<section class="admin-section guest-forms-section"><h2>Guest Form Submissions</h2><p class="text-center">Module not loaded.</p></section>`;

  // 2) Guest Info (role-filtered in module)
  const guestinfoHtml = window.guestinfo?.renderGuestinfoSection
    ? window.guestinfo.renderGuestinfoSection(guestinfo, users, currentUid, currentRole)
    : `<section class="admin-section guestinfo-section"><h2>Guest Info</h2><p class="text-center">Module not loaded.</p></section>`;

  // 3) Stores (hidden for ME)
  const storesHtml = (currentRole !== ROLES.ME && window.stores?.renderStoresSection)
    ? window.stores.renderStoresSection(stores, users, currentRole, sales)
    : "";

  // 4) Users
  const usersHtml = window.users?.renderUsersSection
    ? window.users.renderUsersSection(users, currentRole, currentUid)
    : `<section class="admin-section users-section"><h2>Users</h2><p class="text-center">Module not loaded.</p></section>`;

  // 5) Reviews
  const reviewsHtml = window.reviews?.renderReviewsSection
    ? window.reviews.renderReviewsSection(reviews, currentRole, users, currentUid)
    : `<section class="admin-section reviews-section"><h2>Reviews</h2><p class="text-center">Module not loaded.</p></section>`;

  // 6) Role Mgmt
  const roleMgmtHtml =
    typeof window.renderRoleManagementSection === "function"
      ? window.renderRoleManagementSection(currentRole)
      : "";

  /* ---------------------------------------------------------------
     Inject into DOM
     --------------------------------------------------------------- */
  adminAppDiv.innerHTML = `
    ${guestFormsHtml}
    ${guestinfoHtml}
    ${storesHtml}
    ${usersHtml}
    ${reviewsHtml}
    ${roleMgmtHtml}
  `;

  /* ---------------------------------------------------------------
     Cache objects for cross-module use
     --------------------------------------------------------------- */
  // Reviews cache used by review filter handlers
  if (window.reviews?.filterReviewsByRole) {
    window._filteredReviews = Object.entries(
      window.reviews.filterReviewsByRole(reviews, users, currentUid, currentRole)
    ).sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));
  } else {
    window._filteredReviews = Object.entries(reviews).sort(
      (a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0)
    );
  }

  // Global caches (modules rely on these)
  window._users     = users;
  window._stores    = stores;
  window._guestinfo = guestinfo;
  window._sales     = sales;
  window._guestForms = guestForms; // optional; used by guestforms module
}

/* ========================================================================
   Action handlers delegated to modules
   ===================================================================== */

// Stores
window.assignTL          = (storeId, uid) => window.stores.assignTL(storeId, uid);
window.updateStoreNumber = (id, val)      => window.stores.updateStoreNumber(id, val);
window.addStore          = ()             => window.stores.addStore();
window.deleteStore       = (id)           => window.stores.deleteStore(id);

// Users
window.assignLeadToGuest = (guestUid, leadUid) => window.users.assignLeadToGuest(guestUid, leadUid);
window.assignDMToLead    = (leadUid, dmUid)    => window.users.assignDMToLead(leadUid, dmUid);
window.editUserStore     = async (uid)         => {
  if (window.users?.editUserStore) return window.users.editUserStore(uid);
};

// Reviews
window.toggleStar   = (id, starred) => window.reviews.toggleStar(id, starred);
window.deleteReview = (id)          => window.reviews.deleteReview(id);

// Review filters
window.filterReviewsByStore = (store) => {
  const filtered = window._filteredReviews.filter(([, r]) => r.store === store);
  document.querySelector(".reviews-container").innerHTML =
    window.reviews.reviewsToHtml(filtered);
};
window.filterReviewsByAssociate = (name) => {
  const filtered = window._filteredReviews.filter(([, r]) => r.associate === name);
  document.querySelector(".reviews-container").innerHTML =
    window.reviews.reviewsToHtml(filtered);
};
window.clearReviewFilter = () => {
  document.querySelector(".reviews-container").innerHTML =
    window.reviews.reviewsToHtml(window._filteredReviews);
};

// Guest Form submissions actions
window.deleteGuestFormEntry     = (id) => window.guestforms.deleteGuestFormEntry(id);
window.continueGuestFormToGuest = (id) => window.guestforms.continueToGuestInfo(id);