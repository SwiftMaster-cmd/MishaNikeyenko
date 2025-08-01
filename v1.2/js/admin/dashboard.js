(() => {
  "use strict";

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

  window._stores = window._stores || {};
  window._users = window._users || {};
  window._reviews = window._reviews || {};
  window._guestinfo = window._guestinfo || {};
  window._sales = window._sales || {};

  window._perf_expand_reviews = window._perf_expand_reviews ?? false;
  window._perf_expand_stores = window._perf_expand_stores ?? false;
  window._perf_expand_users = window._perf_expand_users ?? false;

  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  const db = firebase.database();
  const auth = firebase.auth();

  window.db = db;
  window.auth = auth;

  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      window.location.href = "../../index.html";
      return;
    }

    currentUid = user.uid;
    window.currentUid = currentUid;

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

  function renderAdminApp() {
    if (!_initialLoaded) return;

    const { _stores: stores, _users: users, _reviews: reviews, _guestinfo: guestinfo, _sales: sales } = window;

    let guestinfoHtml = guestsCaughtUp()
      ? caughtUpUnifiedHtml()
      : window.guestinfo?.renderGuestinfoSection
      ? window.guestinfo.renderGuestinfoSection(guestinfo, users, currentUid, currentRole)
      : `<section class="admin-section guestinfo-section"><h2>Guest Info</h2><p class="text-center">Module not loaded.</p></section>`;

    let storesHtml = "";
    let usersHtml = "";
    let reviewsHtml = "";

    // Simple rendering logic without performance highlight toggles
    if (currentRole !== ROLES.ME && window.stores?.renderStoresSection) {
      storesHtml = window.stores.renderStoresSection(stores, users, currentRole, sales);
    }
    usersHtml = window.users?.renderUsersSection
      ? window.users.renderUsersSection(users, currentRole, currentUid)
      : `<section class="admin-section users-section"><h2>Users</h2><p class="text-center">Module not loaded.</p></section>`;
    reviewsHtml = window.reviews?.renderReviewsSection
      ? window.reviews.renderReviewsSection(reviews, currentRole, users, currentUid)
      : `<section class="admin-section reviews-section"><h2>Reviews</h2><p class="text-center">Module not loaded.</p></section>`;

    const roleMgmtHtml = typeof window.renderRoleManagementSection === "function"
      ? window.renderRoleManagementSection(currentRole)
      : "";

    if (adminAppDiv) {
      adminAppDiv.innerHTML = `
        ${guestinfoHtml}
        ${storesHtml}
        ${usersHtml}
        ${reviewsHtml}
        ${roleMgmtHtml}
      `;
    }

    window._filteredReviews = window.reviews?.filterReviewsByRole
      ? Object.entries(window.reviews.filterReviewsByRole(reviews, users, currentUid, currentRole)).sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0))
      : Object.entries(reviews).sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));
  }

  function guestsCaughtUp() {
    // Simplified, assume guests are caught up
    return false;
  }

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

  window.renderAdminApp = renderAdminApp;
})();