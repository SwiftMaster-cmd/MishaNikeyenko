(() => {
  const ROLES = { ME: "me", LEAD: "lead", DM: "dm", ADMIN: "admin" };

  function canDelete(role) {
    return role === ROLES.ADMIN;
  }

  function assertDelete() {
    if (!canDelete(window.currentRole)) throw "PERM_DENIED_DELETE";
  }

  // Filter reviews by store based on user role and their assigned stores
  function filterReviewsByRole(reviews, users, currentUid, currentRole) {
    if (!reviews || !users || !currentUid || !currentRole) return {};

    const currentUser = users[currentUid] || {};

    // Admin sees all
    if (currentRole === ROLES.ADMIN) return reviews;

    // Helper: collect store numbers user manages/sees
    let visibleStores = new Set();

    if (currentRole === ROLES.DM) {
      // All stores assigned to DM (where store.teamLeadUid is a Lead with assignedDM = currentUid)
      for (const [uid, user] of Object.entries(users)) {
        if (user.role === ROLES.LEAD && user.assignedDM === currentUid && user.store) {
          visibleStores.add(user.store);
        }
      }
    } else if (currentRole === ROLES.LEAD) {
      // Lead sees reviews for their store only
      if (currentUser.store) visibleStores.add(currentUser.store);
    } else if (currentRole === ROLES.ME) {
      // ME sees reviews for their store only
      if (currentUser.store) visibleStores.add(currentUser.store);
    }

    // Filter reviews to only those stores
    return Object.fromEntries(
      Object.entries(reviews).filter(([id, r]) => visibleStores.has(r.store))
    );
  }

  function renderReviewsSection(reviews, currentRole, users, currentUid) {
    // Apply store-based filtering per role
    const filteredReviews = filterReviewsByRole(reviews, users, currentUid, currentRole);
    const reviewEntries = Object.entries(filteredReviews).sort((a,b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));

    if (!reviewEntries.length) return `<p class="text-center">No reviews.</p>`;

    return `
      <section class="admin-section reviews-section">
        <h2>Reviews</h2>
        <div class="review-controls"><button onclick="window.reviews.renderReviewsReload()">Reload</button></div>
        <div class="reviews-container">
          ${reviewEntries.map(([id,r]) => `
            <div class="review-card">
              <div class="review-header">
                <span class="review-star">&#9733;</span>
                <div><b>Store:</b> ${r.store || '-'}</div>
                <div><b>Associate:</b> ${r.associate || '-'}</div>
                ${canDelete(currentRole) ? `<button class="btn btn-danger btn-sm" onclick="window.reviews.deleteReview('${id}')">Delete</button>` : ''}
              </div>
              <div class="review-rating">${'★'.repeat(r.rating || 0)}</div>
              <div class="review-comment">${r.comment || ''}</div>
              <div class="review-meta"><b>When:</b> ${r.timestamp ? new Date(r.timestamp).toLocaleString() : '-'}</div>
              <div class="review-meta"><b>Referral:</b> ${r.refName ? `${r.refName} / ${r.refPhone}` : '-'}</div>
            </div>`).join('')}
        </div>
      </section>
    `;
  }

  async function deleteReview(id) {
    assertDelete();
    if (confirm("Delete this review?")) {
      await window.db.ref(`reviews/${id}`).remove();
      await window.renderAdminApp();
    }
  }

  function renderReviewsReload() {
    window.renderAdminApp();
  }

  window.reviews = {
    renderReviewsSection,
    deleteReview,
    renderReviewsReload
  };
})();