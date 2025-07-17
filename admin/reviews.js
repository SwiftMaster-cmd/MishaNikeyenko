// reviews.js  -- role-filtered store review cards w/ high-avg collapse + expand
(() => {
  const ROLES = { ME: "me", LEAD: "lead", DM: "dm", ADMIN: "admin" };
  const HIGH_AVG_THRESHOLD = 4.7;

  /* --------------------------------------------------------------
   * UI open/closed memory (persist on window)
   * -------------------------------------------------------------- */
  if (!window._reviews_ui_openStores) window._reviews_ui_openStores = new Set(); // stores explicitly opened by user

  /* --------------------------------------------------------------
   * Perms
   * -------------------------------------------------------------- */
  function canDelete(role) {
    return role === ROLES.ADMIN;
  }
  function assertDelete() {
    if (!canDelete(window.currentRole)) throw "PERM_DENIED_DELETE";
  }

  /* --------------------------------------------------------------
   * Filter reviews visible to current user based on role + assignments
   * -------------------------------------------------------------- */
  function filterReviewsByRole(reviews, users, currentUid, currentRole) {
    if (!reviews || !users || !currentUid || !currentRole) return {};

    const currentUser = users[currentUid] || {};

    if (currentRole === ROLES.ADMIN) return reviews;

    const visibleStores = new Set();

    if (currentRole === ROLES.DM) {
      // all stores belonging to leads assigned to DM
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

  /* --------------------------------------------------------------
   * Helpers
   * -------------------------------------------------------------- */
  const starChar = "★";
  const emptyChar = "☆";

  function starString(n) {
    const rating = Number(n) || 0;
    const full = Math.round(rating); // simple round
    return starChar.repeat(full) + emptyChar.repeat(Math.max(0, 5 - full));
  }

  // Fancy multi-color star row for avg; feel free to swap icons
  function avgStarsHtml(avg) {
    const str = starString(avg);
    const val = avg.toFixed(1);
    return `<span class="review-avg-stars" title="${val} / 5">${str} <span class="review-avg-num">${val}</span></span>`;
  }

  function reviewStarsHtml(r) {
    const rating = Number(r.rating) || 0;
    return `<span class="review-stars">${starString(rating)}</span>`;
  }

  function formatTs(ms) {
    return ms ? new Date(ms).toLocaleString() : "-";
  }

  /* --------------------------------------------------------------
   * Group reviews by store
   * -------------------------------------------------------------- */
  function groupByStore(reviewsObj) {
    const map = {};
    for (const [id, r] of Object.entries(reviewsObj || {})) {
      const store = r.store || "Unknown";
      if (!map[store]) map[store] = [];
      map[store].push([id, r]);
    }
    // sort each store's reviews newest first
    for (const store in map) {
      map[store].sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));
    }
    return map;
  }

  /* --------------------------------------------------------------
   * Compute avg rating for a group
   * -------------------------------------------------------------- */
  function calcAvg(entries) {
    if (!entries.length) return 0;
    let sum = 0, count = 0;
    for (const [, r] of entries) {
      const num = Number(r.rating);
      if (!isNaN(num)) { sum += num; count++; }
    }
    return count ? sum / count : 0;
  }

  /* --------------------------------------------------------------
   * Build summary block (collapsed)
   * -------------------------------------------------------------- */
  function storeSummaryHtml(store, entries, avg, isOpen) {
    const count = entries.length;
    const cls = isOpen ? "store-summary open" : "store-summary";
    const stars = avgStarsHtml(avg);
    const arrow = isOpen ? "▾" : "▸";
    return `
      <div class="${cls}" onclick="window.reviews.toggleStore('${encodeURIComponent(store)}')">
        <div class="store-summary-main">
          <span class="store-summary-arrow">${arrow}</span>
          <span class="store-summary-name">${store}</span>
          <span class="store-summary-stars">${stars}</span>
          <span class="store-summary-count">(${count})</span>
        </div>
      </div>
    `;
  }

  /* --------------------------------------------------------------
   * Build review card HTML (single review)
   * -------------------------------------------------------------- */
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

  /* --------------------------------------------------------------
   * Build expanded store block (shows summary header + list)
   * -------------------------------------------------------------- */
  function storeBlockHtml(store, entries, avg, isOpen) {
    // summary header (click to toggle) always present
    const header = storeSummaryHtml(store, entries, avg, isOpen);

    // if collapsed, stop here
    if (!isOpen) return header;

    // expanded: include all store reviews
    const cards = entries.map(([id, r]) => reviewCardHtml(id, r)).join("");

    return `
      ${header}
      <div class="reviews-store-list" data-store="${esc(store)}">
        ${cards}
      </div>
    `;
  }

  /* --------------------------------------------------------------
   * Legacy flat list builder (used by dashboard filter shortcuts)
   * -------------------------------------------------------------- */
  function reviewsToHtml(reviewEntries) {
    if (!reviewEntries.length) return `<p class="text-center">No reviews.</p>`;
    return reviewEntries.map(([id, r]) => reviewCardHtml(id, r)).join('');
  }

  /* --------------------------------------------------------------
   * Main section renderer
   * -------------------------------------------------------------- */
  function renderReviewsSection(reviews, currentRole, users, currentUid) {
    const filteredReviews = filterReviewsByRole(reviews, users, currentUid, currentRole);
    const grouped = groupByStore(filteredReviews);

    // build store blocks
    const blocks = Object.entries(grouped)
      .sort((a,b) => a[0].localeCompare(b[0], undefined, {numeric:true,sensitivity:'base'})) // alphabetical by store
      .map(([store, entries]) => {
        const avg = calcAvg(entries);
        const openSet = window._reviews_ui_openStores;
        const storeKey = encodeURIComponent(store); // used in toggle
        // default collapsed if avg >= threshold; else open
        const defaultOpen = avg < HIGH_AVG_THRESHOLD;
        const isOpen = openSet.has(storeKey) ? true : (openSet.has("!" + storeKey) ? false : defaultOpen);
        return storeBlockHtml(store, entries, avg, isOpen);
      })
      .join("");

    return `
      <section class="admin-section reviews-section">
        <h2>Reviews</h2>
        <div class="review-controls">
          <button class="btn btn-secondary btn-sm" onclick="window.reviews.renderReviewsReload()">Reload</button>
        </div>
        <div class="reviews-container reviews-by-store">
          ${blocks || `<p class="text-center">No reviews.</p>`}
        </div>
      </section>
    `;
  }

  /* --------------------------------------------------------------
   * Toggle open/closed for a store summary
   * (store comes in URL-encoded from onclick; decode)
   * -------------------------------------------------------------- */
  function toggleStore(encStore) {
    const store = decodeURIComponent(encStore);
    const key   = encodeURIComponent(store);
    const openSet = window._reviews_ui_openStores;

    // We track both positive and explicit closed flags so we can
    // remember a user collapsing a low-avg store (default open) or
    // opening a high-avg store (default closed). Approach:
    // - If key present -> force open
    // - If !key present -> force closed
    // We'll flip whichever is currently active; clear both before set.
    openSet.delete(key);
    openSet.delete("!" + key);

    // Determine current open state from last render:
    // Quick check of DOM: if currently open (has class 'open') -> after click close; else open
    const summaryNode = document.querySelector(`.store-summary[onclick*="${encStore}"]`);
    const currentlyOpen = summaryNode?.classList.contains("open");
    if (!currentlyOpen) {
      openSet.add(key); // user opens
    } else {
      openSet.add("!" + key); // user closes
    }

    window.renderAdminApp();
  }

  /* --------------------------------------------------------------
   * Star toggle (unchanged)  -- note: your markup no longer shows interactive star icon
   * leaving function for backward compat; call manually if you re-add star toggles
   * -------------------------------------------------------------- */
  async function toggleStar(id, starred) {
    if (window.currentRole === ROLES.ME) return; // ME can't edit
    await window.db.ref(`reviews/${id}/starred`).set(!starred);
    await window.renderAdminApp();
  }

  /* --------------------------------------------------------------
   * Delete review
   * -------------------------------------------------------------- */
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

  /* --------------------------------------------------------------
   * Public API
   * -------------------------------------------------------------- */
  window.reviews = {
    renderReviewsSection,
    deleteReview,
    toggleStar,
    renderReviewsReload,
    filterReviewsByRole,
    reviewsToHtml,   // legacy flat
    toggleStore      // expand/collapse a store
  };
})();