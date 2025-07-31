/* reviews.js */
(() => {
  const ROLES = { ME: "me", LEAD: "lead", DM: "dm", ADMIN: "admin" };
  const HIGH_AVG_THRESHOLD = 4.7;

  let currentUid = null;
  let currentRole = ROLES.ME;

  let _reviewsCache = {};
  let _usersCache = {};

  if (!window._reviews_ui_openStores) window._reviews_ui_openStores = new Set();

  function init(uid, role) {
    currentUid = uid;
    currentRole = role;
    bindRealtimeListeners();
  }

  function bindRealtimeListeners() {
    const reviewsRef = window.db.ref("reviews");
    const usersRef = window.db.ref("users");

    reviewsRef.on("value", (snap) => {
      _reviewsCache = snap.val() || {};
      render();
    });

    usersRef.on("value", (snap) => {
      _usersCache = snap.val() || {};
      render();
    });
  }

  function canDelete() {
    return currentRole === ROLES.ADMIN;
  }

  // Filter reviews by role and assigned stores/users
  function filterReviewsByRole() {
    if (!currentUid || !currentRole || !Object.keys(_reviewsCache).length || !Object.keys(_usersCache).length) {
      return {};
    }

    if (currentRole === ROLES.ADMIN) return _reviewsCache;

    const visibleStores = new Set();

    if (currentRole === ROLES.DM) {
      for (const [uid, u] of Object.entries(_usersCache)) {
        if (u.role === ROLES.LEAD && u.assignedDM === currentUid && u.store) {
          visibleStores.add(u.store);
        }
      }
    } else if (currentRole === ROLES.LEAD || currentRole === ROLES.ME) {
      const meUser = _usersCache[currentUid];
      if (meUser?.store) visibleStores.add(meUser.store);
    }

    return Object.fromEntries(
      Object.entries(_reviewsCache).filter(([, r]) => visibleStores.has(r.store))
    );
  }

  // Generate star rating string
  function starString(rating) {
    const fullStars = Math.round(Number(rating) || 0);
    return "★".repeat(fullStars) + "☆".repeat(Math.max(0, 5 - fullStars));
  }

  // Compute average rating for a store's reviews
  function computeAvgRating(entries) {
    if (!entries.length) return 0;
    let total = 0, count = 0;
    for (const [, r] of entries) {
      const val = Number(r.rating);
      if (!isNaN(val)) {
        total += val;
        count++;
      }
    }
    return count ? total / count : 0;
  }

  // Group reviews by store, sort newest first
  function groupByStore() {
    const map = {};
    const reviews = filterReviewsByRole();
    for (const [id, review] of Object.entries(reviews)) {
      const store = review.store || "Unknown";
      if (!map[store]) map[store] = [];
      map[store].push([id, review]);
    }
    for (const store in map) {
      map[store].sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));
    }
    return map;
  }

  // Toggle store open/close state
  function toggleStore(store) {
    if (window._reviews_ui_openStores.has(store)) {
      window._reviews_ui_openStores.delete(store);
    } else {
      window._reviews_ui_openStores.add(store);
    }
    render();
  }
  window.reviews = window.reviews || {};
  window.reviews.toggleStore = toggleStore;

  // Render store header summary
  function renderStoreHeader(store, avg, count, isOpen) {
    const arrow = isOpen ? "▾" : "▸";
    const stars = `<strong title="${avg.toFixed(1)} / 5">${starString(avg)}</strong>`;
    return `
      <div class="store-summary ${isOpen ? "open" : ""}" onclick="window.reviews.toggleStore('${encodeURIComponent(store)}')">
        <span class="store-summary-arrow">${arrow}</span>
        <span class="store-summary-name">${store}</span>
        <span class="store-summary-stars">${stars}</span>
        <span class="store-summary-count">(${count})</span>
      </div>`;
  }

  // Render single review card
  function renderReviewCard(id, review) {
    const stars = starString(review.rating);
    const canDelBtn = canDelete() ? `<button class="btn btn-danger btn-sm" onclick="window.reviews.deleteReview('${id}')">Delete</button>` : "";
    return `
      <div class="review-card" id="review-${id}">
        <div class="review-header">
          <span class="review-stars">${stars}</span>
          <div><b>Associate:</b> ${esc(review.associate || "-")}</div>
          ${canDelBtn}
        </div>
        <div class="review-comment">${esc(review.comment || "")}</div>
        <div class="review-meta">
          <span><b>When:</b> ${new Date(review.timestamp || 0).toLocaleString()}</span>
          <span><b>Referral:</b> ${esc(review.refName || "-")} / ${esc(review.refPhone || "")}</span>
        </div>
      </div>`;
  }

  // Escape helper
  function esc(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Delete review with permission check
  async function deleteReview(id) {
    if (!canDelete()) {
      alert("Permission denied");
      return;
    }
    if (!confirm("Delete this review?")) return;
    try {
      await window.db.ref("reviews/" + id).remove();
    } catch (e) {
      alert("Error deleting review: " + e.message);
    }
  }
  window.reviews = window.reviews || {};
  window.reviews.deleteReview = deleteReview;

  // Main render function
  function render() {
    const container = document.getElementById("reviewsContainer");
    if (!container) return;

    const storeGroups = groupByStore();

    let html = "";

    for (const [store, reviews] of Object.entries(storeGroups)) {
      const avg = computeAvgRating(reviews);
      const isOpen = window._reviews_ui_openStores.has(store);
      html += renderStoreHeader(store, avg, reviews.length, isOpen);

      if (isOpen) {
        html += `<div class="reviews-store-list">`;
        for (const [id, review] of reviews) {
          html += renderReviewCard(id, review);
        }
        html += `</div>`;
      }
    }

    if (!html) html = `<p>No reviews to display.</p>`;

    container.innerHTML = html;
  }

  window.reviews = {
    init,
    toggleStore,
    deleteReview,
    render,
  };
})();