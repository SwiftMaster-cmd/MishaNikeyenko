/* ========================================================================
   Reviews Logic
   ===================================================================== */
async function renderReviewsSection(reviews) {
  const reviewEntries = Object.entries(reviews)
    .sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));

  const reviewCards = reviewEntries.map(([id, r]) => `
    <div class="review-card">
      <div class="review-header">
        <span class="review-star ${r.starred ? '' : 'inactive'}"
              ${canEdit(currentRole) ? `onclick="toggleStar('${id}', ${!!r.starred})"` : ''}>&#9733;</span>
        <div><b>Store:</b> ${r.store || '-'}</div>
        <div><b>Associate:</b> ${r.associate || '-'}</div>
        ${canDelete(currentRole) ? `<button class="btn btn-danger btn-sm" onclick="deleteReview('${id}')">Delete</button>` : ''}
      </div>
      <div class="review-rating">${'★'.repeat(r.rating || 0)}</div>
      <div class="review-comment">${r.comment || ''}</div>
      <div class="review-meta"><b>When:</b> ${r.timestamp ? new Date(r.timestamp).toLocaleString() : '-'}</div>
      <div class="review-meta"><b>Referral:</b> ${r.refName ? `${r.refName} / ${r.refPhone}` : '-'}</div>
    </div>
  `).join('');

  window._allReviews     = reviewEntries;
  window._allReviewsHtml = reviewCards;

  return `
    <section class="admin-section reviews-section">
      <h2>Reviews</h2>
      <div class="review-controls"><button onclick="renderAdminApp()">Reload</button></div>
      <div class="reviews-container">${reviewCards}</div>
    </section>`;
}

/* ========================================================================
   Review Filters
   ===================================================================== */
window.filterReviewsByStore = store =>
  document.querySelector(".reviews-container").innerHTML = reviewsToHtml(
    _allReviews.filter(([, r]) => r.store === store)
  );

window.filterReviewsByAssociate = name =>
  document.querySelector(".reviews-container").innerHTML = reviewsToHtml(
    _allReviews.filter(([, r]) => r.associate === name)
  );

window.clearReviewFilter = () =>
  document.querySelector(".reviews-container").innerHTML = _allReviewsHtml;

window.reviewsToHtml = entries => entries.length
  ? entries.map(([id, r]) => `
      <div class="review-card">
        <div class="review-header">
          <span class="review-star ${r.starred ? '' : 'inactive'}"
                ${canEdit(currentRole) ? `onclick="toggleStar('${id}', ${!!r.starred})"` : ''}>&#9733;</span>
          <div><b>Store:</b> ${r.store || '-'}</div>
          <div><b>Associate:</b> ${r.associate || '-'}</div>
          ${canDelete(currentRole) ? `<button class="btn btn-danger btn-sm" onclick="deleteReview('${id}')">Delete</button>` : ''}
        </div>
        <div class="review-rating">${'★'.repeat(r.rating || 0)}</div>
        <div class="review-comment">${r.comment || ''}</div>
        <div class="review-meta"><b>When:</b> ${r.timestamp ? new Date(r.timestamp).toLocaleString() : '-'}</div>
        <div class="review-meta"><b>Referral:</b> ${r.refName ? `${r.refName} / ${r.refPhone}` : '-'}</div>
      </div>
    `).join('')
  : `<p class="text-center">No reviews.</p>`;

/* ========================================================================
   Review Actions
   ===================================================================== */
window.toggleStar = async (id, starred) => {
  assertEdit();
  await db.ref(`reviews/${id}/starred`).set(!starred);
  renderAdminApp();
};

window.deleteReview = async id => {
  assertDelete();
  if (confirm("Delete this review?")) {
    await db.ref(`reviews/${id}`).remove();
    renderAdminApp();
  }
};