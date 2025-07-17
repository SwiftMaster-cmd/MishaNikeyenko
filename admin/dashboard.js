/* ========================================================================
   Dashboard Main Script (Realtime, Enhanced Highlights)
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
   Global UI flags
   ------------------------------------------------------------------------ */
if (typeof window._allGoodExpanded === "undefined") window._allGoodExpanded = false;

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
   HELPER: Date
   ===================================================================== */
function _monthStartMs(){
  const d = new Date();
  d.setDate(1);
  d.setHours(0,0,0,0);
  return d.getTime();
}

/* ========================================================================
   PERFORMANCE STATUS CALC
   ------------------------------------------------------------------------
   Returns:
     {
       ratingsGood, staffingGood, budgetGood,
       avgRating, ratingsCount,
       staffTotal, staffGoalTotal,
       budgetUnits, budgetGoal,
       storesStatus: {
          [storeId]: {
             ratingAvg, ratingCount,
             staffCount, staffGoal,
             budgetUnits, budgetGoal,
             ratingGood, staffGood, budgetGood
          }
       }
     }
   --------------------------------------------------------------------- */
const RATING_THRESH = 4.7; // inclusive
const DEFAULT_STORE_STAFF_GOAL = 2; // (TL + ME) minimum

function _computePerformanceStatus(stores, sales, users, reviews, role){
  const storesObj = stores || {};
  const usersObj  = users  || {};
  const reviewsObj= reviews|| {};
  const salesObj  = sales  || {};

  // map storeNumber -> storeId
  const idByNum = {};
  for (const [sid,s] of Object.entries(storesObj)){
    const sn = (s.storeNumber??"").toString().trim();
    if (sn) idByNum[sn] = sid;
  }

  /* --- Ratings by storeNumber --- */
  const ratingAgg = {}; // sn -> {sum,count}
  for (const [,r] of Object.entries(reviewsObj)){
    const sn = (r.store||"").toString().trim();
    if (!sn) continue;
    if (!ratingAgg[sn]) ratingAgg[sn]={sum:0,count:0};
    ratingAgg[sn].sum += Number(r.rating||0);
    ratingAgg[sn].count += 1;
  }

  /* --- Staffing by storeId: count leads+mes, choose goal --- */
  const storeStaffCounts = {}; // sid -> {leads,mes}
  for (const [sid,s] of Object.entries(storesObj)){
    storeStaffCounts[sid]={leads:0,mes:0};
  }
  // count leads + mes by user assignment (direct store match or teamLead link)
  for (const [uid,u] of Object.entries(usersObj)){
    const r = (u.role||"").toLowerCase();
    const sn = (u.store??"").toString().trim();
    // direct store match
    if (sn && idByNum[sn]){
      const sid = idByNum[sn];
      if (r===ROLES.LEAD) storeStaffCounts[sid].leads++;
      else if (r===ROLES.ME) storeStaffCounts[sid].mes++;
    }
    // fallback: user is TL for store (teamLeadUid field)
    if (r===ROLES.LEAD || r===ROLES.DM){
      for (const [sid,s] of Object.entries(storesObj)){
        if (s.teamLeadUid === uid){
          if (r===ROLES.LEAD) storeStaffCounts[sid].leads++;
          // DM isn't counted toward store staffing unless explicitly stored
        }
      }
    }
  }

  /* --- Budget (MTD sales units) by storeNumber --- */
  let salesMtdByStore;
  if (window.stores?.summarizeSalesByStoreMTD){
    salesMtdByStore = window.stores.summarizeSalesByStoreMTD(salesObj, storesObj, window._guestinfo, usersObj);
  } else {
    // fallback minimal MTD aggregator
    const out={};
    const ms = _monthStartMs();
    for (const [,s] of Object.entries(salesObj)){
      const ts = s.createdAt || s.soldAt || 0;
      if (ts < ms) continue;
      const sn = (s.storeNumber??"").toString().trim() || "__UNASSIGNED__";
      if (!out[sn]) out[sn]={units:0,count:0};
      out[sn].units += Number(s.units||0);
      out[sn].count += 1;
    }
    salesMtdByStore = out;
  }

  /* --- Build per-store status --- */
  const storesStatus = {};
  let totalRatingSum=0,totalRatingCount=0;
  let staffTotal=0,staffGoalTotal=0;
  let budgetUnits=0,budgetGoal=0;

  for (const [sid,s] of Object.entries(storesObj)){
    const sn = (s.storeNumber??"").toString().trim();
    const rAgg = ratingAgg[sn];
    const ratingAvg = rAgg ? (rAgg.sum / rAgg.count) : null;
    const ratingCount = rAgg ? rAgg.count : 0;
    const ratingGood = ratingAvg!=null ? (ratingAvg >= RATING_THRESH) : true; // no reviews => neutral/good

    const staffC = storeStaffCounts[sid] || {leads:0,mes:0};
    const staffCount = staffC.leads + staffC.mes;
    const staffGoal = Number(s.staffingGoal ?? DEFAULT_STORE_STAFF_GOAL);
    const staffGood = staffCount >= staffGoal;

    const budGoal = Number(s.budgetUnits||0);
    const budMtd  = salesMtdByStore?.[sn]?.units || 0;
    const budgetGood = !budGoal || budMtd >= budGoal;

    storesStatus[sid] = {
      ratingAvg, ratingCount, ratingGood,
      staffCount, staffGoal, staffGood,
      budgetUnits: budMtd, budgetGoal: budGoal, budgetGood
    };

    if (ratingAvg!=null){ totalRatingSum+=ratingAvg; totalRatingCount++; }
    staffTotal     += staffCount;
    staffGoalTotal += staffGoal;
    budgetUnits    += budMtd;
    budgetGoal     += budGoal;
  }

  // aggregate rating: weighted by #reviews across stores
  let aggRating = null;
  let totalReviewSum = 0;
  let totalReviewCnt = 0;
  for (const [,r] of Object.entries(reviewsObj)){
    const rating = Number(r.rating||0);
    if (rating){
      totalReviewSum += rating;
      totalReviewCnt += 1;
    }
  }
  if (totalReviewCnt) aggRating = totalReviewSum / totalReviewCnt;

  // top-level pass/fail (skip for MEs)
  const ratingsGood  = aggRating==null ? true : (aggRating >= RATING_THRESH);
  const staffingGood = (role === ROLES.ME) ? true : (staffTotal >= staffGoalTotal);
  const budgetGood   = (role === ROLES.ME) ? true : (!budgetGoal || budgetUnits >= budgetGoal);

  return {
    ratingsGood,
    staffingGood,
    budgetGood,
    avgRating: aggRating,
    ratingsCount: totalReviewCnt,
    staffTotal,
    staffGoalTotal,
    budgetUnits,
    budgetGoal,
    storesStatus
  };
}
window._computePerformanceStatus = _computePerformanceStatus; // expose for other modules

/* ========================================================================
   GUEST "CAUGHT UP" DETECTORS
   ===================================================================== */
function _isGuestFormsCaughtUp(formsObj, guestinfoObj, role, uid){
  // If guestforms module exports a visibility util, use it
  if (window.guestforms?.visibleFormsForRole){
    const vis = window.guestforms.visibleFormsForRole(formsObj, role, uid);
    // that util already removes advanced statuses; just test length
    return !Object.keys(vis).length;
  }

  // fallback: naive -- hide if every form is linked to a guestinfo that
  // is proposal/sold
  for (const [,f] of Object.entries(formsObj||{})){
    const gid = f.guestinfoKey;
    if (gid){
      const g = guestinfoObj[gid];
      if (!g) continue;
      const st = (g.status||"").toLowerCase();
      if (st !== "proposal" && st !== "sold") return false;
    }else{
      return false; // unclaimed form
    }
  }
  return true;
}

function _isGuestInfoCaughtUp(guestinfoObj, users, role, uid){
  // Use guestinfo module's filter (role-scoped)
  const vis = window.guestinfo?.filterGuestinfo
    ? window.guestinfo.filterGuestinfo(guestinfoObj, users, uid, role)
    : guestinfoObj;

  // Count actionable (new+working) in current timeframe filter
  const weekMode = window._guestinfo_filterMode === "week";
  const rows = Object.entries(vis).filter(([,g])=>{
    const st = (g.status||"").toLowerCase();
    if (st === "proposal" || st === "sold") return false;
    if (!weekMode) return true;
    const ts = Math.max(g.updatedAt||0, g.submittedAt||0, g.solution?.completedAt||0, g.sale?.soldAt||0);
    return ts >= Date.now() - 7*24*60*60*1000;
  });
  return rows.length === 0;
}

/* Combined */
function _allGoodStatus(role){
  const forms = window._guestForms || {};
  const guestinfo = window._guestinfo || {};
  const users = window._users || {};
  const reviews = window._reviews || {};
  const stores = window._stores || {};
  const sales  = window._sales  || {};

  const guestsCaught = _isGuestFormsCaughtUp(forms, guestinfo, role, window.currentUid) &&
                       _isGuestInfoCaughtUp(guestinfo, users, role, window.currentUid);

  const ps = _computePerformanceStatus(stores, sales, users, reviews, role);
  const perfGood = ps.ratingsGood && ps.staffingGood && ps.budgetGood;

  return {guestsCaught, perfGood, ps};
}

/* ========================================================================
   TOP CARD HTML HELPERS
   ===================================================================== */
function _caughtUpHtml(){
  return `
    <section class="admin-section guest-caughtup-section" id="guest-caughtup-section">
      <h2>Guest Queue Clear!</h2>
      <p class="text-center">No open guest forms or leads in this view.</p>
      <div class="text-center" style="margin-top:12px;">
        <button class="btn btn-success btn-sm" onclick="window.guestinfo.createNewLead()">+ New Lead</button>
      </div>
    </section>`;
}

/* Performance Highlights (no New Lead button -- per request) */
function _perfHighlightsHtml(ps, role){
  const showStores = (role !== ROLES.ME);

  // rating metric
  const rating = ps.avgRating!=null ? ps.avgRating.toFixed(1) : "–";
  const ratingCls = ps.ratingsGood ? "metric-chip success" : "metric-chip warning";

  // staffing
  const staffLbl = showStores ? `${ps.staffTotal}/${ps.staffGoalTotal||"?"}` : "";
  const staffCls = ps.staffingGood ? "metric-chip success" : "metric-chip warning";

  // budget
  const budLbl = showStores
    ? (ps.budgetGoal? `${ps.budgetUnits}/${ps.budgetGoal}u` : `${ps.budgetUnits}u`)
    : "";
  const budCls = ps.budgetGood ? "metric-chip success" : "metric-chip warning";

  return `
    <section class="admin-section perf-highlights-section" id="perf-highlights-section">
      <div class="perf-header">
        <h2>Performance Highlights</h2>
      </div>
      <div class="perf-metrics">
        <div class="${ratingCls}" title="Avg rating this week">★ ${rating}</div>
        ${showStores? `<div class="${staffCls}" title="Staffed vs goal">${staffLbl}</div>`:""}
        ${showStores? `<div class="${budCls}" title="Month-to-date units vs goal">${budLbl}</div>`:""}
      </div>
    </section>`;
}

/* Congrats / All-Good (collapsed) */
function _allGoodCongratsHtml(ps, role){
  const showStores = (role !== ROLES.ME);
  const rating  = ps.avgRating!=null ? ps.avgRating.toFixed(1) : "–";
  const staffLbl = showStores ? `${ps.staffTotal}/${ps.staffGoalTotal||"?"}` : "";
  const budLbl   = showStores
    ? (ps.budgetGoal? `${ps.budgetUnits}/${ps.budgetGoal}u` : `${ps.budgetUnits}u`)
    : "";

  const expandBtn = `
    <button class="btn btn-ghost btn-sm allgood-expand-btn"
            onclick="window.allGoodExpand()"
            title="Show details">×</button>`;

  const newLeadBtnHtml = `
    <div class="allgood-cta-wrap">
      <button class="btn btn-success btn-sm" onclick="window.guestinfo.createNewLead()">+ New Lead</button>
    </div>`;

  return `
    <section class="admin-section allgood-congrats-section" id="allgood-congrats-section">
      <div class="allgood-header">
        <h2>You're Crushing It! 🎉</h2>
        ${expandBtn}
      </div>
      <div class="allgood-metrics">
        <div class="agm agm-rating" title="Avg rating this week">★ ${rating}</div>
        ${showStores? `<div class="agm agm-staff" title="Staffed vs goal">${staffLbl}</div>`:""}
        ${showStores? `<div class="agm agm-budget" title="Month-to-date units vs goal">${budLbl}</div>`:""}
      </div>
      ${newLeadBtnHtml}
    </section>`;
}

/* Expand / collapse handlers (global) */
window.allGoodExpand = function(){
  window._allGoodExpanded = true;
  window.renderAdminApp();
};
window.allGoodCollapse = function(){
  window._allGoodExpanded = false;
  window.renderAdminApp();
};

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
   * Determine top-card & hiding rules
   * --------------------------------------------------------------- */
  const {guestsCaught, perfGood, ps} = _allGoodStatus(currentRole);

  const showCongratsCollapsed = guestsCaught && perfGood && !window._allGoodExpanded;
  const hideGuestSections     = guestsCaught && !window._allGoodExpanded;              // hide guest forms/info when caught up & collapsed
  const hidePerfSections      = perfGood && guestsCaught && !window._allGoodExpanded;  // hide perf (stores/users/reviews) when everything good & collapsed

  // Build top cards (if not hidden entirely)
  let topCardsHtml = "";
  if (showCongratsCollapsed){
    // Single combined card
    topCardsHtml = _allGoodCongratsHtml(ps, currentRole);
  } else {
    // Expanded OR partial-good states
    const showCaughtCard = guestsCaught;
    const showPerfCard   = perfGood;
    const collapseBtn = (guestsCaught && perfGood && window._allGoodExpanded)
      ? `<div class="allgood-collapse-fab"><button class="btn btn-ghost btn-sm" onclick="window.allGoodCollapse()" title="Collapse highlights">Collapse</button></div>`
      : "";
    topCardsHtml = `
      ${collapseBtn}
      ${showCaughtCard ? _caughtUpHtml() : ""}
      ${showPerfCard   ? _perfHighlightsHtml(ps, currentRole) : ""}
    `;
  }

  /* ---------------------------------------------------------------
     Build each module section's HTML (may be hidden)
     --------------------------------------------------------------- */

  // 1) Guest Form Submissions
  const guestFormsHtml = (!hideGuestSections && window.guestforms?.renderGuestFormsSection)
    ? window.guestforms.renderGuestFormsSection(guestForms, currentRole, currentUid)
    : (!hideGuestSections
        ? `<section id="guest-forms-section" class="admin-section guest-forms-section"><h2>Guest Form Submissions</h2><p class="text-center">Module not loaded.</p></section>`
        : "");

  // 2) Guest Info (role-filtered in module)
  const guestinfoHtml = (!hideGuestSections && window.guestinfo?.renderGuestinfoSection)
    ? window.guestinfo.renderGuestinfoSection(guestinfo, users, currentUid, currentRole)
    : (!hideGuestSections
        ? `<section class="admin-section guestinfo-section"><h2>Guest Info</h2><p class="text-center">Module not loaded.</p></section>`
        : "");

  // 3) Stores (hidden for ME always; also hide when perf collapsed)
  const storesHtml = (
      currentRole !== ROLES.ME &&
      !hidePerfSections &&
      window.stores?.renderStoresSection
    )
    ? window.stores.renderStoresSection(stores, users, currentRole, sales)
    : "";

  // 4) Users (hide when perf collapsed)
  const usersHtml = (!hidePerfSections && window.users?.renderUsersSection)
    ? window.users.renderUsersSection(users, currentRole, currentUid)
    : (!hidePerfSections
        ? `<section class="admin-section users-section"><h2>Users</h2><p class="text-center">Module not loaded.</p></section>`
        : "");

  // 5) Reviews (hide when perf collapsed)
  const reviewsHtml = (!hidePerfSections && window.reviews?.renderReviewsSection)
    ? window.reviews.renderReviewsSection(reviews, currentRole, users, currentUid)
    : (!hidePerfSections
        ? `<section class="admin-section reviews-section"><h2>Reviews</h2><p class="text-center">Module not loaded.</p></section>`
        : "");

  // 6) Role Mgmt (always show)
  const roleMgmtHtml =
    typeof window.renderRoleManagementSection === "function"
      ? window.renderRoleManagementSection(currentRole)
      : "";

  /* ---------------------------------------------------------------
     Inject into DOM
     --------------------------------------------------------------- */
  adminAppDiv.innerHTML = `
    ${topCardsHtml}
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

  /* ---------- GUEST ENTRIES (Step 1 forms) ---------- */
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