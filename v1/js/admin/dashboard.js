/* dashboard.js */
(() => {
  "use strict";

  const ROLES = window.ROLES || { ME:"me", LEAD:"lead", DM:"dm", ADMIN:"admin" };

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

  const db = firebase.database();
  const auth = firebase.auth();

  window.db = db;
  window.auth = auth;

  let currentUid = null;
  let currentRole = ROLES.ME;

  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      window.location.href = "../../index.html";
      return;
    }

    currentUid = user.uid;
    window.currentUid = currentUid;

    const snap = await db.ref("users/" + currentUid).get();
    const prof = snap.val() || {
      role: ROLES.ME,
      name: user.displayName || user.email,
      email: user.email
    };

    currentRole = (prof.role || ROLES.ME).toLowerCase();
    window.currentRole = currentRole;

    await db.ref("users/" + currentUid).update(prof);

    // Initialize all modules here
    if (window.guestforms) window.guestforms.init(currentUid, currentRole);
    if (window.guestinfo) window.guestinfo.init(currentUid, currentRole);
    if (window.users) window.users.init(currentUid, currentRole);
    if (window.reviews) window.reviews.init(currentUid, currentRole);
    if (window.stores) window.stores.init(currentUid, currentRole);
    if (window.messages) window.messages.init(currentUid, currentRole);

    // Bind logout button if exists
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", () => auth.signOut());
    }
  });

})();