// reviews.js  -- role-filtered reviews with glowing stars and toggle display
(() => {
  const ROLES = { ME: "me", LEAD: "lead", DM: "dm", ADMIN: "admin" };

  if (!window._reviews_ui_openStores) window._reviews_ui_openStores = new Set();

  function canDelete(role) {
    return role === ROLES.ADMIN;
  }
  function assertDelete() {
    if (!canDelete(window.currentRole)) throw "PERM_DENIED_DELETE";
  }

  function filterReviewsByRole(reviews, users, currentUid, currentRole) {
    if (!reviews || !users || !currentUid || !currentRole) return {};

    const currentUser = users[currentUid] || {};

    if (currentRole === ROLES.ADMIN) return reviews;

    const visibleStores = new Set();

    if (currentRole === ROLES.DM) {
      for (const [uid, u] of Object.entries(users)) {
        if (u.role === ROLES.LEAD && u.assignedDM === currentUid && u.store) {
          visibleStores.add(u.store);
        }
      }
    } else if (currentRole === ROLES.LEAD || currentRole === ROLES.ME) {
      if (currentUser.store) visibleStores.add(currentUser.store);
    }

    return Object.fromEntries(
      Object.entries(reviews).filter(([, r]) => visibleStores.has(r.store))
    );
  }

  const STAR = "★";

  function starString(n) {
    const rating = Number(n) || 0;
    const full = Math.round(rating);
    return STAR.repeat(full); // only filled stars
  }

  function avgStarsHtml(avg) {
    const val = Number(avg) || 0;
    const stars = starString(val);
    return `
      <span class="store-avg-stars-big" title="Click to toggle reviews" onclick="window.reviews.toggleStoreDetails(this)">
        <strong>${stars}</strong>
      </span>`;
  }

  function reviewStarsHtml(r) {
    const rating = Number(r.rating) || 0;
    const stars = starString(rating);
    return `<span class="review-stars">${stars}</span>`;
  }

  function formatTs(ms) {
    return ms ? new Date(ms).toLocaleString() : "-";
  }

  function groupByStore(reviewsObj) {
    const map = {};
    for (const [id, r] of Object.entries(reviewsObj || {})) {
      const store = r.store || "Unknown";
      if (!map[store]) map[store] = [];
      map[store].push([id, r]);
    }
    for (const store in map) {
      map[store].sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));
    }
    return map;
  }

  function calcAvg(entries) {
    if (!entries.length) return 0;
    let sum = 0, count = 0;
    for (const [, r] of entries) {
      const num = Number(r.rating);
      if (!isNaN(num)) { sum += num; count++; }
    }
    return count ? sum / count : 0;
  }

  function reviewCardHtml(id, r) {
    const stars = reviewStarsHtml(r);
    return `
      <div class="review-card" id="review-${id}">
        <div class="review-header">
          <span class="review-star">${stars}</span>
          <div><b>Associate:</b> ${r.associate || '-'}</div>
          ${canDelete(window.currentRole)
            ? `<button class="btn btn-danger btn-sm" onclick="window.reviews.deleteReview('${id}')">Delete</button>`
            : ''}
        </div>
        <div class="review-comment">${r.comment || ''}</div>
        <div class="review-meta">
          <span><b>When:</b> ${formatTs(r.timestamp)}</span>
          <span><b>Referral:</b> ${r.refName ? `${r.refName} / ${r.refPhone || ''}` : '-'}</span>
        </div>
      </div>
    `;
  }

  function renderReviewsSection(reviews, currentRole, users, currentUid) {
    const filteredReviews = filterReviewsByRole(reviews, users, currentUid, currentRole);
    const grouped = groupByStore(filteredReviews);

    const openSet = window._reviews_ui_openStores;

    const html = Object.entries(grouped)
      .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true, sensitivity: 'base' }))
      .map(([store, entries]) => {
        const avg = calcAvg(entries);
        const storeKey = encodeURIComponent(store);
        const isOpen = openSet.has(storeKey);
        const summary = avgStarsHtml(avg);
        const reviewsHtml = isOpen ? entries.map(([id, r]) => reviewCardHtml(id, r)).join("") : "";
        return `
          <div class="store-block" data-store="${storeKey}">
            ${summary}
            <div class="reviews-store-list" style="display:${isOpen ? "flex" : "none"};">
              ${reviewsHtml}
            </div>
          </div>
        `;
      })
      .join("") || `<p class="text-center">No reviews.</p>`;

    return `
      <section class="admin-section reviews-section">
        <h2>Reviews</h2>
        <div class="reviews-container">
          ${html}
        </div>
      </section>
    `;
  }

  function toggleStoreDetails(el) {
    const storeBlock = el.closest(".store-block");
    if (!storeBlock) return;
    const storeKey = storeBlock.dataset.store;
    const openSet = window._reviews_ui_openStores;

    if (openSet.has(storeKey)) {
      openSet.delete(storeKey);
      storeBlock.querySelector(".reviews-store-list").style.display = "none";
    } else {
      openSet.add(storeKey);
      storeBlock.querySelector(".reviews-store-list").style.display = "flex";
    }
  }

  async function deleteReview(id) {
    assertDelete();
    if (confirm("Delete this review?")) {
      await window.db.ref(`reviews/${id}`).remove();
      await window.renderAdminApp();
    }
  }

  window.reviews = {
    renderReviewsSection,
    deleteReview,
    toggleStoreDetails
  };
})();