
/* ========================================================================
   Dashboard Main Script (Realtime + Performance Highlights)
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
   Dashboard highlight state
   ------------------------------------------------------------------------ */
if (typeof window._dashboard_showFull === "undefined") window._dashboard_showFull = true; // full sections by default

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
   Helper: HTML escape
   ===================================================================== */
function esc(str){
  return (str ?? "").toString()
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#39;");
}

/* ========================================================================
   Guest "caught up" metrics
   ------------------------------------------------------------------------
   Actionable guest forms:
     - Visible to user (same logic as guestforms.visibleFormsForRole approx)
     - NOT advanced (linked guest status !== proposal/sold)
   Actionable guestinfo:
     - Visible to user by role (new or working status)
   Returns {formsActionable, leadsActionable, totalActionable}
   ===================================================================== */
function isAdvancedStatus(st){ if(!st) return false; st=st.toLowerCase(); return st==="proposal"||st==="sold"; }
function isActionableLeadStatus(st){ if(!st) return true; st=st.toLowerCase(); return st==="new"||st==="working"; }

function visibleGuestFormsApprox(formsObj, currentRole, currentUid){
  const out={};
  for (const [id,f] of Object.entries(formsObj||{})){
    // filter per role
    if (currentRole===ROLES.ADMIN || currentRole===ROLES.DM){
      out[id]=f;
      continue;
    }
    const claimedBy = f.consumedBy || f.claimedBy;
    if (!claimedBy || claimedBy===currentUid){
      out[id]=f;
    }
  }
  return out;
}

function visibleGuestinfoApprox(guestinfo, users, currentUid, currentRole){
  if (window.guestinfo?.renderGuestinfoSection){
    // we can't cheaply reuse its filter; approximate:
    // Use logic similar to module
  }
  if (!guestinfo || !users) return {};
  if (currentRole===ROLES.ADMIN) return guestinfo;
  if (currentRole===ROLES.DM){
    const leads = Object.entries(users)
      .filter(([,u])=>u.role===ROLES.LEAD && u.assignedDM===currentUid)
      .map(([uid])=>uid);
    const mes = Object.entries(users)
      .filter(([,u])=>u.role===ROLES.ME && leads.includes(u.assignedLead))
      .map(([uid])=>uid);
    const visSet=new Set([...leads,...mes,currentUid]);
    return Object.fromEntries(Object.entries(guestinfo).filter(([,g])=>visSet.has(g.userUid)));
  }
  if (currentRole===ROLES.LEAD){
    const mes = Object.entries(users)
      .filter(([,u])=>u.role===ROLES.ME && u.assignedLead===currentUid)
      .map(([uid])=>uid);
    const visSet=new Set([...mes,currentUid]);
    return Object.fromEntries(Object.entries(guestinfo).filter(([,g])=>visSet.has(g.userUid)));
  }
  // ME
  return Object.fromEntries(Object.entries(guestinfo).filter(([,g])=>g.userUid===currentUid));
}

function computeGuestQueuesCaughtUp(guestForms, guestinfo, users, currentUid, currentRole){
  const visForms = visibleGuestFormsApprox(guestForms, currentRole, currentUid);
  let formsActionable=0;
  for (const f of Object.values(visForms)){
    const gid=f.guestinfoKey;
    let st=null;
    if (gid && guestinfo[gid]) st=guestinfo[gid].status;
    if (gid && guestinfo[gid] && isAdvancedStatus(st)) continue; // advanced -> ignore
    formsActionable++;
  }

  const visLeads = visibleGuestinfoApprox(guestinfo, users, currentUid, currentRole);
  let leadsActionable=0;
  for (const g of Object.values(visLeads)){
    if (isActionableLeadStatus(g.status)) leadsActionable++;
  }

  return {
    formsActionable,
    leadsActionable,
    totalActionable: formsActionable + leadsActionable
  };
}

/* ========================================================================
   Performance metrics (ratings / staffing / budget MTD)
   ===================================================================== */
function monthStartMs(){
  const d=new Date(); d.setDate(1); d.setHours(0,0,0,0); return d.getTime();
}
function normStore(sn){ return (sn??"").toString().trim(); }

/* visible reviews (use module filter when available) */
function getVisibleReviews(reviews, users, currentUid, currentRole){
  if (window.reviews?.filterReviewsByRole){
    return Object.entries(window.reviews.filterReviewsByRole(reviews, users, currentUid, currentRole));
  }
  return Object.entries(reviews||{});
}
function avgRatingFromEntries(entries){
  let sum=0,c=0;
  for (const [,r] of entries){
    const n=Number(r.rating);
    if(!isNaN(n)){sum+=n;c++;}
  }
  return c? (sum/c):0;
}

/* staffing per store (lead+mes); goal from store.staffGoal || 2 */
function staffCountsForStore(storeRec, users){
  const sn=normStore(storeRec.storeNumber);
  const tlUid=storeRec.teamLeadUid;
  let leads=0, mes=0;
  for (const u of Object.values(users)){
    if (u.role===ROLES.LEAD){
      if ((tlUid && u.uid===tlUid) || (sn && normStore(u.store)===sn)) leads++;
    } else if (u.role===ROLES.ME){
      if ((sn && normStore(u.store)===sn) || (tlUid && u.assignedLead===tlUid)) mes++;
    }
  }
  const goal = Number(storeRec.staffGoal ?? 2);
  const total = leads+mes;
  return {leads,mes,total,goal,met: total>=goal};
}

/* sales MTD vs budget */
function summarizeSalesByStoreMTD(salesObj, storesObj, guestinfoObj, users){
  const out={};
  const mStart=monthStartMs();
  for (const s of Object.values(salesObj||{})){
    const ts=s.createdAt||s.soldAt||0;
    if (ts<mStart) continue;
    let sn=normStore(s.storeNumber);
    if (!sn && s.guestinfoKey && guestinfoObj[s.guestinfoKey]){
      const g=guestinfoObj[s.guestinfoKey];
      sn=normStore(g.sale?.storeNumber)||normStore(users?.[g.userUid]?.store)||sn;
    }
    if(!sn) sn="__UNASSIGNED__";
    if(!out[sn]) out[sn]={units:0,count:0};
    out[sn].units+=Number(s.units||0);
    out[sn].count+=1;
  }
  return out;
}

function computePerformanceGood(stores, users, reviews, sales, guestinfo, currentUid, currentRole){
  // rating
  const visRev = getVisibleReviews(reviews, users, currentUid, currentRole);
  const avgRating = avgRatingFromEntries(visRev);
  const ratingGood = avgRating >= 4.7 && visRev.length>0;

  // staffing + budget across visible stores (role filter)
  const visStoreIds = Object.keys(stores||{});
  let allStaffMet = true;
  let allBudgetMet = true;
  const salesMtd = summarizeSalesByStoreMTD(sales, stores, guestinfo, users);
  for (const sid of visStoreIds){
    const s = stores[sid];
    const staff = staffCountsForStoreWithUsers(s, users); // wrapper: we need users keyed by id; convert
    if (!staff.met) allStaffMet=false;
    const goal = Number(s.budgetUnits||0);
    if (goal>0){
      const mtd = salesMtd[normStore(s.storeNumber)]?.units||0;
      if (mtd < goal) allBudgetMet=false;
    }
  }
  return {avgRating, ratingGood, allStaffMet, allBudgetMet, perfGood: (ratingGood && allStaffMet && allBudgetMet)};
}

/* staffCountsForStore but we need users keyed; wrapper */
function staffCountsForStoreWithUsers(storeRec, usersObj){
  // convert to array with uid injection
  const users=Object.entries(usersObj||{}).map(([uid,u])=>({...u,uid}));
  return staffCountsForStore(storeRec, users);
}

/* ========================================================================
   PERFORMANCE HIGHLIGHT VIEW
   Shown when BOTH: guest queues caught up AND performance good
   (unless user has expanded to full view)
   ===================================================================== */
function renderCongratsView(metricsGuest, metricsPerf, stores, users, currentRole){
  const avg=metricsPerf.avgRating||0;
  const ratingStr = avg?avg.toFixed(2):"--";
  const ratingStar = "★"; // single glyph; CSS can size
  const ratingOk = metricsPerf.ratingGood;

  // overall staffing & budget icons
  const staffIcon  = metricsPerf.allStaffMet  ? "✅" : "⚠️";
  const budgetIcon = metricsPerf.allBudgetMet ? "✅" : "⚠️";

  // guest queue summary
  const gForms = metricsGuest.formsActionable;
  const gLeads = metricsGuest.leadsActionable;

  return `
    <section class="admin-section dashboard-congrats" id="dashboard-congrats">
      <button class="btn btn-ghost btn-sm" style="position:absolute;top:8px;right:8px;"
              onclick="window.dashboardShowFullDetails()"
              title="Show full dashboard">✕</button>
      <h2>Great Job!</h2>
      <p class="text-center" style="margin-bottom:16px;">You're fully caught up and on target.</p>

      <div class="dash-congrats-grid">
        <div class="dc-card" onclick="window.dashboardShowFullDetails('leads')">
          <div class="dc-emoji">🎯</div>
          <div class="dc-title">Leads Caught Up</div>
          <div class="dc-sub">Forms: ${gForms} • Leads: ${gLeads}</div>
          <div class="dc-cta">View Leads</div>
        </div>

        <div class="dc-card" onclick="window.dashboardShowFullDetails('perf')">
          <div class="dc-emoji">🏆</div>
          <div class="dc-title">Performance On Target</div>
          <div class="dc-sub">${ratingStar} ${ratingStr} &nbsp;|&nbsp; Staff ${staffIcon} &nbsp;|&nbsp; Budget ${budgetIcon}</div>
          <div class="dc-cta">View Performance</div>
        </div>
      </div>
    </section>
  `;
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
     Compute caught-up + performance-good metrics
     --------------------------------------------------------------- */
  const guestMetrics = computeGuestQueuesCaughtUp(guestForms, guestinfo, users, currentUid, currentRole);
  const perfMetrics  = computePerformanceGood(stores, users, reviews, sales, guestinfo, currentUid, currentRole);

  const guestsCaught = guestMetrics.totalActionable === 0;
  const perfGood     = perfMetrics.perfGood;

  /* ---------------------------------------------------------------
     Optional CONGRATS view (if both caught & perf good AND not forced full)
     --------------------------------------------------------------- */
  if (guestsCaught && perfGood && !window._dashboard_showFull) {
    adminAppDiv.innerHTML = renderCongratsView(guestMetrics, perfMetrics, stores, users, currentRole);
    buildFilteredReviewsCache(reviews, users); // maintain cache
    return;
  }

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
  buildFilteredReviewsCache(reviews, users);
}

function buildFilteredReviewsCache(reviews, users){
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
   Dashboard highlight toggles
   Called by congrats cards / X close
   mode: 'leads' | 'perf' | undefined
   ------------------------------------------------------------------------
   - Clicking X -> show all sections
   - Clicking "View Leads" -> show full, jump scroll to guestinfo
   - Clicking "View Performance" -> show full, jump to stores
   ===================================================================== */
function dashboardShowFullDetails(mode){
  window._dashboard_showFull = true;
  renderAdminApp();
  if (mode === "leads"){
    // scroll to guest info section after paint
    requestAnimationFrame(()=>{
      const el=document.getElementById("guestinfo-section")||document.getElementById("guest-forms-section");
      if (el) el.scrollIntoView({behavior:"smooth",block:"start"});
    });
  }else if (mode === "perf"){
    requestAnimationFrame(()=>{
      const el=document.getElementById("stores-section");
      if (el) el.scrollIntoView({behavior:"smooth",block:"start"});
    });
  }
}
window.dashboardShowFullDetails = dashboardShowFullDetails;

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
