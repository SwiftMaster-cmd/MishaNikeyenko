// ==========================
// Reviews Management Module
// ==========================

async function renderReviewsSection(reviews, users) {
  const reviewEntries = Object.entries(reviews).sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));
  window._allReviews = reviewEntries;
  window._allReviewsHtml = reviewsToHtml(reviewEntries);

  return `
    <section class="admin-section reviews-section">
      <h2>Reviews</h2>
      <div class="review-controls">
        <button onclick="renderAdminApp()">Reload</button>
        <button onclick="clearReviewFilter()">Clear Filters</button>
      </div>
      <div class="reviews-container">${window._allReviewsHtml}</div>
    </section>
  `;
}

// ========== Render Helpers ==========

function reviewsToHtml(entries) {
  if (!entries.length) return `<p class="text-center">No reviews.</p>`;
  return entries.map(([id, r]) => `
    <div class="review-card">
      <div class="review-header">
        <span class="review-star ${r.starred ? '' : 'inactive'}" ${canEdit(currentRole) ? `onclick="toggleStar('${id}', ${!!r.starred})"` : ''}>&#9733;</span>
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
}

// ========== Filter Actions ==========

function filterReviewsByStore(store) {
  const filtered = _allReviews.filter(([, r]) => r.store === store);
  document.querySelector(".reviews-container").innerHTML = reviewsToHtml(filtered);
}

function filterReviewsByAssociate(name) {
  const filtered = _allReviews.filter(([, r]) => r.associate === name);
  document.querySelector(".reviews-container").innerHTML = reviewsToHtml(filtered);
}

function clearReviewFilter() {
  document.querySelector(".reviews-container").innerHTML = _allReviewsHtml;
}

// ========== Review Actions ==========

async function toggleStar(id, starred) {
  assertEdit();
  await db.ref(`reviews/${id}/starred`).set(!starred);
  renderAdminApp();
}

async function deleteReview(id) {
  assertDelete();
  if (confirm("Delete this review?")) {
    await db.ref(`reviews/${id}`).remove();
    renderAdminApp();
  }
}