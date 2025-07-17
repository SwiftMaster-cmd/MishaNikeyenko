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
   CAUGHT-UP HELPERS
   ------------------------------------------------------------------------
   We replicate the *visibility + timeframe* logic used in the modules
   (lightweight versions) so we can decide whether to consolidate the
   Guest Forms + Guest Info sections into a single "Caught Up" card.
   ===================================================================== */

/* -- role helpers -- */
const _isAdmin = r => r === ROLES.ADMIN;
const _isDM    = r => r === ROLES.DM;
const _isLead  = r => r === ROLES.LEAD;
const _isMe    = r => r === ROLES.ME;

/* -- guestforms advanced status (hide proposal/sold) -- */
function _gfAdvancedStatus(g){
  const s = (g?.status || "").toLowerCase();
  return s === "proposal" || s === "sold";
}

/* timeframe: start/end of today */
function _startOfTodayMs(){ const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); }
function _endOfTodayMs(){ const d = new Date(); d.setHours(23,59,59,999); return d.getTime(); }

/* guestinfo week filter: rolling 7 days by latest activity */
function _giLatestTs(g){
  return Math.max(g.updatedAt||0, g.submittedAt||0, g.sale?.soldAt||0, g.solution?.completedAt||0);
}
function _giInCurrentWeek(g){ return _giLatestTs(g) >= (Date.now() - 7*24*60*60*1000); }

/* guestinfo status detect */
function _giDetectStatus(g){
  if (g.status) return g.status.toLowerCase();
  if (g.sale) return "sold";
  if (g.solution) return "proposal";
  if (g.evaluate) return "working";
  return "new";
}

/* Visible guestforms count after role + today/all filter */
function _guestFormsVisibleCount(guestForms, guestinfo, role, uid){
  if (!guestForms) return 0;
  const showAll = !!window._guestforms_showAll;  // global from module
  const startToday = _startOfTodayMs();
  const endToday   = _endOfTodayMs();

  let count = 0;
  for (const [,f] of Object.entries(guestForms)){
    // skip if advanced (proposal/sold)
    if (f.guestinfoKey){
      const g = guestinfo?.[f.guestinfoKey];
      if (_gfAdvancedStatus(g)) continue;
    }

    // role visibility
    if (_isAdmin(role) || _isDM(role)){
      /* see all */
    } else {
      const claimedBy = f.consumedBy || f.claimedBy;
      if (claimedBy && claimedBy !== uid){
        // hidden from me/lead
        continue;
      }
      // leads could see their MEs? module currently shows only unclaimed+self, so same.
    }

    // timeframe filter
    if (!showAll){
      const ts = f.timestamp || 0;
      if (ts < startToday || ts > endToday) continue;
    }

    count++;
  }
  return count;
}

/* Visible actionable guestinfo count (new+working+proposal) respecting filters */
function _guestInfoActionableCount(guestinfo, users, role, uid){
  if (!guestinfo) return 0;

  // if user is in Sales Only or Follow Ups mode, we do *not* collapse; treat as not caught
  if (window._guestinfo_soldOnly || window._guestinfo_showProposals) return 1; // non-zero so we don't auto-collapse

  // ME locked to week filter; others per global
  const weekFilter = _isMe(role) ? true : (window._guestinfo_filterMode === "week");

  let count = 0;

  // apply role visibility
  for (const [,g] of Object.entries(guestinfo)){
    // role gating
    if (_isAdmin(role)) {
      /* all ok */
    } else if (_isDM(role)) {
      // DM sees own + assigned tree
      const under = _giUsersUnderDM(users, uid); // we'll build helper below
      under.add(uid);
      if (!under.has(g.userUid)) continue;
    } else if (_isLead(role)) {
      const mesUnderLead = Object.entries(users)
        .filter(([, u]) => u.role === ROLES.ME && u.assignedLead === uid)
        .map(([id]) => id);
      const visible = new Set([...mesUnderLead, uid]);
      if (!visible.has(g.userUid)) continue;
    } else if (_isMe(role)) {
      if (g.userUid !== uid) continue;
    }

    // timeframe
    if (weekFilter && !_giInCurrentWeek(g)) continue;

    // status
    const st = _giDetectStatus(g);
    if (st === "sold") continue; // not actionable
    // we *do* count proposal because default view collapses those; we want them
    // included in "caught up" check; you asked: if no new, no working, and no proposals -> caught up
    if (st === "proposal" || st === "working" || st === "new"){
      count++;
    }
  }

  return count;
}

/* Build DM under-user set (helper above used) */
function _giUsersUnderDM(users, dmUid){
  const leads = Object.entries(users||{})
    .filter(([,u])=>u.role===ROLES.LEAD && u.assignedDM===dmUid)
    .map(([id])=>id);
  const mes = Object.entries(users||{})
    .filter(([,u])=>u.role===ROLES.ME && leads.includes(u.assignedLead))
    .map(([id])=>id);
  return new Set([...leads,...mes]);
}

/* Unified caught-up HTML */
function _caughtUpUnifiedHtml(msg="You're all caught up!"){
  return `
    <section class="admin-section guest-caughtup-section" id="guest-caughtup-section">
      <h2>Guest Queue</h2>
      <div class="guestinfo-empty-all text-center" style="margin-top:16px;">
        <p><b>${msg}</b></p>
        <p style="opacity:.8;">No open guest forms or leads right now.</p>
        <button class="btn btn-success btn-lg" onclick="window.guestinfo.createNewLead()">+ New Lead</button>
      </div>
    </section>`;
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
     Evaluate caught-up statuses BEFORE rendering sections
     --------------------------------------------------------------- */
  const gfVisibleCount = _guestFormsVisibleCount(guestForms, guestinfo, currentRole, currentUid);
  const giActionableCount = _guestInfoActionableCount(guestinfo, users, currentRole, currentUid);
  const bothCaught = (gfVisibleCount === 0) && (giActionableCount === 0);

  /* ---------------------------------------------------------------
     Build each section's HTML in requested order
     --------------------------------------------------------------- */

  let guestFormsHtml = "";
  let guestinfoHtml  = "";

  if (bothCaught) {
    // Single consolidated card; suppress individual sections
    guestFormsHtml = _caughtUpUnifiedHtml();
    guestinfoHtml  = ""; // skip
  } else {
    // 1) Guest Form Submissions
    guestFormsHtml = window.guestforms?.renderGuestFormsSection
      ? window.guestforms.renderGuestFormsSection(guestForms, currentRole, currentUid)
      : `<section id="guest-forms-section" class="admin-section guest-forms-section"><h2>Guest Form Submissions</h2><p class="text-center">Module not loaded.</p></section>`;

    // 2) Guest Info
    guestinfoHtml = window.guestinfo?.renderGuestinfoSection
      ? window.guestinfo.renderGuestinfoSection(guestinfo, users, currentUid, currentRole)
      : `<section class="admin-section guestinfo-section"><h2>Guest Info</h2><p class="text-center">Module not loaded.</p></section>`;
  }

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