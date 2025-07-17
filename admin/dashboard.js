/* ========================================================================
   Dashboard Main Script (Realtime)
   Order: Guest Form Submissions → Guest Info → Stores → Users → Reviews → Role Mgmt
   ===================================================================== */

const ROLES = window.ROLES || { ME: "me", LEAD: "lead", DM: "dm", ADMIN: "admin" };

/* ------------------------------------------------------------------------
   Firebase Init (guarded)
   ------------------------------------------------------------------------ */
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
window.db  = db; // expose for modules

/* ------------------------------------------------------------------------
   DOM refs
   ------------------------------------------------------------------------ */
const adminAppDiv = document.getElementById("adminApp");

/* ------------------------------------------------------------------------
   Session globals
   ------------------------------------------------------------------------ */
let currentUid      = null;
let currentRole     = ROLES.ME;
let _initialLoaded  = false;
let _rtBound        = false;
let _rtRerenderTO   = null;   // throttle timer for realtime refresh

/* Live caches (used by all modules, kept in window for convenience) */
window._stores     = window._stores     || {};
window._users      = window._users      || {};
window._reviews    = window._reviews    || {};
window._guestinfo  = window._guestinfo  || {};
window._guestForms = window._guestForms || {};
window._sales      = window._sales      || {};

/* ------------------------------------------------------------------------
   Auth guard + profile bootstrap
   ------------------------------------------------------------------------ */
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  currentUid = user.uid;
  window.currentUid = currentUid;

  // get or seed profile
  const snap = await db.ref("users/" + user.uid).get();
  const prof = snap.val() || {
    role: ROLES.ME,
    name: user.displayName || user.email,
    email: user.email,
  };
  currentRole = (prof.role || ROLES.ME).toLowerCase();
  window.currentRole = currentRole;

  // ensure existence / normalization
  await db.ref("users/" + user.uid).update(prof);

  document.getElementById("logoutBtn")?.addEventListener("click", () => auth.signOut());

  // initial load + realtime bind
  await initialLoad();
  ensureRealtime();              // attach all listeners
  window.guestforms?.ensureRealtime?.(); // module-specific (safe if double-bound)
});

/* ========================================================================
   INITIAL LOAD
   Fetch once, fill caches, render.
   ===================================================================== */
async function initialLoad() {
  adminAppDiv.innerHTML = "<div>Loading data…</div>";

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

  window._stores     = storesSnap.val()     || {};
  window._users      = usersSnap.val()      || {};
  window._reviews    = reviewsSnap.val()    || {};
  window._guestinfo  = guestSnap.val()      || {};
  window._guestForms = guestFormsSnap.val() || {};
  window._sales      = salesSnap.val()      || {};

  _initialLoaded = true;
  renderAdminApp(); // from cache
}

/* ========================================================================
   RENDER (from current caches)
   ===================================================================== */
function renderAdminApp() {
  if (!_initialLoaded) return; // guard; initial load will render when ready

  const stores     = window._stores;
  const users      = window._users;
  const reviews    = window._reviews;
  const guestinfo  = window._guestinfo;
  const guestForms = window._guestForms;
  const sales      = window._sales;

  /* ---------------------------------------------------------------
     Build each section's HTML in requested order
     --------------------------------------------------------------- */

  // 1) Guest Form Submissions
  const guestFormsHtml = window.guestforms?.renderGuestFormsSection
    ? window.guestforms.renderGuestFormsSection(guestForms, currentRole, currentUid)
    : `<section id="guest-forms-section" class="admin-section guest-forms-section"><h2>Guest Form Submissions</h2><p class="text-center">Module not loaded.</p></section>`;

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
     Build review cache for filters (role-filtered if module provides)
     --------------------------------------------------------------- */
  if (window.reviews?.filterReviewsByRole) {
    window._filteredReviews = Object.entries(
      window.reviews.filterReviewsByRole(reviews, users, currentUid, currentRole)
    ).sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));
  } else {
    window._filteredReviews = Object.entries(reviews).sort(
      (a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0)
    );
  }
}

/* ========================================================================
   REALTIME BIND
   Attaches listeners once; updates caches; throttled re-render.
   ===================================================================== */
function ensureRealtime() {
  if (_rtBound) return;
  _rtBound = true;

  /* throttle re-render calls so bursts of updates don't spam DOM */
  function scheduleRealtimeRender() {
    if (_rtRerenderTO) return;
    _rtRerenderTO = setTimeout(() => {
      _rtRerenderTO = null;
      renderAdminApp();
    }, 100); // 100ms batch window
  }

  /* ---------- STORES ---------- */
  const storesRef = db.ref("stores");
  storesRef.on("child_added", snap => {
    window._stores[snap.key] = snap.val();
    scheduleRealtimeRender();
  });
  storesRef.on("child_changed", snap => {
    window._stores[snap.key] = snap.val();
    scheduleRealtimeRender();
  });
  storesRef.on("child_removed", snap => {
    delete window._stores[snap.key];
    scheduleRealtimeRender();
  });

  /* ---------- USERS ---------- */
  const usersRef = db.ref("users");
  usersRef.on("child_added", snap => {
    window._users[snap.key] = snap.val();
    scheduleRealtimeRender();
  });
  usersRef.on("child_changed", snap => {
    window._users[snap.key] = snap.val();
    // if my own role changed, update currentRole & security view
    if (snap.key === currentUid) {
      currentRole = (snap.val()?.role || ROLES.ME).toLowerCase();
      window.currentRole = currentRole;
    }
    scheduleRealtimeRender();
  });
  usersRef.on("child_removed", snap => {
    delete window._users[snap.key];
    scheduleRealtimeRender();
  });

  /* ---------- REVIEWS ---------- */
  const reviewsRef = db.ref("reviews");
  reviewsRef.on("child_added", snap => {
    window._reviews[snap.key] = snap.val();
    scheduleRealtimeRender();
  });
  reviewsRef.on("child_changed", snap => {
    window._reviews[snap.key] = snap.val();
    scheduleRealtimeRender();
  });
  reviewsRef.on("child_removed", snap => {
    delete window._reviews[snap.key];
    scheduleRealtimeRender();
  });

  /* ---------- GUEST INFO ---------- */
  const giRef = db.ref("guestinfo");
  giRef.on("child_added", snap => {
    window._guestinfo[snap.key] = snap.val();
    scheduleRealtimeRender();
  });
  giRef.on("child_changed", snap => {
    window._guestinfo[snap.key] = snap.val();
    scheduleRealtimeRender();
  });
  giRef.on("child_removed", snap => {
    delete window._guestinfo[snap.key];
    scheduleRealtimeRender();
  });

  /* ---------- GUEST ENTRIES (Step 1 forms) ----------
     guestforms.js also binds, but we want caches fresh regardless
  --------------------------------------------------- */
  const gfRef = db.ref("guestEntries");
  gfRef.on("child_added", snap => {
    window._guestForms[snap.key] = snap.val();
    scheduleRealtimeRender();
  });
  gfRef.on("child_changed", snap => {
    window._guestForms[snap.key] = snap.val();
    scheduleRealtimeRender();
  });
  gfRef.on("child_removed", snap => {
    delete window._guestForms[snap.key];
    scheduleRealtimeRender();
  });

  /* ---------- SALES ---------- */
  const salesRef = db.ref("sales");
  salesRef.on("child_added", snap => {
    window._sales[snap.key] = snap.val();
    scheduleRealtimeRender();
  });
  salesRef.on("child_changed", snap => {
    window._sales[snap.key] = snap.val();
    scheduleRealtimeRender();
  });
  salesRef.on("child_removed", snap => {
    delete window._sales[snap.key];
    scheduleRealtimeRender();
  });
}

/* ========================================================================
   Action handlers delegated to modules
   (unchanged; modules perform writes; realtime will refresh view)
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

// Review filters (operate on window._filteredReviews built in render)
window.filterReviewsByStore = (store) => {
  const filtered = window._filteredReviews.filter(([, r]) => r.store === store);
  const el = document.querySelector(".reviews-container");
  if (el) el.innerHTML = window.reviews.reviewsToHtml(filtered);
};
window.filterReviewsByAssociate = (name) => {
  const filtered = window._filteredReviews.filter(([, r]) => r.associate === name);
  const el = document.querySelector(".reviews-container");
  if (el) el.innerHTML = window.reviews.reviewsToHtml(filtered);
};
window.clearReviewFilter = () => {
  const el = document.querySelector(".reviews-container");
  if (el) el.innerHTML = window.reviews.reviewsToHtml(window._filteredReviews);
};

// Guest Form submissions actions
window.deleteGuestFormEntry     = (id) => window.guestforms.deleteGuestFormEntry(id);
window.continueGuestFormToGuest = (id) => window.guestforms.continueToGuestInfo(id);

/* ------------------------------------------------------------------------
   Expose render for modules that call window.renderAdminApp()
   ------------------------------------------------------------------------ */
window.renderAdminApp = renderAdminApp;