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

  window._guestinfo = window._guestinfo || {};
  window._reviews = window._reviews || {};
  window._users = window._users || {};

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
    if (window.reviews?.ensureRealtime) window.reviews.ensureRealtime();

    if (window.messages?.init) {
      window.messages.init(currentUid, currentRole);
    }
  });

  async function initialLoad() {
    if (adminAppDiv) adminAppDiv.innerHTML = `<div>Loading data…</div>`;

    const [guestSnap, reviewsSnap, usersSnap] = await Promise.all([
      db.ref("guestinfo").get(),
      db.ref("reviews").get(),
      db.ref("users").get(),
    ]);

    window._guestinfo = guestSnap.val() || {};
    window._reviews = reviewsSnap.val() || {};
    window._users = usersSnap.val() || {};

    _initialLoaded = true;
    renderAdminApp();
  }

  function renderAdminApp() {
    if (!_initialLoaded) return;

    const { _guestinfo: guestinfo, _reviews: reviews, _users: users, currentUid, currentRole } = window;

    let guestinfoHtml = window.guestinfo?.renderGuestinfoSection
      ? window.guestinfo.renderGuestinfoSection(guestinfo, users, currentUid, currentRole)
      : `<section class="admin-section guestinfo-section"><h2>Guest Info</h2><p class="text-center">Module not loaded.</p></section>`;

    let reviewsHtml = window.reviews?.renderReviewsSection
      ? window.reviews.renderReviewsSection(reviews, currentRole, users, currentUid)
      : `<section class="admin-section reviews-section"><h2>Reviews</h2><p class="text-center">Module not loaded.</p></section>`;

    if (adminAppDiv) {
      adminAppDiv.innerHTML = `
        <div id="guestInfoContainer">${guestinfoHtml}</div>
        ${reviewsHtml}
      `;
    }
  }

  function ensureRealtime() {
    if (_rtBound) return;
    _rtBound = true;

    const scheduleGuestInfoRender = () => {
      if (window._guestInfoRerenderTO) return;
      window._guestInfoRerenderTO = setTimeout(() => {
        window._guestInfoRerenderTO = null;
        renderAdminApp();
      }, 150);
    };

    const scheduleReviewsRender = () => {
      if (window._reviewsRerenderTO) return;
      window._reviewsRerenderTO = setTimeout(() => {
        window._reviewsRerenderTO = null;
        renderAdminApp();
      }, 200);
    };

    const bindRefEvents = (ref, objCache, isGuestinfo = false, isReviews = false) => {
      ref.on("child_added", (snap) => {
        objCache[snap.key] = snap.val();
        if (isGuestinfo) scheduleGuestInfoRender();
        else if (isReviews) scheduleReviewsRender();
      });
      ref.on("child_changed", (snap) => {
        objCache[snap.key] = snap.val();
        if (isGuestinfo) scheduleGuestInfoRender();
        else if (isReviews) scheduleReviewsRender();
      });
      ref.on("child_removed", (snap) => {
        delete objCache[snap.key];
        if (isGuestinfo) scheduleGuestInfoRender();
        else if (isReviews) scheduleReviewsRender();
      });
    };

    bindRefEvents(db.ref("guestinfo"), window._guestinfo, true, false);
    bindRefEvents(db.ref("reviews"), window._reviews, false, true);
    bindRefEvents(db.ref("users"), window._users);
  }

  window.renderAdminApp = renderAdminApp;
})();