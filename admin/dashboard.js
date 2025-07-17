/* ========================================================================
   Dashboard Main Script (Realtime)  -- Performance Highlights + Caught-Up
   Now with role-scoped Messaging overlay integration (compat-safe).
   ===================================================================== */

var ROLES = window.ROLES || { ME: "me", LEAD: "lead", DM: "dm", ADMIN: "admin" };

/* ------------------------------------------------------------------------
   Firebase Init (guarded)
   ------------------------------------------------------------------------ */
var firebaseConfig = {
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
var db   = firebase.database();
var auth = firebase.auth();
window.db  = db; // expose for modules

/* ------------------------------------------------------------------------
   Inject header Messages button (idempotent)
   ------------------------------------------------------------------------ */
function ensureMessagesButton() {
  var hdr = document.querySelector(".admin-header");
  if (!hdr) return null;

  var msgBtn = document.getElementById("messagesBtn");
  if (!msgBtn) {
    msgBtn = document.createElement("button");
    msgBtn.id = "messagesBtn";
    msgBtn.className = "admin-msg-btn";
    msgBtn.type = "button";
    msgBtn.innerHTML = '' +
      'Messages' +
      '<span class="admin-msg-badge" id="messagesBadge"></span>';

    var logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn && logoutBtn.parentNode === hdr) {
      hdr.insertBefore(msgBtn, logoutBtn);
    } else {
      hdr.appendChild(msgBtn);
    }
  }

  // Wire click -> open overlay
  msgBtn.onclick = function () {
    if (window.messages && typeof window.messages.openOverlay === "function") {
      window.messages.openOverlay();
    }
  };

  // Pass badge element to messages module so it can update counts
  var badgeEl = document.getElementById("messagesBadge");
  if (window.messages && typeof window.messages.setBadgeEl === "function") {
    window.messages.setBadgeEl(badgeEl);
  }

  return msgBtn;
}

/* Fallback CSS for Messages button/badge if dashboard.css doesn't cover */
(function injectDashboardMsgCss(){
  if (document.getElementById("dash-msg-css")) return;
  var css = "" +
    ".admin-header{position:relative;display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;}" +
    ".admin-header .admin-msg-btn{position:relative;padding:4px 12px;font-size:.9rem;font-weight:600;cursor:pointer;}" +
    ".admin-header .admin-msg-badge{position:absolute;top:-6px;right:-6px;min-width:18px;padding:0 4px;height:18px;line-height:18px;font-size:11px;text-align:center;border-radius:9px;background:#ff5252;color:#fff;display:none;}";
  var tag = document.createElement("style");
  tag.id = "dash-msg-css";
  tag.textContent = css;
  document.head.appendChild(tag);
})();

/* ------------------------------------------------------------------------
   DOM refs
   ------------------------------------------------------------------------ */
var adminAppDiv = document.getElementById("adminApp");

/* ------------------------------------------------------------------------
   Session globals
   ------------------------------------------------------------------------ */
var currentUid      = null;
var currentRole     = ROLES.ME;
var _initialLoaded  = false;
var _rtBound        = false;
var _rtRerenderTO   = null;   // throttle timer for realtime refresh

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
auth.onAuthStateChanged(function(user){
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  currentUid = user.uid;
  window.currentUid = currentUid;

  // get or seed profile
  db.ref("users/" + user.uid).get().then(function(snap){
    var prof = snap.val() || {
      role: ROLES.ME,
      name: user.displayName || user.email,
      email: user.email
    };
    currentRole = (prof.role || ROLES.ME).toLowerCase();
    window.currentRole = currentRole;

    // ensure existence / normalization
    db.ref("users/" + user.uid).update(prof);

    // Logout button
    var logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", function(){
        auth.signOut();
      });
    }

    // Messages button (make sure header exists first)
    ensureMessagesButton();
    // Initialize messages module (safe guard)
    if (window.messages && typeof window.messages.init === "function") {
      window.messages.init(currentUid, currentRole);
    }

    // initial load + realtime bind
    initialLoad().then(function(){
      ensureRealtime();                       // attach global listeners
      // module-specific (safe guard)
      if (window.guestforms && typeof window.guestforms.ensureRealtime === "function") {
        window.guestforms.ensureRealtime();
      }
    });
  });
});

/* ========================================================================
   INITIAL LOAD
   ===================================================================== */
function initialLoad() {
  adminAppDiv.innerHTML = "<div>Loading data…</div>";

  return Promise.all([
    db.ref("stores").get(),
    db.ref("users").get(),
    db.ref("reviews").get(),
    db.ref("guestinfo").get(),
    db.ref("guestEntries").get(),
    db.ref("sales").get()
  ]).then(function(arr){
    var storesSnap     = arr[0];
    var usersSnap      = arr[1];
    var reviewsSnap    = arr[2];
    var guestSnap      = arr[3];
    var guestFormsSnap = arr[4];
    var salesSnap      = arr[5];

    window._stores     = storesSnap.val()     || {};
    window._users      = usersSnap.val()      || {};
    window._reviews    = reviewsSnap.val()    || {};
    window._guestinfo  = guestSnap.val()      || {};
    window._guestForms = guestFormsSnap.val() || {};
    window._sales      = salesSnap.val()      || {};

    _initialLoaded = true;
    renderAdminApp();
  });
}

/* ========================================================================
   CAUGHT-UP HELPERS (Guest Forms + Guest Info)
   ===================================================================== */
var _isAdmin = function(r){ return r === ROLES.ADMIN; };
var _isDM    = function(r){ return r === ROLES.DM; };
var _isLead  = function(r){ return r === ROLES.LEAD; };
var _isMe    = function(r){ return r === ROLES.ME; };

/* guestforms advanced status (hide proposal/sold) */
function _gfAdvancedStatus(g){
  var s = (g && g.status || "").toLowerCase();
  return s === "proposal" || s === "sold";
}

function _startOfTodayMs(){ var d=new Date(); d.setHours(0,0,0,0); return d.getTime(); }
function _endOfTodayMs(){ var d=new Date(); d.setHours(23,59,59,999); return d.getTime(); }

/* guestinfo week filter: rolling 7 days by latest activity */
function _giLatestTs(g){
  return Math.max(g && g.updatedAt || 0, g && g.submittedAt || 0, g && g.sale && g.sale.soldAt || 0, g && g.solution && g.solution.completedAt || 0);
}
function _giInCurrentWeek(g){ return _giLatestTs(g) >= (Date.now() - 7*24*60*60*1000); }

/* guestinfo status detect */
function _giDetectStatus(g){
  if (!g) return "new";
  if (g.status) return g.status.toLowerCase();
  if (g.sale) return "sold";
  if (g.solution) return "proposal";
  if (g.evaluate) return "working";
  return "new";
}

/* DM tree helper */
function _giUsersUnderDM(users, dmUid){
  var leads = [];
  var mes = [];
  users = users || {};
  Object.keys(users).forEach(function(id){
    var u = users[id];
    if (u.role === ROLES.LEAD && u.assignedDM === dmUid) leads.push(id);
  });
  Object.keys(users).forEach(function(id){
    var u = users[id];
    if (u.role === ROLES.ME && leads.indexOf(u.assignedLead) !== -1) mes.push(id);
  });
  var s = {};
  leads.forEach(function(id){s[id]=true;});
  mes.forEach(function(id){s[id]=true;});
  return {
    has: function(id){ return !!s[id]; },
    add: function(id){ s[id]=true; },
    toSet: function(){ return s; }
  };
}

/* Visible guestforms count */
function _guestFormsVisibleCount(guestForms, guestinfo, role, uid){
  if (!guestForms) return 0;
  var showAll = !!window._guestforms_showAll;
  var startToday = _startOfTodayMs();
  var endToday   = _endOfTodayMs();
  var count = 0;
  Object.keys(guestForms).forEach(function(k){
    var f = guestForms[k];
    if (f.guestinfoKey){
      var g = guestinfo && guestinfo[f.guestinfoKey];
      if (_gfAdvancedStatus(g)) return;
    }
    if (!_isAdmin(role) && !_isDM(role)){
      var claimedBy = f.consumedBy || f.claimedBy;
      if (claimedBy && claimedBy !== uid) return;
    }
    if (!showAll){
      var ts = f.timestamp || 0;
      if (ts < startToday || ts > endToday) return;
    }
    count++;
  });
  return count;
}

/* Visible actionable guestinfo count (new+working+proposal) respecting filters */
function _guestInfoActionableCount(guestinfo, users, role, uid){
  if (!guestinfo) return 0;
  if (window._guestinfo_soldOnly || window._guestinfo_showProposals) return 1; // force not-caught in alt modes

  var weekFilter = _isMe(role) ? true : (window._guestinfo_filterMode === "week");

  var count = 0;
  Object.keys(guestinfo).forEach(function(id){
    var g = guestinfo[id];
    // role gating
    if (_isAdmin(role)) {
      /* all */
    } else if (_isDM(role)) {
      var underObj = _giUsersUnderDM(users, uid);
      underObj.add(uid);
      if (!underObj.has(g.userUid)) return;
    } else if (_isLead(role)) {
      var mesUnderLead = [];
      Object.keys(users).forEach(function(uId){
        var u = users[uId];
        if (u.role === ROLES.ME && u.assignedLead === uid) mesUnderLead.push(uId);
      });
      if (mesUnderLead.indexOf(g.userUid) === -1 && g.userUid !== uid) return;
    } else if (_isMe(role)) {
      if (g.userUid !== uid) return;
    }
    // timeframe
    if (weekFilter && !_giInCurrentWeek(g)) return;
    // status
    var st = _giDetectStatus(g);
    if (st !== "sold") count++; // include proposal, working, new
  });
  return count;
}

/* Unified caught-up HTML (Guest queue only) */
function _caughtUpUnifiedHtml(msg){
  if (typeof msg === "undefined") msg = "You're all caught up!";
  return '' +
    '<section class="admin-section guest-caughtup-section" id="guest-caughtup-section">' +
      '<h2>Guest Queue</h2>' +
      '<div class="guestinfo-empty-all text-center" style="margin-top:16px;">' +
        '<p><b>' + msg + '</b></p>' +
        '<p style="opacity:.8;">No open guest forms or leads right now.</p>' +
        '<button class="btn btn-success btn-lg" onclick="window.guestinfo.createNewLead()">+ New Lead</button>' +
      '</div>' +
    '</section>';
}

/* ========================================================================
   PERFORMANCE METRIC HELPERS  (Ratings / Staffing / Budget)
   ===================================================================== */

/* Visible reviews -> avg rating */
function _visibleReviewsArray(reviews, users, role, uid){
  if (window.reviews && typeof window.reviews.filterReviewsByRole === "function"){
    return Object.entries(window.reviews.filterReviewsByRole(reviews, users, uid, role));
  }
  return Object.entries(reviews||{});
}
function _avgRatingVisible(reviewsArr){
  if (!reviewsArr.length) return null;
  var sum=0, n=0;
  reviewsArr.forEach(function(pair){
    var r = pair[1];
    var v = Number(r.rating||0);
    if (!isNaN(v) && v>0){ sum+=v; n++; }
  });
  return n? (sum/n):null;
}

/* Staffing counts per visible store (Admin/DM/Lead; ME sees no stores) */
function _visibleStoresArray(stores, role, uid){
  if (_isAdmin(role) || _isDM(role)) return Object.entries(stores||{});
  if (_isLead(role)){
    return Object.entries(stores||{}).filter(function(pair){
      var s = pair[1];
      return s.teamLeadUid === uid;
    });
  }
  return []; // ME no stores
}

/* Count people per store */
function _storePeopleCounts(storeRec, users){
  var sn = (storeRec.storeNumber||"").toString().trim();
  var tlUid = storeRec.teamLeadUid;
  var leads=0, mes=0;
  Object.keys(users||{}).forEach(function(uid){
    var u = users[uid];
    if (u.role===ROLES.LEAD){
      if ((tlUid && uid===tlUid) || (sn && u.store===sn)) leads++;
    } else if (u.role===ROLES.ME){
      if ((sn && u.store===sn) || (tlUid && u.assignedLead===tlUid)) mes++;
    }
  });
  if (tlUid && leads===0) leads=1; // assume 1 TL if assigned but not counted
  return {leads:leads, mes:mes, total: leads+mes};
}

/* Staffing met? goal = storeRec.staffGoal || 2 */
function _storeStaffingMet(storeRec, users){
  var goal = Number(storeRec.staffGoal != null ? storeRec.staffGoal : 2);
  var counts = _storePeopleCounts(storeRec, users);
  return {met: counts.total >= goal, goal: goal, total: counts.total};
}

/* Budget MTD map using stores.js summarizer if available */
function _salesMtdMap(){
  if (window.stores && typeof window.stores.summarizeSalesByStoreMTD === "function"){
    return window.stores.summarizeSalesByStoreMTD(window._sales, window._stores, window._guestinfo, window._users);
  }
  var out={};
  var mStart = (function(d){d.setDate(1);d.setHours(0,0,0,0);return d.getTime();})(new Date());
  Object.keys(window._sales||{}).forEach(function(id){
    var s = window._sales[id];
    var ts = s.createdAt||s.soldAt||0;
    if (ts < mStart) return;
    var sn = (s.storeNumber||"").toString().trim()||"__";
    if(!out[sn]) out[sn]={count:0,units:0};
    out[sn].count++; out[sn].units += Number(s.units||0);
  });
  return out;
}
function _storeBudgetMet(storeRec, mtdMap){
  var goal = Number(storeRec.budgetUnits||0);
  if (!goal) return {met:true,goal:0,units:0,pct:null}; // no goal -> treat as met
  var sn = (storeRec.storeNumber||"").toString().trim();
  var summ = mtdMap[sn];
  var units = summ && summ.units || 0;
  var met = units >= goal;
  var pct = goal? (units/goal*100):null;
  return {met:met,goal:goal,units:units,pct:pct};
}

/* Aggregate Performance status across visible stores */
function _performanceStatus(reviews, stores, users, role, uid){
  var rvArr = _visibleReviewsArray(reviews, users, role, uid);
  var avgRating = _avgRatingVisible(rvArr);
  var ratingsGood = avgRating!=null ? avgRating >= 4.7 : false;

  var stArr = _visibleStoresArray(stores, role, uid);
  var mtdMap = _salesMtdMap();

  var staffingGood=true, budgetGood=true;
  var staffTotal=0, staffGoalTotal=0, budgetUnits=0, budgetGoal=0;

  stArr.forEach(function(pair){
    var s = pair[1];
    var staff = _storeStaffingMet(s, users);
    staffTotal += staff.total;
    staffGoalTotal += staff.goal;
    if (!staff.met) staffingGood=false;

    var bud = _storeBudgetMet(s, mtdMap);
    budgetUnits += bud.units;
    budgetGoal  += bud.goal;
    if (!bud.met) budgetGood=false;
  });

  return {
    ratingsGood:ratingsGood,
    staffingGood:staffingGood,
    budgetGood:budgetGood,
    allGood: ratingsGood && staffingGood && budgetGood,
    avgRating:avgRating,
    staffTotal:staffTotal, staffGoalTotal:staffGoalTotal,
    budgetUnits:budgetUnits, budgetGoal:budgetGoal,
    reviewCount: rvArr.length,
    storeCount: stArr.length
  };
}

/* ------------------------------------------------------------------------
   State helper -> good/warn/bad class
   ------------------------------------------------------------------------ */
function _stateClassFromBool(b, fallbackWarn){
  if (typeof fallbackWarn==="undefined") fallbackWarn=true;
  return b ? "good" : (fallbackWarn ? "warn" : "bad");
}
function _stateClassFromRatio(r, goodThr, warnThr){
  if (typeof goodThr==="undefined") goodThr=1;
  if (typeof warnThr==="undefined") warnThr=.5;
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
  var avg = ps.avgRating!=null ? ps.avgRating.toFixed(1) : "–";
  var ratState = ps.avgRating==null
    ? "warn"
    : (ps.avgRating>=4.7?"good":(ps.avgRating>=4?"warn":"bad"));

  // Staffing (mgmt tiers only)
  var showStores = (role !== ROLES.ME);
  var staffRatio = ps.staffGoalTotal>0 ? (ps.staffTotal/ps.staffGoalTotal) : null;
  var stState = !showStores ? "warn" : (
    ps.staffGoalTotal===0 ? "warn" : _stateClassFromRatio(staffRatio,1,.5)
  );
  var staffLbl = showStores ? (ps.staffTotal + "/" + (ps.staffGoalTotal||"?")) : "";

  // Budget
  var budRatio = ps.budgetGoal>0 ? (ps.budgetUnits/ps.budgetGoal) : null;
  var budState = !showStores ? "warn" : (
    ps.budgetGoal===0 ? "good" : _stateClassFromRatio(budRatio,1,.7)
  );
  var budPct = ps.budgetGoal>0 ? Math.round((ps.budgetUnits/ps.budgetGoal)*100) : null;
  var budLbl = showStores
    ? (ps.budgetGoal>0 ? (budPct + "%") : (ps.budgetUnits + "u"))
    : "";

  var ratClick = 'onclick="window.perfToggleReviews()"';
  var stClick  = 'onclick="window.perfToggleUsers()"';   // staffing shows Users
  var budClick = 'onclick="window.perfToggleStores()"';  // budget shows Stores

  return '' +
    '<section class="admin-section perf-highlights-section" id="perf-highlights-section">' +
      '<h2>Performance Highlights</h2>' +
      '<div class="perf-hl-row">' +
        '<button type="button" class="perf-hl-btn ' + ratState + '" ' + ratClick + ' aria-label="View Reviews">' +
          '<span class="ph-icon">⭐</span>' +
          '<span class="ph-label">Ratings</span>' +
          '<span class="ph-val">' + avg + '</span>' +
        '</button>' +
        (showStores ? (
        '<button type="button" class="perf-hl-btn ' + stState + '" ' + stClick + ' aria-label="View Staffing">' +
          '<span class="ph-icon">👥</span>' +
          '<span class="ph-label">Staffing</span>' +
          '<span class="ph-val">' + staffLbl + '</span>' +
        '</button>'
        ) : "") +
        (showStores ? (
        '<button type="button" class="perf-hl-btn ' + budState + '" ' + budClick + ' aria-label="View Budget Progress">' +
          '<span class="ph-icon">📈</span>' +
          '<span class="ph-label">Budget</span>' +
          '<span class="ph-val">' + budLbl + '</span>' +
        '</button>'
        ) : "") +
      '</div>' +
    '</section>';
}

/* ========================================================================
   RENDER
   ===================================================================== */
function renderAdminApp() {
  if (!_initialLoaded) return;

  var stores     = window._stores;
  var users      = window._users;
  var reviews    = window._reviews;
  var guestinfo  = window._guestinfo;
  var guestForms = window._guestForms;
  var sales      = window._sales;

  /* ----- Caught-up checks (Guest Queue) ----- */
  var gfVisibleCount    = _guestFormsVisibleCount(guestForms, guestinfo, currentRole, currentUid);
  var giActionableCount = _guestInfoActionableCount(guestinfo, users, currentRole, currentUid);
  var guestsCaught      = (gfVisibleCount === 0) && (giActionableCount === 0);

  /* ----- Performance metrics ----- */
  var perf = _performanceStatus(reviews, stores, users, currentRole, currentUid);
  var perfEligible = (currentRole !== ROLES.ME); // only show for mgmt tiers
  var perfGood = perfEligible && perf.allGood;

  /* ---------------------------------------------------------------
     Build top-of-page guest queue portion
     --------------------------------------------------------------- */
  var guestFormsHtml = "";
  var guestinfoHtml  = "";
  var perfHighlightsHtml = "";

  if (guestsCaught) {
    // show unified guest caught-up card
    guestFormsHtml = _caughtUpUnifiedHtml();
  } else {
    // guestforms section
    if (window.guestforms && typeof window.guestforms.renderGuestFormsSection === "function") {
      guestFormsHtml = window.guestforms.renderGuestFormsSection(guestForms, currentRole, currentUid);
    } else {
      guestFormsHtml = '<section id="guest-forms-section" class="admin-section guest-forms-section"><h2>Guest Form Submissions</h2><p class="text-center">Module not loaded.</p></section>';
    }

    // guestinfo section
    if (window.guestinfo && typeof window.guestinfo.renderGuestinfoSection === "function") {
      guestinfoHtml = window.guestinfo.renderGuestinfoSection(guestinfo, users, currentUid, currentRole);
    } else {
      guestinfoHtml = '<section class="admin-section guestinfo-section"><h2>Guest Info</h2><p class="text-center">Module not loaded.</p></section>';
    }
  }

  /* ---------------------------------------------------------------
     Stores / Users / Reviews (possibly collapsed into highlights)
     --------------------------------------------------------------- */
  var storesHtml = "";
  var usersHtml  = "";
  var reviewsHtml= "";

  if (perfGood) {
    // show highlight buttons instead of full sections
    perfHighlightsHtml = _perfHighlightsHtml(perf, currentRole);

    // Render expanded sections ONLY if toggled
    if (window._perf_expand_reviews) {
      if (window.reviews && typeof window.reviews.renderReviewsSection === "function") {
        reviewsHtml = window.reviews.renderReviewsSection(reviews, currentRole, users, currentUid);
      } else {
        reviewsHtml = '<section class="admin-section reviews-section"><h2>Reviews</h2><p class="text-center">Module not loaded.</p></section>';
      }
    }
    if (window._perf_expand_users) {
      if (window.users && typeof window.users.renderUsersSection === "function") {
        usersHtml = window.users.renderUsersSection(users, currentRole, currentUid);
      } else {
        usersHtml = '<section class="admin-section users-section"><h2>Users</h2><p class="text-center">Module not loaded.</p></section>';
      }
    }
    if (window._perf_expand_stores && currentRole !== ROLES.ME) {
      if (window.stores && typeof window.stores.renderStoresSection === "function") {
        storesHtml = window.stores.renderStoresSection(stores, users, currentRole, sales);
      } else {
        storesHtml = '<section class="admin-section stores-section"><h2>Stores</h2><p class="text-center">Module not loaded.</p></section>';
      }
    }
  } else {
    // normal behavior (no highlight collapse)
    if (currentRole !== ROLES.ME && window.stores && typeof window.stores.renderStoresSection === "function") {
      storesHtml = window.stores.renderStoresSection(stores, users, currentRole, sales);
    }
    if (window.users && typeof window.users.renderUsersSection === "function") {
      usersHtml = window.users.renderUsersSection(users, currentRole, currentUid);
    } else {
      usersHtml = '<section class="admin-section users-section"><h2>Users</h2><p class="text-center">Module not loaded.</p></section>';
    }
    if (window.reviews && typeof window.reviews.renderReviewsSection === "function") {
      reviewsHtml = window.reviews.renderReviewsSection(reviews, currentRole, users, currentUid);
    } else {
      reviewsHtml = '<section class="admin-section reviews-section"><h2>Reviews</h2><p class="text-center">Module not loaded.</p></section>';
    }
  }

  /* ---------------------------------------------------------------
     Role Mgmt
     --------------------------------------------------------------- */
  var roleMgmtHtml = "";
  if (typeof window.renderRoleManagementSection === "function") {
    roleMgmtHtml = window.renderRoleManagementSection(currentRole);
  }

  /* ---------------------------------------------------------------
     Inject into DOM (order: guest queue → perf highlights → others)
     --------------------------------------------------------------- */
  adminAppDiv.innerHTML = (
    guestFormsHtml +
    guestinfoHtml +
    perfHighlightsHtml +
    storesHtml +
    usersHtml +
    reviewsHtml +
    roleMgmtHtml
  );

  /* ---------------------------------------------------------------
     Build review cache for filters
     --------------------------------------------------------------- */
  if (window.reviews && typeof window.reviews.filterReviewsByRole === "function") {
    window._filteredReviews = Object.entries(
      window.reviews.filterReviewsByRole(reviews, users, currentUid, currentRole)
    ).sort(function(a,b){ return (b[1].timestamp||0) - (a[1].timestamp||0); });
  } else {
    window._filteredReviews = Object.entries(reviews).sort(
      function(a,b){ return (b[1].timestamp||0) - (a[1].timestamp||0); }
    );
  }

  // Ensure messages button stays wired after each re-render (header may not rerender but safe)
  ensureMessagesButton();
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
    _rtRerenderTO = setTimeout(function(){
      _rtRerenderTO = null;
      renderAdminApp();
    }, 100);
  }

  /* STORES */
  var storesRef = db.ref("stores");
  storesRef.on("child_added", function(snap){ window._stores[snap.key] = snap.val(); scheduleRealtimeRender(); });
  storesRef.on("child_changed", function(snap){ window._stores[snap.key] = snap.val(); scheduleRealtimeRender(); });
  storesRef.on("child_removed", function(snap){ delete window._stores[snap.key]; scheduleRealtimeRender(); });

  /* USERS */
  var usersRef = db.ref("users");
  usersRef.on("child_added", function(snap){ window._users[snap.key] = snap.val(); scheduleRealtimeRender(); });
  usersRef.on("child_changed", function(snap){
    window._users[snap.key] = snap.val();
    if (snap.key === currentUid) {
      currentRole = (snap.val() && snap.val().role || ROLES.ME).toLowerCase();
      window.currentRole = currentRole;
      // Update messages module with any role change
      if (window.messages && typeof window.messages.init === "function") {
        window.messages.init(currentUid, currentRole);
      }
    }
    scheduleRealtimeRender();
  });
  usersRef.on("child_removed", function(snap){ delete window._users[snap.key]; scheduleRealtimeRender(); });

  /* REVIEWS */
  var reviewsRef = db.ref("reviews");
  reviewsRef.on("child_added", function(snap){ window._reviews[snap.key] = snap.val(); scheduleRealtimeRender(); });
  reviewsRef.on("child_changed", function(snap){ window._reviews[snap.key] = snap.val(); scheduleRealtimeRender(); });
  reviewsRef.on("child_removed", function(snap){ delete window._reviews[snap.key]; scheduleRealtimeRender(); });

  /* GUEST INFO */
  var giRef = db.ref("guestinfo");
  giRef.on("child_added", function(snap){ window._guestinfo[snap.key] = snap.val(); scheduleRealtimeRender(); });
  giRef.on("child_changed", function(snap){ window._guestinfo[snap.key] = snap.val(); scheduleRealtimeRender(); });
  giRef.on("child_removed", function(snap){ delete window._guestinfo[snap.key]; scheduleRealtimeRender(); });

  /* GUEST ENTRIES */
  var gfRef = db.ref("guestEntries");
  gfRef.on("child_added", function(snap){ window._guestForms[snap.key] = snap.val(); scheduleRealtimeRender(); });
  gfRef.on("child_changed", function(snap){ window._guestForms[snap.key] = snap.val(); scheduleRealtimeRender(); });
  gfRef.on("child_removed", function(snap){ delete window._guestForms[snap.key]; scheduleRealtimeRender(); });

  /* SALES */
  var salesRef = db.ref("sales");
  salesRef.on("child_added", function(snap){ window._sales[snap.key] = snap.val(); scheduleRealtimeRender(); });
  salesRef.on("child_changed", function(snap){ window._sales[snap.key] = snap.val(); scheduleRealtimeRender(); });
  salesRef.on("child_removed", function(snap){ delete window._sales[snap.key]; scheduleRealtimeRender(); });

  /* NOTE: messages realtime handled inside messages.js */
}

/* ========================================================================
   Module action passthroughs
   ===================================================================== */
// Stores
window.assignTL          = function(storeId, uid){ if(window.stores && window.stores.assignTL) window.stores.assignTL(storeId, uid); };
window.updateStoreNumber = function(id, val){ if(window.stores && window.stores.updateStoreNumber) window.stores.updateStoreNumber(id, val); };
window.addStore          = function(){ if(window.stores && window.stores.addStore) window.stores.addStore(); };
window.deleteStore       = function(id){ if(window.stores && window.stores.deleteStore) window.stores.deleteStore(id); };

// Users
window.assignLeadToGuest = function(guestUid, leadUid){ if(window.users && window.users.assignLeadToGuest) window.users.assignLeadToGuest(guestUid, leadUid); };
window.assignDMToLead    = function(leadUid, dmUid){ if(window.users && window.users.assignDMToLead) window.users.assignDMToLead(leadUid, dmUid); };
window.editUserStore     = function(uid){ if(window.users && window.users.editUserStore) return window.users.editUserStore(uid); };

// Reviews
window.toggleStar   = function(id, starred){ if(window.reviews && window.reviews.toggleStar) window.reviews.toggleStar(id, starred); };
window.deleteReview = function(id){ if(window.reviews && window.reviews.deleteReview) window.reviews.deleteReview(id); };

// Review filters
window.filterReviewsByStore = function(store){
  var filtered = (window._filteredReviews||[]).filter(function(pair){ return pair[1].store === store; });
  var el = document.querySelector(".reviews-container");
  if (el && window.reviews && window.reviews.reviewsToHtml) el.innerHTML = window.reviews.reviewsToHtml(filtered);
};
window.filterReviewsByAssociate = function(name){
  var filtered = (window._filteredReviews||[]).filter(function(pair){ return pair[1].associate === name; });
  var el = document.querySelector(".reviews-container");
  if (el && window.reviews && window.reviews.reviewsToHtml) el.innerHTML = window.reviews.reviewsToHtml(filtered);
};
window.clearReviewFilter = function(){
  var el = document.querySelector(".reviews-container");
  if (el && window.reviews && window.reviews.reviewsToHtml) el.innerHTML = window.reviews.reviewsToHtml(window._filteredReviews);
};

// Guest Form submissions actions
window.deleteGuestFormEntry     = function(id){ if(window.guestforms && window.guestforms.deleteGuestFormEntry) window.guestforms.deleteGuestFormEntry(id); };
window.continueGuestFormToGuest = function(id){ if(window.guestforms && window.guestforms.continueToGuestInfo) window.guestforms.continueToGuestInfo(id); };

/* ------------------------------------------------------------------------
   Expose render for modules
   ------------------------------------------------------------------------ */
window.renderAdminApp = renderAdminApp;