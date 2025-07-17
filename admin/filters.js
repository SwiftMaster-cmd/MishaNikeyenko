/* ==========================================================================
   Review Filter Helpers (read-only)
   ========================================================================== */

// Filters by store number
window.filterReviewsByStore = store => {
  document.querySelector(".reviews-container").innerHTML = reviewsToHtml(
    _allReviews.filter(([, r]) => r.store === store)
  );
};

// Filters by associate name
window.filterReviewsByAssociate = name => {
  document.querySelector(".reviews-container").innerHTML = reviewsToHtml(
    _allReviews.filter(([, r]) => r.associate === name)
  );
};

// Clears active filters
window.clearReviewFilter = () => {
  document.querySelector(".reviews-container").innerHTML = _allReviewsHtml;
};

// Converts review array to HTML (used in both filters and default render)
window.reviewsToHtml = entries => {
  if (!entries.length) return `<p class="text-center">No reviews.</p>`;

  return entries.map(([id, r]) => `
    <div class="review-card">
      <div class="review-header">
        <span class="review-star ${r.starred ? '' : 'inactive'}"
              ${canEdit(currentRole) ? `onclick="toggleStar('${id}', ${!!r.starred})"` : ''}>
          &#9733;
        </span>
        <div><b>Store:</b> ${r.store || '-'}</div>
        <div><b>Associate:</b> ${r.associate || '-'}</div>
        ${
          canDelete(currentRole)
            ? `<button class="btn btn-danger btn-sm" onclick="deleteReview('${id}')">Delete</button>`
            : ''
        }
      </div>
      <div class="review-rating">${'★'.repeat(r.rating || 0)}</div>
      <div class="review-comment">${r.comment || ''}</div>
      <div class="review-meta"><b>When:</b> ${r.timestamp ? new Date(r.timestamp).toLocaleString() : '-'}</div>
      <div class="review-meta"><b>Referral:</b> ${r.refName ? `${r.refName} / ${r.refPhone}` : '-'}</div>
    </div>
  `).join('');
};