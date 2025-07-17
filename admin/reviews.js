(() => {
  const ROLES = { ME: "me", LEAD: "lead", DM: "dm", ADMIN: "admin" };

  function canDelete(role) {
    return role === ROLES.ADMIN;
  }

  function assertDelete() {
    if (!canDelete(window.currentRole)) throw "PERM_DENIED_DELETE";
  }

  // Filtering and sorting helpers
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

  // Sort options
  const SORT_OPTIONS = {
    newest: (a,b) => (b[1].timestamp||0) - (a[1].timestamp||0),
    oldest: (a,b) => (a[1].timestamp||0) - (b[1].timestamp||0),
    highest: (a,b) => (b[1].rating||0) - (a[1].rating||0),
    lowest: (a,b) => (a[1].rating||0) - (b[1].rating||0),
  };

  // State for pagination and sorting
  let reviewsState = {
    sortedEntries: [],
    sortBy: 'newest',
    shownCount: 3,
  };

  // Render the full reviews section with filters and pagination
  function renderReviewsSection(reviews, currentRole, users, currentUid) {
    const filtered = filterReviewsByRole(reviews, users, currentUid, currentRole);
    let entries = Object.entries(filtered);
    entries.sort(SORT_OPTIONS[reviewsState.sortBy] || SORT_OPTIONS.newest);
    reviewsState.sortedEntries = entries;

    const displayed = entries.slice(0, reviewsState.shownCount);

    if (entries.length === 0) return `<p class="text-center">No reviews.</p>`;

    return `
      <section class="admin-section reviews-section">
        <h2>Reviews</h2>
        <div style="display:flex; justify-content: space-between; align-items:center; margin-bottom: 12px;">
          <div>
            <button onclick="window.reviews.renderReviewsReload()">Reload</button>
          </div>
          <div>
            <label for="sortReviewsSelect" style="font-weight: 600; margin-right: 8px;">Sort:</label>
            <select id="sortReviewsSelect" onchange="window.reviews.changeSort(this.value)">
              <option value="newest" ${reviewsState.sortBy === 'newest' ? 'selected' : ''}>Newest First</option>
              <option value="oldest" ${reviewsState.sortBy === 'oldest' ? 'selected' : ''}>Oldest First</option>
              <option value="highest" ${reviewsState.sortBy === 'highest' ? 'selected' : ''}>Highest Rated</option>
              <option value="lowest" ${reviewsState.sortBy === 'lowest' ? 'selected' : ''}>Lowest Rated</option>
            </select>
          </div>
        </div>
        <div class="reviews-container">
          ${displayed.map(([id,r]) => `
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
        ${reviewsState.shownCount < entries.length ? `
          <div style="text-align:center; margin-top: 12px;">
            <button onclick="window.reviews.loadMore()" class="btn btn-primary">Load More</button>
          </div>` : ''}
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
    // Reset shown count to default and reload
    reviewsState.shownCount = 3;
    window.renderAdminApp();
  }

  function changeSort(sortBy) {
    reviewsState.sortBy = sortBy;
    reviewsState.shownCount = 3; // reset pagination
    window.renderAdminApp();
  }

  function loadMore() {
    reviewsState.shownCount += 3;
    window.renderAdminApp();
  }

  window.reviews = {
    renderReviewsSection,
    deleteReview,
    renderReviewsReload,
    changeSort,
    loadMore,
  };
})();