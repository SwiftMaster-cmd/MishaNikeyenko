(() => {
  // Permissions must sync with admin.js
  const ROLES = { ME: "me", LEAD: "lead", DM: "dm", ADMIN: "admin" };

  function canEdit(role) {
    return role !== ROLES.ME;
  }

  function canDelete(role) {
    return role === ROLES.DM || role === ROLES.ADMIN;
  }

  function assertEdit() {
    if (!window.currentRole || window.currentRole === ROLES.ME) throw "PERM_DENIED_EDIT";
  }

  function assertDelete() {
    if (!canDelete(window.currentRole)) throw "PERM_DENIED_DELETE";
  }

  // Render reviews section HTML
  function renderReviewsSection(reviews, currentRole) {
    const reviewEntries = Object.entries(reviews).sort((a,b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));
    if (!reviewEntries.length) return `<p class="text-center">No reviews.</p>`;

    return `
      <section class="admin-section reviews-section">
        <h2>Reviews</h2>
        <div class="review-controls"><button onclick="window.reviews.renderReviewsReload()">Reload</button></div>
        <div class="reviews-container">
          ${reviewEntries.map(([id,r]) => `
            <div class="review-card">
              <div class="review-header">
                <span class="review-star ${r.starred ? '' : 'inactive'}" ${canEdit(currentRole) ? `onclick="window.reviews.toggleStar('${id}',${!!r.starred})"` : ''}>&#9733;</span>
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

  async function toggleStar(id, starred) {
    assertEdit();
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

  // Helper for reload button - just calls main render
  function renderReviewsReload() {
    window.renderAdminApp();
  }

  window.reviews = {
    renderReviewsSection,
    toggleStar,
    deleteReview,
    renderReviewsReload
  };
})();