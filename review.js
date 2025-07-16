// admin-review.js

function renderReviews(reviews, users) {
  const reviewEntries = Object.entries(reviews).sort((a,b) => (b[1].timestamp||0) - (a[1].timestamp||0));
  if (reviewEntries.length === 0) return `<p class="text-center">No reviews yet.</p>`;

  return reviewEntries.map(([id, r]) => `
    <div class="review-card">
      <div class="review-header">
        <span class="review-star ${r.starred ? '' : 'inactive'}" title="Star/unstar" onclick="toggleStar('${id}', ${!!r.starred})">&#9733;</span>
        <div><b>Store:</b> <span class="clickable" onclick="filterReviewsByStore('${r.store || '-'}')">${r.store || '-'}</span></div>
        <div><b>Associate:</b> <span class="clickable" onclick="filterReviewsByAssociate('${r.associate || '-'}')">${r.associate || '-'}</span></div>
        <button class="btn btn-danger btn-sm" onclick="deleteReview('${id}')">Delete</button>
      </div>
      <div class="review-rating">${'★'.repeat(r.rating || 0)}</div>
      <div class="review-comment">${r.comment || ''}</div>
      <div class="review-meta"><b>When:</b> ${r.timestamp ? new Date(r.timestamp).toLocaleString() : '-'}</div>
      <div class="review-meta"><b>Referral:</b> ${r.refName ? `${r.refName} / ${r.refPhone}` : '-'}</div>
    </div>
  `).join('');
}

window.toggleStar = async function(reviewId, starred) {
  await db.ref('reviews/' + reviewId + '/starred').set(!starred);
  renderAdminApp();
};

window.deleteReview = async function(reviewId) {
  if (!confirm("Delete this review?")) return;
  await db.ref('reviews/' + reviewId).remove();
  renderAdminApp();
};

window.filterReviewsByStore = function(store) {
  const filtered = (window._allReviews || []).filter(([id, r]) => r.store === store);
  document.querySelector('.reviews-container').innerHTML = reviewsToHtml(filtered);
};

window.filterReviewsByAssociate = function(associate) {
  const filtered = (window._allReviews || []).filter(([id, r]) => r.associate === associate);
  document.querySelector('.reviews-container').innerHTML = reviewsToHtml(filtered);
};

window.clearReviewFilter = function() {
  document.querySelector('.reviews-container').innerHTML = window._allReviewsHtml;
};

function reviewsToHtml(entries) {
  if (!entries.length) return `<p class="text-center">No reviews found for this filter.</p>`;
  return entries.map(([id, r]) => `
    <div class="review-card">
      <div class="review-header">
        <span class="review-star ${r.starred ? '' : 'inactive'}" title="Star/unstar" onclick="toggleStar('${id}', ${!!r.starred})">&#9733;</span>
        <div><b>Store:</b> <span class="clickable" onclick="filterReviewsByStore('${r.store || '-'}')">${r.store || '-'}</span></div>
        <div><b>Associate:</b> <span class="clickable" onclick="filterReviewsByAssociate('${r.associate || '-'}')">${r.associate || '-'}</span></div>
        <button class="btn btn-danger btn-sm" onclick="deleteReview('${id}')">Delete</button>
      </div>
      <div class="review-rating">${'★'.repeat(r.rating || 0)}</div>
      <div class="review-comment">${r.comment || ''}</div>
      <div class="review-meta"><b>When:</b> ${r.timestamp ? new Date(r.timestamp).toLocaleString() : '-'}</div>
      <div class="review-meta"><b>Referral:</b> ${r.refName ? `${r.refName} / ${r.refPhone}` : '-'}</div>
    </div>
  `).join('');
}