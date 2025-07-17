// main.js

auth.onAuthStateChanged(async user => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  currentUid = user.uid;
  const snap = await db.ref("users/" + user.uid).get();
  const prof = snap.val() || {
    role: ROLES.ME,
    name: user.displayName || user.email,
    email: user.email
  };
  await db.ref("users/" + user.uid).update(prof);

  currentRole = prof.role || ROLES.ME;
  document.getElementById("logoutBtn")?.addEventListener("click", () => auth.signOut());

  renderAdminApp();
});

async function renderAdminApp() {
  adminAppDiv.innerHTML = "<div>Loading data…</div>";

  const [storesSnap, usersSnap, reviewsSnap, guestSnap] = await Promise.all([
    db.ref("stores").get(),
    db.ref("users").get(),
    db.ref("reviews").get(),
    db.ref("guestinfo").get()
  ]);

  const stores = storesSnap.val() || {};
  const users = usersSnap.val() || {};
  const reviews = reviewsSnap.val() || {};
  const guestinfo = guestSnap.val() || {};

  const storeSection  = await renderStoresSection(stores, users);
  const userSection   = await renderUsersSection(users);
  const reviewSection = await renderReviewsSection(reviews);
  const guestSection  = await renderGuestInfoSection(guestinfo, users);

  adminAppDiv.innerHTML = storeSection + userSection + reviewSection + guestSection;

  // Store for filtering
  window._users  = users;
  window._stores = stores;
}