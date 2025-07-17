// ========================================================================
// Main Admin Panel Renderer (main.js)
// ========================================================================

window.renderAdminApp = async function () {
  document.getElementById("adminApp").innerHTML = "<div>Loading data…</div>";

  try {
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

    window._users = users;
    window._stores = stores;
    window._allReviews = Object.entries(reviews).sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));
    window._allReviewsHtml = reviewsToHtml(_allReviews);

    document.getElementById("adminApp").innerHTML = `
      <section class="admin-section stores-section">
        <h2>Stores</h2>
        ${renderStoresSection(stores, users)}
      </section>

      <section class="admin-section users-section">
        <h2>Users</h2>
        ${renderUsersSection(users)}
      </section>

      <section class="admin-section reviews-section">
        <h2>Reviews</h2>
        <div class="review-controls">
          <button onclick="renderAdminApp()">Reload</button>
          <button onclick="clearReviewFilter()">Clear Filter</button>
        </div>
        <div class="reviews-container">${_allReviewsHtml}</div>
      </section>

      <section class="admin-section guestinfo-section">
        <h2>Guest Info</h2>
        ${renderGuestInfoSection(guestinfo, users)}
      </section>
    `;
  } catch (err) {
    document.getElementById("adminApp").innerHTML = `<p style="color:red;">Error loading data: ${err.message}</p>`;
  }
};