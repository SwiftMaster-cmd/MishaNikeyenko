/* ========================================================================
   Firebase Init
   ===================================================================== */
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
const db   = firebase.database();
const auth = firebase.auth();

window.db = db; // expose for modules

const adminAppDiv = document.getElementById("adminApp");

/* ========================================================================
   RBAC helpers
   ===================================================================== */
const ROLES = { ME: "me", LEAD: "lead", DM: "dm", ADMIN: "admin" };
let currentUid  = null;
let currentRole = ROLES.ME;

const canEdit   = r => r !== ROLES.ME;
const canDelete = r => r === ROLES.DM || r === ROLES.ADMIN;

function assertEdit()   { if (!canEdit(currentRole))   throw "PERM_DENIED_EDIT"; }
function assertDelete() { if (!canDelete(currentRole)) throw "PERM_DENIED_DELETE"; }

const roleBadge = r => `<span class="role-badge role-${r}">${r.toUpperCase()}</span>`;

/* ========================================================================
   Auth flow
   ===================================================================== */
auth.onAuthStateChanged(async user => {
  if (!user) { window.location.href = "index.html"; return; }

  currentUid = user.uid;
  const snap = await db.ref("users/"+user.uid).get();
  const prof = snap.val() || {
    role : ROLES.ME,
    name : user.displayName || user.email,
    email: user.email
  };
  await db.ref("users/"+user.uid).update(prof);

  currentRole = prof.role || ROLES.ME;
  window.currentRole = currentRole; // for all modules

  document.getElementById("logoutBtn")?.addEventListener("click", () => auth.signOut());

  renderAdminApp();
});

/* ========================================================================
   Main render
   ===================================================================== */
async function renderAdminApp() {
  adminAppDiv.innerHTML = "<div>Loading data…</div>";

  const [storesSnap, usersSnap, reviewsSnap, guestSnap] = await Promise.all([
    db.ref("stores").get(),
    db.ref("users").get(),
    db.ref("reviews").get(),
    db.ref("guestinfo").get()
  ]);

  const stores    = storesSnap.val()  || {};
  const users     = usersSnap.val()   || {};
  const reviews   = reviewsSnap.val() || {};
  const guestinfo = guestSnap.val()   || {};

  // Delegate stores rendering
  const storesHtml = window.stores?.renderStoresSection
    ? window.stores.renderStoresSection(stores, users, currentRole)
    : `<p class="text-center">Stores module not loaded.</p>`;

  // Delegate users rendering
  const usersHtml = window.users?.renderUsersSection
    ? window.users.renderUsersSection(users, currentRole)
    : `<p class="text-center">Users module not loaded.</p>`;

  // Delegate reviews rendering
  const reviewsHtml = window.reviews?.renderReviewsSection
    ? window.reviews.renderReviewsSection(reviews, currentRole)
    : `<p class="text-center">Reviews module not loaded.</p>`;

  // Delegate guest info rendering
  const guestinfoHtml = window.guestinfo?.renderGuestinfoSection
    ? window.guestinfo.renderGuestinfoSection(guestinfo, users)
    : `<p class="text-center">Guest Info module not loaded.</p>`;

  adminAppDiv.innerHTML = `
    ${storesHtml}

    ${usersHtml}

    ${reviewsHtml}

    ${guestinfoHtml}
  `;

  // cache for filters and global data
  window._allReviews     = Object.entries(reviews).sort((a,b)=>(b[1].timestamp||0)-(a[1].timestamp||0));
  window._allReviewsHtml = reviewsHtml;
  window._users          = users;
  window._stores         = stores;
}

/* ========================================================================
   Action handlers (RBAC enforced)
   ===================================================================== */
// Store action delegation
window.assignTL         = (storeId, uid) => window.stores.assignTL(storeId, uid);
window.updateStoreNumber= (id, val)     => window.stores.updateStoreNumber(id, val);
window.addStore         = ()             => window.stores.addStore();
window.deleteStore      = (id)           => window.stores.deleteStore(id);

// User action delegation
window.assignLeadToGuest= (guestUid, leadUid) => window.users.assignLeadToGuest(guestUid, leadUid);
window.assignDMToLead   = (leadUid, dmUid)    => window.users.assignDMToLead(leadUid, dmUid);

// Review action delegation
window.toggleStar       = (id, starred) => window.reviews.toggleStar(id, starred);
window.deleteReview     = (id)           => window.reviews.deleteReview(id);

// User store edit delegated to users.js if exists
window.editUserStore    = async uid => {
  if(window.users?.editUserStore) return window.users.editUserStore(uid);
  // fallback: could add store editing here if desired
};

// Review filters delegated to reviews.js helpers
window.filterReviewsByStore     = store  => document.querySelector(".reviews-container").innerHTML = window.reviews.reviewsToHtml(window._allReviews.filter(([,r])=>r.store===store));
window.filterReviewsByAssociate = name   => document.querySelector(".reviews-container").innerHTML = window.reviews.reviewsToHtml(window._allReviews.filter(([,r])=>r.associate===name));
window.clearReviewFilter        = ()     => document.querySelector(".reviews-container").innerHTML = window._allReviewsHtml;