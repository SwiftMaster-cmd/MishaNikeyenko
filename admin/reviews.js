(() => {
  const ROLES = { ME: "me", LEAD: "lead", DM: "dm", ADMIN: "admin" };

  function canDelete(role) {
    return role === ROLES.ADMIN;
  }

  function assertDelete() {
    if (!canDelete(window.currentRole)) throw "PERM_DENIED_DELETE";
  }

  // Filter reviews visible to current user based on role and assignments
  function filterReviewsByRole(reviews, users, currentUid, currentRole) {
    if (!reviews || !users || !currentUid || !currentRole) return {};

    const currentUser = users[currentUid] || {};

    if (currentRole === ROLES.ADMIN) return reviews;

    let visibleStores = new Set();

    if (currentRole === ROLES.DM) {
      for (const [uid, user] of Object.entries(users)) {
        if (user.role === ROLES.LEAD && user.assignedDM === currentUid && user.store) {
          visibleStores.add(user.store);
        }
      }
    } else if (currentRole === ROLES.LEAD || currentRole === ROLES.ME) {
      if (currentUser.store) visibleStores.add(currentUser.store);
    }

    return Object.fromEntries(
      Object.entries(reviews).filter(([id, r]) => visibleStores.has(r.store))
    );
  }

  // Convert reviews entries to HTML
  function reviewsToHtml(reviewEntries) {
    if (!reviewEntries.length) return `<p class="text-center">No reviews.</p>`;

    return reviewEntries.map(([id, r]) => `
      <div class="review-card">
        <div class="review-header">
          <span class="review-star">&#9733;</span>
          <div><b>Store:</b> ${r.store || '-'}</div>
          <div><b>Associate:</b> ${r.associate || '-'}</div>
          ${canDelete(window.currentRole) ? `<button class="btn btn-danger btn-sm" onclick="window.reviews.deleteReview('${id}')">Delete</button>` : ''}
        </div>
        <div class="review-rating">${'★'.repeat(r.rating || 0)}</div>
        <div class="review-comment">${r.comment || ''}</div>
        <div class="review-meta"><b>When:</b> ${r.timestamp ? new Date(r.timestamp).toLocaleString() : '-'}</div>
        <div class="review-meta"><b>Referral:</b> ${r.refName ? `${r.refName} / ${r.refPhone}` : '-'}</div>
      </div>
    `).join('');
  }

  async function toggleStar(id, starred) {
    if (window.currentRole === ROLES.ME) return; // ME can't edit
    await window.db.ref(`reviews/${id}/starred`).set(!starred);
    await window.renderAdminApp();
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

  // Main render: receives all reviews, user info and role
  function renderReviewsSection(reviews, currentRole, users, currentUid) {
    const filteredReviews = filterReviewsByRole(reviews, users, currentUid, currentRole);
    const sortedEntries = Object.entries(filteredReviews).sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));
    return `
      <section class="admin-section reviews-section">
        <h2>Reviews</h2>
        <div class="review-controls"><button onclick="window.reviews.renderReviewsReload()">Reload</button></div>
        <div class="reviews-container">
          ${reviewsToHtml(sortedEntries)}
        </div>
      </section>
    `;
  }

  window.reviews = {
    renderReviewsSection,
    deleteReview,
    toggleStar,
    renderReviewsReload,
    filterReviewsByRole,
    reviewsToHtml
  };
})();