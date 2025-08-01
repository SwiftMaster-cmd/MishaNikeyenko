// reviews.js  -- role-filtered store review cards w/ high-avg collapse + expand
// v3: default show only store name + big centered stars + count; expand store shows reviews; click review toggles details
(() => {
  const ROLES = { ME: "me", LEAD: "lead", DM: "dm", ADMIN: "admin" };
  const HIGH_AVG_THRESHOLD = 4.7;

  /* --------------------------------------------------------------
   * UI open/closed memory (persist on window)
   * -------------------------------------------------------------- */
  if (!window._reviews_ui_openStores) window._reviews_ui_openStores = new Set(); // see toggleStore()

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
  const STAR = "★";
  const STAR_EMPTY = "☆";

  function starString(n) {
    const rating = Number(n) || 0;
    const full = Math.round(rating);
    return STAR.repeat(full) + STAR_EMPTY.repeat(Math.max(0, 5 - full));
  }

  function avgStarsHtml(avg) {
    const val   = Number(avg) || 0;
    const stars = starString(val);
    // big + bold class; numeric avg shown smaller but inline
    return `<span class="store-avg-stars-big" title="${val.toFixed(1)} / 5" style="font-size:2.5rem; font-weight:bold; color:#63bbff;">${stars} <span style="font-size:1.2rem; font-weight:400; margin-left:0.25rem;">${val.toFixed(1)}</span></span>`;
  }

  function reviewStarsHtml(r) {
    const rating = Number(r.rating) || 0;
    return `<span class="review-stars" style="color:#63bbff; font-weight:700;">${starString(rating)}</span>`;
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
   * Build summary block (collapsed header; big stars inline w/ name centered)
   * -------------------------------------------------------------- */
  function storeSummaryHtml(store, entries, avg, isOpen) {
    const count = entries.length;
    const cls = isOpen ? "store-summary open" : "store-summary";
    return `
      <div class="${cls}" onclick="window.reviews.toggleStore('${encodeURIComponent(store)}')" style="cursor:pointer; text-align:center; padding: 1rem 0; user-select:none; border-bottom: 1px solid #2e3f5f;">
        <div class="store-summary-name" style="font-weight:900; font-size:1.25rem; color:#63bbff; margin-bottom:0.3rem;">
          ${store}
        </div>
        <div class="store-summary-stars" style="margin-bottom: 0.3rem;">
          ${avgStarsHtml(avg)}
        </div>
        <div class="store-summary-count" style="color:#b3caff;">
          (${count} review${count !== 1 ? "s" : ""})
        </div>
      </div>
    `;
  }

  /* --------------------------------------------------------------
   * Build review card HTML (single review) with toggle details on click
   * -------------------------------------------------------------- */
  function reviewCardHtml(id, r) {
    const stars = reviewStarsHtml(r);
    return `
      <div class="review-card collapsed" id="review-${id}" onclick="this.classList.toggle('collapsed')" 
        style="cursor:pointer; border-radius:12px; background:rgba(23,30,45,0.6); margin-bottom:1rem; padding:1rem; box-shadow:0 0 12px rgba(30,144,255,0.3); color:#e7f2ff;">
        <div class="review-header" style="display:flex; justify-content: space-between; align-items: center; font-weight:700;">
          <span class="review-star">${stars}</span>
          <div><b>Associate:</b> ${r.associate || '-'}</div>
          ${canDelete(window.currentRole)
            ? `<button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); window.reviews.deleteReview('${id}')">Delete</button>`
            : ''}
        </div>
        <div class="review-comment" style="margin-top: 0.5rem; max-height: 0; overflow: hidden; transition: max-height 0.3s ease, opacity 0.3s ease; opacity: 0; pointer-events: none;">
          ${r.comment || ''}
        </div>
        <div class="review-meta" style="margin-top:0.3rem; font-size:0.85rem; color:#a8b9db; max-height: 0; overflow: hidden; transition: max-height 0.3s ease, opacity 0.3s ease; opacity: 0; pointer-events: none;">
          <span><b>When:</b> ${formatTs(r.timestamp)}</span><br/>
          <span><b>Referral:</b> ${r.refName ? `${r.refName} / ${r.refPhone || ''}` : '-'}</span>
        </div>
      </div>
    `;
  }

  /* --------------------------------------------------------------
   * Build expanded store block (summary header always shown)
   * -------------------------------------------------------------- */
  function storeBlockHtml(store, entries, avg, isOpen) {
    const header = storeSummaryHtml(store, entries, avg, isOpen);
    if (!isOpen) return header;
    const cards = entries.map(([id, r]) => reviewCardHtml(id, r)).join("");
    return `
      ${header}
      <div class="reviews-store-list" data-store="${escapeHtml(store)}">
        ${cards}
      </div>
    `;
  }

  /* --------------------------------------------------------------
   * Legacy flat list builder (kept for dashboard filters)
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

    const blocks = Object.entries(grouped)
      .sort((a,b) => a[0].localeCompare(b[0], undefined, {numeric:true,sensitivity:'base'}))
      .map(([store, entries]) => {
        const avg = calcAvg(entries);
        const openSet = window._reviews_ui_openStores;
        const storeKey = encodeURIComponent(store);
        const defaultOpen = avg < HIGH_AVG_THRESHOLD;
        const isOpen = openSet.has(storeKey)
          ? true
          : (openSet.has("!" + storeKey) ? false : defaultOpen);
        return storeBlockHtml(store, entries, avg, isOpen);
      })
      .join("");

    return `
      <section class="admin-section reviews-section">
        <h2>Reviews</h2>
        <div class="reviews-container reviews-by-store">
          ${blocks || `<p class="text-center">No reviews.</p>`}
        </div>
      </section>
    `;
  }

  /* --------------------------------------------------------------
   * Toggle open/closed for a store summary
   * -------------------------------------------------------------- */
  function toggleStore(encStore) {
    const store   = decodeURIComponent(encStore);
    const key     = encodeURIComponent(store);
    const openSet = window._reviews_ui_openStores;

    // clear existing marks
    openSet.delete(key);
    openSet.delete("!" + key);

    // determine current state from DOM
    const summaryNode = document.querySelector(`.store-summary[onclick*="${encStore}"]`);
    const currentlyOpen = summaryNode?.classList.contains("open");

    if (!currentlyOpen) {
      openSet.add(key);       // user opens
    } else {
      openSet.add("!" + key); // user closes
    }
    window.renderAdminApp();
  }

  /* --------------------------------------------------------------
   * Star toggle (unchanged; kept for compat)
   * -------------------------------------------------------------- */
  async function toggleStar(id, starred) {
    if (window.currentRole === ROLES.ME) return;
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

  /* --------------------------------------------------------------
   * Back-compat no-op reload (kept so dashboard doesn't error)
   * -------------------------------------------------------------- */
  function renderReviewsReload() {
    window.renderAdminApp();
  }

  /* --------------------------------------------------------------
   * Escape (used in storeBlockHtml)
   * -------------------------------------------------------------- */
  function escapeHtml(str){
    return (str||"")
      .toString()
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;")
      .replace(/'/g,"&#39;");
  }

  /* --------------------------------------------------------------
   * Public API
   * -------------------------------------------------------------- */
  window.reviews = {
    renderReviewsSection,
    deleteReview,
    toggleStar,
    renderReviewsReload, // kept for compatibility
    filterReviewsByRole,
    reviewsToHtml,
    toggleStore
  };
})();