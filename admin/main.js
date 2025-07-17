// ========================================================================
// Auth & Entry Point for Admin Dashboard
// ========================================================================
const adminAppDiv = document.getElementById("adminApp");

auth.onAuthStateChanged(async user => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  currentUid = user.uid;
  const snap = await db.ref("users/" + user.uid).get();
  const prof = snap.val() || {
    role : ROLES.ME,
    name : user.displayName || user.email,
    email: user.email
  };

  await db.ref("users/" + user.uid).update(prof);

  currentRole = prof.role || ROLES.ME;
  document.getElementById("logoutBtn")?.addEventListener("click", () => auth.signOut());

  renderAdminApp(); // call render from main entry
});