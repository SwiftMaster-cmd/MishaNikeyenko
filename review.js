// review.js
import { db } from './firebaseConfig.js';

export async function getAllReviews() {
  const snapshot = await db.ref('reviews').get();
  return snapshot.val() || {};
}

export async function toggleStar(reviewId, starred) {
  await db.ref('reviews/' + reviewId + '/starred').set(!starred);
}

export async function deleteReview(reviewId) {
  await db.ref('reviews/' + reviewId).remove();
}

export function renderReviews(reviews) {
  let reviewsHtml = `<div class="review-cards">`;
  const reviewEntries = Object.entries(reviews).sort((a,b) => (b[1].timestamp||0)-(a[1].timestamp||0));

  if (reviewEntries.length === 0) {
    reviewsHtml += `<div style="padding:18px;"><em>No reviews submitted yet.</em></div>`;
  } else {
    for (const [id, r] of reviewEntries) {
      reviewsHtml += `
        <div class="review-card">
          <span class="review-star ${r.starred ? '' : 'inactive'}" title="Star/unstar" onclick="window.toggleStar('${id}', ${!!r.starred})">
            &#9733;
          </span>
          <div class="review-meta">
            <b>Store:</b> <span class="clickable" onclick="window.filterReviewsByStore('${r.store||'-'}')">${r.store||'-'}</span>
             | <b>Associate:</b> <span class="clickable" onclick="window.filterReviewsByAssociate('${r.associate||'-'}')">${r.associate||'-'}</span>
          </div>
          <div class="review-rating"><b>Rating:</b> ${'★'.repeat(r.rating||0)}</div>
          <div class="review-comment">${r.comment||''}</div>
          <div class="review-meta"><b>When:</b> ${r.timestamp ? new Date(r.timestamp).toLocaleString() : '-'}</div>
          <div class="review-meta"><b>Referral:</b> ${r.refName?`${r.refName} / ${r.refPhone}`:'-'}</div>
          <button onclick="window.deleteReview('${id}')" style="margin-top:8px;font-size:0.96em;">Delete Review</button>
        </div>`;
    }
  }
  reviewsHtml += `</div>`;
  return reviewsHtml;
}

export function filterReviewsByStore(store, allReviews) {
  const filtered = (allReviews || []).filter(([id, r]) => r.store === store);
  document.getElementById('filteredReviews').innerHTML = renderReviews(Object.fromEntries(filtered));
}

export function filterReviewsByAssociate(associate, allReviews) {
  const filtered = (allReviews || []).filter(([id, r]) => r.associate === associate);
  document.getElementById('filteredReviews').innerHTML = renderReviews(Object.fromEntries(filtered));
}

export function clearReviewFilter(allReviewsHtml) {
  document.getElementById('filteredReviews').innerHTML = allReviewsHtml;
}