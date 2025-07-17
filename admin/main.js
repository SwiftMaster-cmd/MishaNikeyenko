// --- Firebase Init ---
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
firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const auth = firebase.auth();

// --- Auth + Load ---
auth.onAuthStateChanged(async user => {
  if (!user) return window.location.href = "index.html";
  const snap = await db.ref("users/" + user.uid).get();
  const prof = snap.val() || {
    role: "me",
    name: user.displayName || user.email,
    email: user.email
  };
  await db.ref("users/" + user.uid).update(prof);

  window.currentUid = user.uid;
  window.currentRole = prof.role;
  document.getElementById("logoutBtn")?.addEventListener("click", () => auth.signOut());

  renderDashboard(); // Trigger full admin view
});

// --- Master Render ---
async function renderDashboard() {
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

  document.getElementById("adminApp").innerHTML =
    renderStoreSection(stores, users) +
    renderUserSection(users) +
    renderReviewSection(reviews) +
    renderGuestInfoSection(guestinfo, users) +
    renderGuestFormsSection();
}