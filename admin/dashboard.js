/* ========================================================================
   Dashboard Main Script
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
firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const auth = firebase.auth();

window.db = db; // expose for modules

const adminAppDiv = document.getElementById("adminApp");

let currentUid = null;
let currentRole = ROLES.ME;

auth.onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }
  currentUid = user.uid;
  const snap = await db.ref("users/" + user.uid).get();
  const prof = snap.val() || {
    role: ROLES.ME,
    name: user.displayName || user.email,
    email: user.email,
  };
  currentRole = (prof.role || ROLES.ME).toLowerCase();
  window.currentRole = currentRole;

  await db.ref("users/" + user.uid).update(prof);

  document.getElementById("logoutBtn")?.addEventListener("click", () => auth.signOut());

  await renderAdminApp();
});

function assertEdit() {
  if (!window.canEdit || !window.canEdit(currentRole)) throw "PERM_DENIED_EDIT";
}
function assertDelete() {
  if (!window.canDelete || !window.canDelete(currentRole)) throw "PERM_DENIED_DELETE";
}

async function renderAdminApp() {
  adminAppDiv.innerHTML = "<div>Loading data…</div>";

  const [storesSnap, usersSnap, reviewsSnap, guestSnap] = await Promise.all([
    db.ref("stores").get(),
    db.ref("users").get(),
    db.ref("reviews").get(),
    db.ref("guestinfo").get(),
  ]);

  const stores = storesSnap.val() || {};
  const users = usersSnap.val() || {};
  const reviews = reviewsSnap.val() || {};
  const guestinfo = guestSnap.val() || {};

  const storesHtml = window.stores?.renderStoresSection
    ? window.stores.renderStoresSection(stores, users, currentRole)
    : `<p class="text-center">Stores module not loaded.</p>`;

  const usersHtml = window.users?.renderUsersSection
    ? window.users.renderUsersSection(users, currentRole, currentUid)
    : `<p class="text-center">Users module not loaded.</p>`;

  const reviewsHtml = window.reviews?.renderReviewsSection
    ? window.reviews.renderReviewsSection(reviews, currentRole)
    : `<p class="text-center">Reviews module not loaded.</p>`;

  const guestinfoHtml = window.guestinfo?.renderGuestinfoSection
    ? window.guestinfo.renderGuestinfoSection(guestinfo, users)
    : `<p class="text-center">Guest Info module not loaded.</p>`;

  const roleMgmtHtml =
    typeof window.renderRoleManagementSection === "function"
      ? window.renderRoleManagementSection(currentRole)
      : "";

  adminAppDiv.innerHTML = `
    ${storesHtml}
    ${usersHtml}
    ${reviewsHtml}
    ${guestinfoHtml}
    ${roleMgmtHtml}
  `;

  // Cache for filters and globals
  window._allReviews = Object.entries(reviews).sort(
    (a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0)
  );
  window._allReviewsHtml = reviewsHtml;
  window._users = users;
  window._stores = stores;
}

/* ========================================================================
   Action handlers delegated to modules
   ===================================================================== */

// Stores
window.assignTL = (storeId, uid) => window.stores.assignTL(storeId, uid);
window.updateStoreNumber = (id, val) => window.stores.updateStoreNumber(id, val);
window.addStore = () => window.stores.addStore();
window.deleteStore = (id) => window.stores.deleteStore(id);

// Users
window.assignLeadToGuest = (guestUid, leadUid) => window.users.assignLeadToGuest(guestUid, leadUid);
window.assignDMToLead = (leadUid, dmUid) => window.users.assignDMToLead(leadUid, dmUid);
window.editUserStore = async (uid) => {
  if (window.users?.editUserStore) return window.users.editUserStore(uid);
};

// Reviews
window.toggleStar = (id, starred) => window.reviews.toggleStar(id, starred);
window.deleteReview = (id) => window.reviews.deleteReview(id);

// Review filters
window.filterReviewsByStore = (store) =>
  (document.querySelector(".reviews-container").innerHTML = window.reviews.reviewsToHtml(
    window._allReviews.filter(([, r]) => r.store === store)
  ));
window.filterReviewsByAssociate = (name) =>
  (document.querySelector(".reviews-container").innerHTML = window.reviews.reviewsToHtml(
    window._allReviews.filter(([, r]) => r.associate === name)
  ));
window.clearReviewFilter = () => (document.querySelector(".reviews-container").innerHTML = window._allReviewsHtml);