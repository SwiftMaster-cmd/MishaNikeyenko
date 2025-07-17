/* ========================================================================
   Dashboard Main Script (Realtime)  -- Performance Highlights + Caught-Up
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
   Performance Highlight expanded states
   ------------------------------------------------------------------------ */
if (typeof window._perf_expand_reviews === "undefined") window._perf_expand_reviews = false;
if (typeof window._perf_expand_stores  === "undefined") window._perf_expand_stores  = false;
if (typeof window._perf_expand_users   === "undefined") window._perf_expand_users   = false;

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
  ensureRealtime();                  // attach global listeners
  window.guestforms?.ensureRealtime?.(); // module-specific (safe if double-bound)
});

/* ========================================================================
   INITIAL LOAD
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
    db.ref("guestEntries").get(),
    db.ref("sales").get()
  ]);

  window._stores     = storesSnap.val()     || {};
  window._users      = usersSnap.val()      || {};
  window._reviews    = reviewsSnap.val()    || {};
  window._guestinfo  = guestSnap.val()      || {};
  window._guestForms = guestFormsSnap.val() || {};
  window._sales      = salesSnap.val()      || {};

  _initialLoaded = true;
  renderAdminApp();
}

/* ========================================================================
   CAUGHT-UP HELPERS (Guest Forms + Guest Info)
   ===================================================================== */
const _isAdmin = r => r === ROLES.ADMIN;
const _isDM    = r => r === ROLES.DM;
const _isLead  = r => r === ROLES.LEAD;
const _isMe    = r => r === ROLES.ME;

/* guestforms advanced status (hide proposal/sold) */
function _gfAdvancedStatus(g){
  const s = (g?.status || "").toLowerCase();
  return s === "proposal" || s === "sold";
}

function _startOfTodayMs(){ const d=new Date(); d.setHours(0,0,0,0); return d.getTime(); }
function _endOfTodayMs(){ const d=new Date(); d.setHours(23,59,59,999); return d.getTime(); }

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

/* DM tree helper */
function _giUsersUnderDM(users, dmUid){
  const leads = Object.entries(users||{})
    .filter(([,u])=>u.role===ROLES.LEAD && u.assignedDM===dmUid)
    .map(([id])=>id);
  const mes = Object.entries(users||{})
    .filter(([,u])=>u.role===ROLES.ME && leads.includes(u.assignedLead))
    .map(([id])=>id);
  return new Set([...leads,...mes]);
}

/* Visible guestforms count */
function _guestFormsVisibleCount(guestForms, guestinfo, role, uid){
  if (!guestForms) return 0;
  const showAll = !!window._guestforms_showAll;
  const startToday = _startOfTodayMs();
  const endToday   = _endOfTodayMs();
  let count = 0;
  for (const [,f] of Object.entries(guestForms)){
    if (f.guestinfoKey){
      const g = guestinfo?.[f.guestinfoKey];
      if (_gfAdvancedStatus(g)) continue;
    }
    if (!_isAdmin(role) && !_isDM(role)){
      const claimedBy = f.consumedBy || f.claimedBy;
      if (claimedBy && claimedBy !== uid) continue;
    }
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
  if (window._guestinfo_soldOnly || window._guestinfo_showProposals) return 1; // force not-caught in alt modes

  const weekFilter = _isMe(role) ? true : (window._guestinfo_filterMode === "week");

  let count = 0;
  for (const [,g] of Object.entries(guestinfo)){
    // role gating
    if (_isAdmin(role)) {
      /* all */
    } else if (_isDM(role)) {
      const under = _giUsersUnderDM(users, uid); under.add(uid);
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
    if (st !== "sold") count++; // include proposal, working, new
  }
  return count;
}

/* Unified caught-up HTML (Guest queue only) */
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
   PERFORMANCE METRIC HELPERS  (Ratings / Staffing / Budget)
   ===================================================================== */

/* Visible reviews -> avg rating */
function _visibleReviewsArray(reviews, users, role, uid){
  if (window.reviews?.filterReviewsByRole){
    return Object.entries(window.reviews.filterReviewsByRole(reviews, users, uid, role));
  }
  return Object.entries(reviews||{});
}
function _avgRatingVisible(reviewsArr){
  if (!reviewsArr.length) return null;
  let sum=0, n=0;
  for (const [,r] of reviewsArr){
    const v = Number(r.rating||0);
    if (!isNaN(v) && v>0){ sum+=v; n++; }
  }
  return n? (sum/n):null;
}

/* Staffing counts per visible store (Admin/DM/Lead; ME sees no stores) */
function _visibleStoresArray(stores, role, uid){
  if (_isAdmin(role) || _isDM(role)) return Object.entries(stores||{});
  if (_isLead(role)){
    return Object.entries(stores||{}).filter(([,s])=>s.teamLeadUid===uid);
  }
  return []; // ME no stores
}

/* Count people per store */
function _storePeopleCounts(storeRec, users){
  const sn = (storeRec.storeNumber||"").toString().trim();
  const tlUid = storeRec.teamLeadUid;
  let leads=0, mes=0;
  for (const [uid,u] of Object.entries(users||{})){
    if (u.role===ROLES.LEAD){
      if ((tlUid && uid===tlUid) || (sn && u.store===sn)) leads++;
    } else if (u.role===ROLES.ME){
      if ((sn && u.store===sn) || (tlUid && u.assignedLead===tlUid)) mes++;
    }
  }
  if (tlUid && leads===0) leads=1; // assume 1 TL if assigned but not counted
  return {leads, mes, total: leads+mes};
}

/* Staffing met? goal = storeRec.staffGoal || 2 */
function _storeStaffingMet(storeRec, users){
  const goal = Number(storeRec.staffGoal ?? 2);
  const {total} = _storePeopleCounts(storeRec, users);
  return {met: total >= goal, goal, total};
}

/* Budget MTD map using stores.js summarizer if available */
function _salesMtdMap(){
  if (window.stores?.summarizeSalesByStoreMTD){
    return window.stores.summarizeSalesByStoreMTD(window._sales, window._stores, window._guestinfo, window._users);
  }
  const out={};
  const mStart = (d=>{d.setDate(1);d.setHours(0,0,0,0);return d.getTime();})(new Date());
  for (const [,s] of Object.entries(window._sales||{})){
    const ts = s.createdAt||s.soldAt||0;
    if (ts < mStart) continue;
    const sn = (s.storeNumber||"").toString().trim()||"__";
    if(!out[sn]) out[sn]={count:0,units:0};
    out[sn].count++; out[sn].units += Number(s.units||0);
  }
  return out;
}
function _storeBudgetMet(storeRec, mtdMap){
  const goal = Number(storeRec.budgetUnits||0);
  if (!goal) return {met:true,goal:0,units:0,pct:null}; // no goal -> treat as met
  const sn = (storeRec.storeNumber||"").toString().trim();
  const summ = mtdMap[sn];
  const units = summ?.units||0;
  const met = units >= goal;
  const pct = goal? (units/goal*100):null;
  return {met,goal,units,pct};
}

/* Aggregate Performance status across visible stores */
function _performanceStatus(reviews, stores, users, role, uid){
  const rvArr = _visibleReviewsArray(reviews, users, role, uid);
  const avgRating = _avgRatingVisible(rvArr);
  const ratingsGood = avgRating!=null ? avgRating >= 4.7 : false;

  const stArr = _visibleStoresArray(stores, role, uid);
  const mtdMap = _salesMtdMap();

  let staffingGood=true, budgetGood=true;
  let staffTotal=0, staffGoalTotal=0, budgetUnits=0, budgetGoal=0;

  for (const [,s] of stArr){
    const staff = _storeStaffingMet(s, users);
    staffTotal += staff.total;
    staffGoalTotal += staff.goal;
    if (!staff.met) staffingGood=false;

    const bud = _storeBudgetMet(s, mtdMap);
    budgetUnits += bud.units;
    budgetGoal  += bud.goal;
    if (!bud.met) budgetGood=false;
  }

  return {
    ratingsGood,
    staffingGood,
    budgetGood,
    allGood: ratingsGood && staffingGood && budgetGood,
    avgRating,
    staffTotal, staffGoalTotal,
    budgetUnits, budgetGoal,
    reviewCount: rvArr.length,
    storeCount: stArr.length
  };
}

/* ------------------------------------------------------------------------
   State helper -> good/warn/bad class
   ------------------------------------------------------------------------ */
function _stateClassFromBool(b, fallbackWarn=true){
  return b ? "good" : (fallbackWarn ? "warn" : "bad");
}
function _stateClassFromRatio(r, goodThr=1, warnThr=.5){
  if (isNaN(r)) return "warn";
  if (r >= goodThr) return "good";
  if (r >= warnThr) return "warn";
  return "bad";
}

/* ========================================================================
   PERFORMANCE HIGHLIGHTS HTML (3 horizontal buttons, no New Lead btn)
   ===================================================================== */
function _perfHighlightsHtml(ps, role){
  // Ratings
  const avg = ps.avgRating!=null ? ps.avgRating.toFixed(1) : "–";
  const ratState = ps.avgRating==null
    ? "warn"
    : (ps.avgRating>=4.7?"good":(ps.avgRating>=4?"warn":"bad"));

  // Staffing (mgmt tiers only)
  const showStores = (role !== ROLES.ME);
  const staffRatio = ps.staffGoalTotal>0 ? (ps.staffTotal/ps.staffGoalTotal) : null;
  const stState = !showStores ? "warn" : (
    ps.staffGoalTotal===0 ? "warn" : _stateClassFromRatio(staffRatio,1,.5)
  );
  const staffLbl = showStores ? `${ps.staffTotal}/${ps.staffGoalTotal||"?"}` : "";

  // Budget
  const budRatio = ps.budgetGoal>0 ? (ps.budgetUnits/ps.budgetGoal) : null;
  const budState = !showStores ? "warn" : (
    ps.budgetGoal===0 ? "good" : _stateClassFromRatio(budRatio,1,.7)
  );
  const budPct = ps.budgetGoal>0 ? Math.round((ps.budgetUnits/ps.budgetGoal)*100) : null;
  const budLbl = showStores
    ? (ps.budgetGoal>0 ? `${budPct}%` : `${ps.budgetUnits}u`)
    : "";

  const ratClick = `onclick="window.perfToggleReviews()"`;
  const stClick  = `onclick="window.perfToggleUsers()"`;   // staffing shows Users
  const budClick = `onclick="window.perfToggleStores()"`;  // budget shows Stores

  return `
    <section class="admin-section perf-highlights-section" id="perf-highlights-section">
      <h2>Performance Highlights</h2>
      <div class="perf-hl-row">
        <button type="button" class="perf-hl-btn ${ratState}" ${ratClick} aria-label="View Reviews">
          <span class="ph-icon">⭐</span>
          <span class="ph-label">Ratings</span>
          <span class="ph-val">${avg}</span>
        </button>
        ${showStores ? `
        <button type="button" class="perf-hl-btn ${stState}" ${stClick} aria-label="View Staffing">
          <span class="ph-icon">👥</span>
          <span class="ph-label">Staffing</span>
          <span class="ph-val">${staffLbl}</span>
        </button>`:""}
        ${showStores ? `
        <button type="button" class="perf-hl-btn ${budState}" ${budClick} aria-label="View Budget Progress">
          <span class="ph-icon">📈</span>
          <span class="ph-label">Budget</span>
          <span class="ph-val">${budLbl}</span>
        </button>`:""}
      </div>
    </section>`;
}

/* ========================================================================
   RENDER
   ===================================================================== */
function renderAdminApp() {
  if (!_initialLoaded) return;

  const stores     = window._stores;
  const users      = window._users;
  const reviews    = window._reviews;
  const guestinfo  = window._guestinfo;
  const guestForms = window._guestForms;
  const sales      = window._sales;

  /* ----- Caught-up checks (Guest Queue) ----- */
  const gfVisibleCount   = _guestFormsVisibleCount(guestForms, guestinfo, currentRole, currentUid);
  const giActionableCount= _guestInfoActionableCount(guestinfo, users, currentRole, currentUid);
  const guestsCaught     = (gfVisibleCount === 0) && (giActionableCount === 0);

  /* ----- Performance metrics ----- */
  const perf = _performanceStatus(reviews, stores, users, currentRole, currentUid);
  const perfEligible = (currentRole !== ROLES.ME); // only show for mgmt tiers
  const perfGood = perfEligible && perf.allGood;

  /* ---------------------------------------------------------------
     Build top-of-page guest queue portion
     --------------------------------------------------------------- */
  let guestFormsHtml = "";
  let guestinfoHtml  = "";
  let perfHighlightsHtml = "";

  if (guestsCaught) {
    // show unified guest caught-up card
    guestFormsHtml = _caughtUpUnifiedHtml();
  } else {
    // guestforms section
    guestFormsHtml = window.guestforms?.renderGuestFormsSection
      ? window.guestforms.renderGuestFormsSection(guestForms, currentRole, currentUid)
      : `<section id="guest-forms-section" class="admin-section guest-forms-section"><h2>Guest Form Submissions</h2><p class="text-center">Module not loaded.</p></section>`;

    // guestinfo section
    guestinfoHtml = window.guestinfo?.renderGuestinfoSection
      ? window.guestinfo.renderGuestinfoSection(guestinfo, users, currentUid, currentRole)
      : `<section class="admin-section guestinfo-section"><h2>Guest Info</h2><p class="text-center">Module not loaded.</p></section>`;
  }

  /* ---------------------------------------------------------------
     Stores / Users / Reviews (possibly collapsed into highlights)
     --------------------------------------------------------------- */
  let storesHtml = "";
  let usersHtml  = "";
  let reviewsHtml= "";

  if (perfGood) {
    // show highlight buttons instead of full sections
    perfHighlightsHtml = _perfHighlightsHtml(perf, currentRole);

    // Render expanded sections ONLY if toggled
    if (window._perf_expand_reviews) {
      reviewsHtml = window.reviews?.renderReviewsSection
        ? window.reviews.renderReviewsSection(reviews, currentRole, users, currentUid)
        : `<section class="admin-section reviews-section"><h2>Reviews</h2><p class="text-center">Module not loaded.</p></section>`;
    }
    if (window._perf_expand_users) {
      usersHtml = window.users?.renderUsersSection
        ? window.users.renderUsersSection(users, currentRole, currentUid)
        : `<section class="admin-section users-section"><h2>Users</h2><p class="text-center">Module not loaded.</p></section>`;
    }
    if (window._perf_expand_stores && currentRole !== ROLES.ME) {
      storesHtml = window.stores?.renderStoresSection
        ? window.stores.renderStoresSection(stores, users, currentRole, sales)
        : `<section class="admin-section stores-section"><h2>Stores</h2><p class="text-center">Module not loaded.</p></section>`;
    }
  } else {
    // normal behavior (no highlight collapse)
    if (currentRole !== ROLES.ME && window.stores?.renderStoresSection) {
      storesHtml = window.stores.renderStoresSection(stores, users, currentRole, sales);
    }
    usersHtml = window.users?.renderUsersSection
      ? window.users.renderUsersSection(users, currentRole, currentUid)
      : `<section class="admin-section users-section"><h2>Users</h2><p class="text-center">Module not loaded.</p></section>`;
    reviewsHtml = window.reviews?.renderReviewsSection
      ? window.reviews.renderReviewsSection(reviews, currentRole, users, currentUid)
      : `<section class="admin-section reviews-section"><h2>Reviews</h2><p class="text-center">Module not loaded.</p></section>`;
  }

  /* ---------------------------------------------------------------
     Role Mgmt
     --------------------------------------------------------------- */
  const roleMgmtHtml =
    typeof window.renderRoleManagementSection === "function"
      ? window.renderRoleManagementSection(currentRole)
      : "";

  /* ---------------------------------------------------------------
     Inject into DOM (order: guest queue → perf highlights → others)
     --------------------------------------------------------------- */
  adminAppDiv.innerHTML = `
    ${guestFormsHtml}
    ${guestinfoHtml}
    ${perfHighlightsHtml}
    ${storesHtml}
    ${usersHtml}
    ${reviewsHtml}
    ${roleMgmtHtml}
  `;

  /* ---------------------------------------------------------------
     Build review cache for filters
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
   PERF HIGHLIGHT TOGGLES
   ===================================================================== */
window.perfToggleReviews = function(){
  window._perf_expand_reviews = !window._perf_expand_reviews;
  renderAdminApp();
};
window.perfToggleStores = function(){
  window._perf_expand_stores = !window._perf_expand_stores;
  renderAdminApp();
};
window.perfToggleUsers = function(){
  window._perf_expand_users = !window._perf_expand_users;
  renderAdminApp();
};

/* ========================================================================
   REALTIME BIND
   ===================================================================== */
function ensureRealtime() {
  if (_rtBound) return;
  _rtBound = true;

  function scheduleRealtimeRender() {
    if (_rtRerenderTO) return;
    _rtRerenderTO = setTimeout(() => {
      _rtRerenderTO = null;
      renderAdminApp();
    }, 100);
  }

  /* STORES */
  const storesRef = db.ref("stores");
  storesRef.on("child_added", snap => { window._stores[snap.key] = snap.val(); scheduleRealtimeRender(); });
  storesRef.on("child_changed", snap => { window._stores[snap.key] = snap.val(); scheduleRealtimeRender(); });
  storesRef.on("child_removed", snap => { delete window._stores[snap.key]; scheduleRealtimeRender(); });

  /* USERS */
  const usersRef = db.ref("users");
  usersRef.on("child_added", snap => { window._users[snap.key] = snap.val(); scheduleRealtimeRender(); });
  usersRef.on("child_changed", snap => {
    window._users[snap.key] = snap.val();
    if (snap.key === currentUid) {
      currentRole = (snap.val()?.role || ROLES.ME).toLowerCase();
      window.currentRole = currentRole;
    }
    scheduleRealtimeRender();
  });
  usersRef.on("child_removed", snap => { delete window._users[snap.key]; scheduleRealtimeRender(); });

  /* REVIEWS */
  const reviewsRef = db.ref("reviews");
  reviewsRef.on("child_added", snap => { window._reviews[snap.key] = snap.val(); scheduleRealtimeRender(); });
  reviewsRef.on("child_changed", snap => { window._reviews[snap.key] = snap.val(); scheduleRealtimeRender(); });
  reviewsRef.on("child_removed", snap => { delete window._reviews[snap.key]; scheduleRealtimeRender(); });

  /* GUEST INFO */
  const giRef = db.ref("guestinfo");
  giRef.on("child_added", snap => { window._guestinfo[snap.key] = snap.val(); scheduleRealtimeRender(); });
  giRef.on("child_changed", snap => { window._guestinfo[snap.key] = snap.val(); scheduleRealtimeRender(); });
  giRef.on("child_removed", snap => { delete window._guestinfo[snap.key]; scheduleRealtimeRender(); });

  /* GUEST ENTRIES */
  const gfRef = db.ref("guestEntries");
  gfRef.on("child_added", snap => { window._guestForms[snap.key] = snap.val(); scheduleRealtimeRender(); });
  gfRef.on("child_changed", snap => { window._guestForms[snap.key] = snap.val(); scheduleRealtimeRender(); });
  gfRef.on("child_removed", snap => { delete window._guestForms[snap.key]; scheduleRealtimeRender(); });

  /* SALES */
  const salesRef = db.ref("sales");
  salesRef.on("child_added", snap => { window._sales[snap.key] = snap.val(); scheduleRealtimeRender(); });
  salesRef.on("child_changed", snap => { window._sales[snap.key] = snap.val(); scheduleRealtimeRender(); });
  salesRef.on("child_removed", snap => { delete window._sales[snap.key]; scheduleRealtimeRender(); });
}

/* ========================================================================
   Module action passthroughs
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
   Expose render for modules
   ------------------------------------------------------------------------ */
window.renderAdminApp = renderAdminApp;