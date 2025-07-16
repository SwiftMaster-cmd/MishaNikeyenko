const db = firebase.database();  // Use the already initialized firebase app

window.toggleStar = async function(reviewId, starred) {
  await db.ref('reviews/' + reviewId + '/starred').set(!starred);
  window.renderAdminApp();
};

window.deleteReview = async function(reviewId) {
  if (!confirm("Delete this review?")) return;
  await db.ref('reviews/' + reviewId).remove();
  window.renderAdminApp();
};

window.filterReviewsByStore = function(store) {
  const filtered = (window._allReviews || []).filter(([id, r]) => r.store === store);
  document.getElementById('filteredReviews').innerHTML = reviewsToHtml(filtered);
};

window.filterReviewsByAssociate = function(associate) {
  const filtered = (window._allReviews || []).filter(([id, r]) => r.associate === associate);
  document.getElementById('filteredReviews').innerHTML = reviewsToHtml(filtered);
};

window.clearReviewFilter = function() {
  document.getElementById('filteredReviews').innerHTML = window._allReviewsHtml;
};

function reviewsToHtml(entries) {
  if (!entries.length) return `<div style="padding:18px;"><em>No reviews found for this filter.</em></div>`;
  let html = '';
  for (const [id, r] of entries) {
    html += `
      <div class="review-card">
        <span class="review-star ${r.starred ? '' : 'inactive'}" title="Star/unstar" onclick="toggleStar('${id}', ${!!r.starred})">
          &#9733;
        </span>
        <div class="review-meta">
          <b>Store:</b> <span class="clickable" onclick="filterReviewsByStore('${r.store || '-'}')">${r.store || '-'}</span>
           | <b>Associate:</b> <span class="clickable" onclick="filterReviewsByAssociate('${r.associate || '-'}')">${r.associate || '-'}</span>
        </div>
        <div class="review-rating"><b>Rating:</b> ${'★'.repeat(r.rating || 0)}</div>
        <div class="review-comment">${r.comment || ''}</div>
        <div class="review-meta"><b>When:</b> ${r.timestamp ? new Date(r.timestamp).toLocaleString() : '-'}</div>
        <div class="review-meta"><b>Referral:</b> ${r.refName ? `${r.refName} / ${r.refPhone}` : '-'}</div>
        <button onclick="deleteReview('${id}')" style="margin-top:8px;font-size:0.96em;">Delete Review</button>
      </div>`;
  }
  return html;
}