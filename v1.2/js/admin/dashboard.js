/* ========================================================================
   OSL Admin Dashboard Main Script (Modular-Ready, Optimized)
   ===================================================================== */

(() => {
  "use strict";

  /* --------------------------------------------------------------------
   * Constants & Globals
   * ------------------------------------------------------------------ */
  const ROLES = window.ROLES || { ME: "me", LEAD: "lead", DM: "dm", ADMIN: "admin" };

  const firebaseConfig = {
    apiKey: "AIzaSyD9fILTNJQ0wsPftUsPkdLrhRGV9dslMzE",
    authDomain: "osls-644fd.firebaseapp.com",
    databaseURL: "https://osls-644fd-default-rtdb.firebaseio.com",
    projectId: "osls-644fd",
    storageBucket: "osls-644fd.appspot.com",
    messagingSenderId: "798578046321",
    appId: "1:798578046321:web:8758776701786a2fccf2d0",
    measurementId: "G-9HWXNSBE1T",
  };

  const adminAppDiv = document.getElementById("adminApp");
  const logoutBtn = document.getElementById("logoutBtn");
  const messagesBtn = document.getElementById("messagesBtn");
  const messagesBadge = document.getElementById("messagesBadge");

  let currentUid = null;
  let currentRole = ROLES.ME;
  let _initialLoaded = false;
  let _rtBound = false;
  let _rtRerenderTO = null;

  // Live caches (expose globally for cross-module access)
  window._stores = window._stores || {};
  window._users = window._users || {};
  window._reviews = window._reviews || {};
  window._guestinfo = window._guestinfo || {};
  window._sales = window._sales || {};

  // Performance highlight expanded state flags
  window._perf_expand_reviews = window._perf_expand_reviews ?? false;
  window._perf_expand_stores = window._perf_expand_stores ?? false;
  window._perf_expand_users = window._perf_expand_users ?? false;

  /* --------------------------------------------------------------------
   * Initialize Firebase (guarded)
   * ------------------------------------------------------------------ */
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  const db = firebase.database();
  const auth = firebase.auth();

  // Expose db and auth globally for modules
  window.db = db;
  window.auth = auth;

  /* ====================================================================
   * AUTH STATE & INITIAL LOAD
   * ================================================================== */
  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      window.location.href = "../../index.html";
      return;
    }

    currentUid = user.uid;
    window.currentUid = currentUid;

    // Fetch or create normalized profile record
    const snap = await db.ref("users/" + user.uid).get();
    const prof = snap.val() || {
      role: ROLES.ME,
      name: user.displayName || user.email,
      email: user.email,
    };
    currentRole = (prof.role || ROLES.ME).toLowerCase();
    window.currentRole = currentRole;

    await db.ref("users/" + user.uid).update(prof);

    if (logoutBtn) logoutBtn.addEventListener("click", () => auth.signOut());

    if (messagesBtn) {
      messagesBtn.addEventListener("click", () => {
        if (window.messages?.openOverlay) window.messages.openOverlay();
      });
    }
    if (messagesBadge && window.messages?.setBadgeEl) {
      window.messages.setBadgeEl(messagesBadge);
    }

    await initialLoad();
    ensureRealtime();

    if (window.guestinfo?.ensureRealtime) window.guestinfo.ensureRealtime();

    initMessagesModule();
  });

  /* --------------------------------------------------------------------
   * Messages Module Init / Badge Update
   * ------------------------------------------------------------------ */
  function initMessagesModule() {
    if (!window.messages) return;
    if (messagesBadge && window.messages.setBadgeEl) {
      window.messages.setBadgeEl(messagesBadge);
    }
    if (typeof window.messages.init === "function") {
      window.messages.init(currentUid, currentRole);
    }
  }
  window.updateMessagesBadge = function (count) {
    if (!messagesBadge) return;
    messagesBadge.textContent = count > 0 ? String(count) : "";
    messagesBadge.style.display = count > 0 ? "" : "none";
  };

  /* ====================================================================
   * INITIAL BULK DATA LOAD
   * ================================================================== */
  async function initialLoad() {
    if (adminAppDiv) adminAppDiv.innerHTML = `<div>Loading data…</div>`;

    const [storesSnap, usersSnap, reviewsSnap, guestSnap, salesSnap] = await Promise.all([
      db.ref("stores").get(),
      db.ref("users").get(),
      db.ref("reviews").get(),
      db.ref("guestinfo").get(),
      db.ref("sales").get(),
    ]);

    window._stores = storesSnap.val() || {};
    window._users = usersSnap.val() || {};
    window._reviews = reviewsSnap.val() || {};
    window._guestinfo = guestSnap.val() || {};
    window._sales = salesSnap.val() || {};

    _initialLoaded = true;
    renderAdminApp();
  }

  /* ====================================================================
   * RENDER MAIN APP
   * ================================================================== */
  function renderAdminApp() {
    if (!_initialLoaded) return;

    const { _stores: stores, _users: users, _reviews: reviews, _guestinfo: guestinfo, _sales: sales } = window;

    const giActionableCount = guestInfoActionableCount(guestinfo, users, currentRole, currentUid);
    const guestsCaught = giActionableCount === 0;

    const perf = performanceStatus(reviews, stores, users, currentRole, currentUid);
    const perfEligible = currentRole !== ROLES.ME;
    const perfGood = perfEligible && perf.allGood;

    let guestinfoHtml = guestsCaught
      ? caughtUpUnifiedHtml()
      : window.guestinfo?.renderGuestinfoSection
      ? window.guestinfo.renderGuestinfoSection(guestinfo, users, currentUid, currentRole)
      : `<section class="admin-section guestinfo-section"><h2>Guest Info</h2><p class="text-center">Module not loaded.</p></section>`;

    let perfHighlightsHtml = "";
    let storesHtml = "";
    let usersHtml = "";
    let reviewsHtml = "";

    if (perfGood) {
      perfHighlightsHtml = perfHighlightsHtmlFn(perf, currentRole);

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

    const roleMgmtHtml = typeof window.renderRoleManagementSection === "function"
      ? window.renderRoleManagementSection(currentRole)
      : "";

    if (adminAppDiv) {
      adminAppDiv.innerHTML = `
        ${guestinfoHtml}
        ${perfHighlightsHtml}
        ${storesHtml}
        ${usersHtml}
        ${reviewsHtml}
        ${roleMgmtHtml}
      `;
    }

    // Build filtered reviews cache
    window._filteredReviews = window.reviews?.filterReviewsByRole
      ? Object.entries(window.reviews.filterReviewsByRole(reviews, users, currentUid, currentRole)).sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0))
      : Object.entries(reviews).sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));
  }

  /* ====================================================================
   * PERFORMANCE HIGHLIGHTS HTML HELPER
   * ================================================================== */
  function perfHighlightsHtmlFn(ps, role) {
    const avg = ps.avgRating != null ? ps.avgRating.toFixed(1) : "–";
    const ratState = ps.avgRating == null ? "warn" : ps.avgRating >= 4.7 ? "good" : ps.avgRating >= 4 ? "warn" : "bad";

    const showStores = role !== ROLES.ME;
    const staffRatio = ps.staffGoalTotal > 0 ? ps.staffTotal / ps.staffGoalTotal : null;
    const stState = !showStores ? "warn" : ps.staffGoalTotal === 0 ? "warn" : stateClassFromRatio(staffRatio, 1, 0.5);
    const staffLbl = showStores ? `${ps.staffTotal}/${ps.staffGoalTotal || "?"}` : "";

    const budRatio = ps.budgetGoal > 0 ? ps.budgetUnits / ps.budgetGoal : null;
    const budState = !showStores ? "warn" : ps.budgetGoal === 0 ? "good" : stateClassFromRatio(budRatio, 1, 0.7);
    const budPct = ps.budgetGoal > 0 ? Math.round((ps.budgetUnits / ps.budgetGoal) * 100) : null;
    const budLbl = showStores ? (ps.budgetGoal > 0 ? `${budPct}%` : `${ps.budgetUnits}u`) : "";

    return `
      <section class="admin-section perf-highlights-section" id="perf-highlights-section">
        <h2>Performance Highlights</h2>
        <div class="perf-hl-row">
          <button type="button" class="perf-hl-btn ${ratState}" onclick="window.perfToggleReviews()" aria-label="View Reviews">
            <span class="ph-icon">⭐</span><span class="ph-label">Ratings</span><span class="ph-val">${avg}</span>
          </button>
          ${showStores ? `<button type="button" class="perf-hl-btn ${stState}" onclick="window.perfToggleUsers()" aria-label="View Staffing">
            <span class="ph-icon">👥</span><span class="ph-label">Staffing</span><span class="ph-val">${staffLbl}</span>
          </button>` : ""}
          ${showStores ? `<button type="button" class="perf-hl-btn ${budState}" onclick="window.perfToggleStores()" aria-label="View Budget Progress">
            <span class="ph-icon">📈</span><span class="ph-label">Budget</span><span class="ph-val">${budLbl}</span>
          </button>` : ""}
        </div>
      </section>`;
  }

  /* ====================================================================
   * PERFORMANCE STATUS CALCULATION
   * ================================================================== */
  function performanceStatus(reviews, stores, users, role, uid) {
    const rvArr = visibleReviewsArray(reviews, users, role, uid);
    const avgRating = avgRatingVisible(rvArr);
    const ratingsGood = avgRating != null ? avgRating >= 4.7 : false;

    const stArr = visibleStoresArray(stores, role, uid);
    const mtdMap = salesMtdMap();

    let staffingGood = true, budgetGood = true;
    let staffTotal = 0, staffGoalTotal = 0, budgetUnits = 0, budgetGoal = 0;

    for (const [, s] of stArr) {
      const staff = storeStaffingMet(s, users);
      staffTotal += staff.total;
      staffGoalTotal += staff.goal;
      if (!staff.met) staffingGood = false;

      const bud = storeBudgetMet(s, mtdMap);
      budgetUnits += bud.units;
      budgetGoal += bud.goal;
      if (!bud.met) budgetGood = false;
    }

    return {
      ratingsGood,
      staffingGood,
      budgetGood,
      allGood: ratingsGood && staffingGood && budgetGood,
      avgRating,
      staffTotal,
      staffGoalTotal,
      budgetUnits,
      budgetGoal,
      reviewCount: rvArr.length,
      storeCount: stArr.length,
    };
  }

  /* ====================================================================
   * HELPER UTILITIES
   * ================================================================== */
  // Roles checks
  const _isAdmin = (r) => r === ROLES.ADMIN;
  const _isDM = (r) => r === ROLES.DM;
  const _isLead = (r) => r === ROLES.LEAD;
  const _isMe = (r) => r === ROLES.ME;

  // Guest Info actionable count
  function guestInfoActionableCount(guestinfo, users, role, uid) {
    if (!guestinfo) return 0;
    if (window._guestinfo_soldOnly || window._guestinfo_showProposals) return 1; // ignore caught up for alt views

    const weekFilter = _isMe(role) ? true : window._guestinfo_filterMode === "week";

    let count = 0;
    for (const [, g] of Object.entries(guestinfo)) {
      if (_isAdmin(role)) {
        // all visible
      } else if (_isDM(role)) {
        const under = usersUnderDM(users, uid);
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
      if (weekFilter && !guestInfoInCurrentWeek(g)) continue;

      const st = guestInfoDetectStatus(g);
      if (st !== "sold") count++;
    }
    return count;
  }

  // DM subtree users under this DM (leads + MEs under those leads)
  function usersUnderDM(users, dmUid) {
    const leads = Object.entries(users || {})
      .filter(([, u]) => u.role === ROLES.LEAD && u.assignedDM === dmUid)
      .map(([id]) => id);
    const mes = Object.entries(users || {})
      .filter(([, u]) => u.role === ROLES.ME && leads.includes(u.assignedLead))
      .map(([id]) => id);
    return new Set([...leads, ...mes]);
  }

  // Guest info helper: latest timestamp
  function guestInfoLatestTs(g) {
    return Math.max(g.updatedAt || 0, g.submittedAt || 0, g.sale?.soldAt || 0, g.solution?.completedAt || 0);
  }

  // Guest info filter: rolling 7 days by latest activity
  function guestInfoInCurrentWeek(g) {
    return guestInfoLatestTs(g) >= Date.now() - 7 * 24 * 60 * 60 * 1000;
  }

  // Guest info status detection
  function guestInfoDetectStatus(g) {
    if (g.status) return g.status.toLowerCase();
    if (g.sale) return "sold";
    if (g.solution) return "proposal";
    if (g.evaluate) return "working";
    return "new";
  }

  // Visible reviews (with optional role filtering)
  function visibleReviewsArray(reviews, users, role, uid) {
    if (window.reviews?.filterReviewsByRole) {
      return Object.entries(window.reviews.filterReviewsByRole(reviews, users, uid, role));
    }
    return Object.entries(reviews || {});
  }

  // Average rating from reviews array
  function avgRatingVisible(reviewsArr) {
    if (!reviewsArr.length) return null;
    let sum = 0,
      n = 0;
    for (const [, r] of reviewsArr) {
      const v = Number(r.rating || 0);
      if (!isNaN(v) && v > 0) {
        sum += v;
        n++;
      }
    }
    return n ? sum / n : null;
  }

  // Visible stores per role
  function visibleStoresArray(stores, role, uid) {
    if (_isAdmin(role) || _isDM(role)) return Object.entries(stores || {});
    if (_isLead(role)) return Object.entries(stores || {}).filter(([, s]) => s.teamLeadUid === uid);
    return [];
  }

  // Count leads and MEs per store
  function storePeopleCounts(storeRec, users) {
    const sn = (storeRec.storeNumber || "").toString().trim();
    const tlUid = storeRec.teamLeadUid;
    let leads = 0,
      mes = 0;
    for (const [uid, u] of Object.entries(users || {})) {
      if (u.role === ROLES.LEAD) {
        if ((tlUid && uid === tlUid) || (sn && u.store === sn)) leads++;
      } else if (u.role === ROLES.ME) {
        if ((sn && u.store === sn) || (tlUid && u.assignedLead === tlUid)) mes++;
      }
    }
    if (tlUid && leads === 0) leads = 1; // Assume 1 TL if assigned but not counted
    return { leads, mes, total: leads + mes };
  }

  // Staffing goal met?
  function storeStaffingMet(storeRec, users) {
    const goal = Number(storeRec.staffGoal ?? 2);
    const { total } = storePeopleCounts(storeRec, users);
    return { met: total >= goal, goal, total };
  }

  // Sales Month-To-Date map (count/units per store)
  function salesMtdMap() {
    if (window.stores?.summarizeSalesByStoreMTD) {
      return window.stores.summarizeSalesByStoreMTD(window._sales, window._stores, window._guestinfo, window._users);
    }
    const out = {};
    const mStart = (() => {
      const d = new Date();
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    })();
    for (const [, s] of Object.entries(window._sales || {})) {
      const ts = s.createdAt || s.soldAt || 0;
      if (ts < mStart) continue;
      const sn = (s.storeNumber || "").toString().trim() || "__";
      if (!out[sn]) out[sn] = { count: 0, units: 0 };
      out[sn].count++;
      out[sn].units += Number(s.units || 0);
    }
    return out;
  }

  // Budget met per store
  function storeBudgetMet(storeRec, mtdMap) {
    const goal = Number(storeRec.budgetUnits || 0);
    if (!goal) return { met: true, goal: 0, units: 0, pct: null };
    const sn = (storeRec.storeNumber || "").toString().trim();
    const summ = mtdMap[sn];
    const units = summ?.units || 0;
    const met = units >= goal;
    const pct = goal ? (units / goal) * 100 : null;
    return { met, goal, units, pct };
  }

  // State class helpers
  function stateClassFromBool(b, fallbackWarn = true) {
    return b ? "good" : fallbackWarn ? "warn" : "bad";
  }
  function stateClassFromRatio(r, goodThr = 1, warnThr = 0.5) {
    if (isNaN(r)) return "warn";
    if (r >= goodThr) return "good";
    if (r >= warnThr) return "warn";
    return "bad";
  }

  // Guest caught-up unified HTML
  function caughtUpUnifiedHtml(msg = "You're all caught up!") {
    return `
      <section class="admin-section guest-caughtup-section" id="guest-caughtup-section">
        <h2>Guest Queue</h2>
        <div class="guestinfo-empty-all text-center" style="margin-top:16px;">
          <p><b>${msg}</b></p>
          <p style="opacity:.8;">No open leads right now.</p>
          <button class="button button--success button--large" onclick="window.guestinfo.createNewLead()">+ New Lead</button>
        </div>
      </section>
    `;
  }

  /* ====================================================================
   * PERFORMANCE HIGHLIGHT TOGGLES (Exposed Globally)
   * ================================================================== */
  window.perfToggleReviews = () => {
    window._perf_expand_reviews = !window._perf_expand_reviews;
    renderAdminApp();
  };
  window.perfToggleStores = () => {
    window._perf_expand_stores = !window._perf_expand_stores;
    renderAdminApp();
  };
  window.perfToggleUsers = () => {
    window._perf_expand_users = !window._perf_expand_users;
    renderAdminApp();
  };

  /* ====================================================================
   * REALTIME LISTENERS (Throttled Render)
   * ================================================================== */
  function ensureRealtime() {
    if (_rtBound) return;
    _rtBound = true;

    const scheduleRender = () => {
      if (_rtRerenderTO) return;
      _rtRerenderTO = setTimeout(() => {
        _rtRerenderTO = null;
        renderAdminApp();
      }, 100);
    };

    function bindRefEvents(ref, objCache, onChildChangedExtra) {
      ref.on("child_added", (snap) => {
        objCache[snap.key] = snap.val();
        scheduleRender();
      });
      ref.on("child_changed", (snap) => {
        objCache[snap.key] = snap.val();
        if (onChildChangedExtra) onChildChangedExtra(snap);
        scheduleRender();
      });
      ref.on("child_removed", (snap) => {
        delete objCache[snap.key];
        scheduleRender();
      });
    }

    bindRefEvents(db.ref("stores"), window._stores);
    bindRefEvents(db.ref("users"), window._users, (snap) => {
      if (snap.key === currentUid) {
        currentRole = (snap.val()?.role || ROLES.ME).toLowerCase();
        window.currentRole = currentRole;
        initMessagesModule();
      }
    });
    bindRefEvents(db.ref("reviews"), window._reviews);
    bindRefEvents(db.ref("guestinfo"), window._guestinfo);
    bindRefEvents(db.ref("sales"), window._sales);
  }

  /* ====================================================================
   * MODULE ACTION PASSTHROUGHS (Global functions for UI modules)
   * ================================================================== */
  // Stores
  window.assignTL = (storeId, uid) => window.stores.assignTL(storeId, uid);
  window.updateStoreNumber = (id, val) => window.stores.updateStoreNumber(id, val);
  window.addStore = () => window.stores.addStore();
  window.deleteStore = (id) => window.stores.deleteStore(id);

  // Users
  window.assignLeadToGuest = (guestUid, leadUid) => window.users.assignLeadToGuest(guestUid, leadUid);
  window.assignDMToLead = (leadUid, dmUid) => window.users.assignDMToLead(leadUid, dmUid);
  window.editUserStore = async (uid) => window.users?.editUserStore ? window.users.editUserStore(uid) : undefined;

  // Reviews
  window.toggleStar = (id, starred) => window.reviews.toggleStar(id, starred);
  window.deleteReview = (id) => window.reviews.deleteReview(id);

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

  // Guest Info
  window.deleteGuestInfoEntry = (id) => window.guestinfo.deleteGuestInfoEntry(id);
  window.continueGuestInfo = (id) => window.guestinfo.continueGuestInfo(id);

  /* --------------------------------------------------------------------
   * Expose main render function for modules
   * ------------------------------------------------------------------ */
  window.renderAdminApp = renderAdminApp;

})();