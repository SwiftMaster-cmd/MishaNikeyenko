// reviews.js  -- show only centered glowing stars by default; click stars expands reviews with full details
(() => {
  const ROLES = { ME: "me", LEAD: "lead", DM: "dm", ADMIN: "admin" };
  const HIGH_AVG_THRESHOLD = 4.7;

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
        if (u.role === ROLES.LEAD && u.assignedDM === currentUid && u.store) visibleStores.add(u.store);
      }
    } else if (currentRole === ROLES.LEAD || currentRole === ROLES.ME) {
      if (currentUser.store) visibleStores.add(currentUser.store);
    }
    return Object.fromEntries(Object.entries(reviews).filter(([, r]) => visibleStores.has(r.store)));
  }

  const STAR = "★";

  function starString(n) {
    const rating = Number(n) || 0;
    const full = Math.round(rating);
    return STAR.repeat(full) + "☆☆☆☆☆".slice(0, 5 - full);
  }

  function avgStarsHtml(avg) {
    const val = Number(avg) || 0;
    const stars = starString(val);
    // glowing effect with color and text-shadow
    return `<span class="store-avg-stars-big" title="${val.toFixed(1)} / 5" style="
      font-size: 3rem;
      font-weight: bold;
      color: #63bbff;
      text-shadow:
        0 0 8px #63bbff,
        0 0 15px #63bbff,
        0 0 22px #1e90ff,
        0 0 40px #1e90ff;
      cursor: pointer;
      user-select: none;
      display: inline-block;
      letter-spacing: 3px;
    ">${stars}</span>`;
  }

  function reviewStarsHtml(r) {
    const rating = Number(r.rating) || 0;
    const stars = STAR.repeat(Math.round(rating));
    return `<span class="review-stars" style="
      color: #63bbff;
      font-weight: 700;
      text-shadow:
        0 0 5px #63bbff,
        0 0 10px #63bbff;
      letter-spacing: 1.5px;
    ">${stars}</span>`;
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
    let sum = 0,
      count = 0;
    for (const [, r] of entries) {
      const num = Number(r.rating);
      if (!isNaN(num)) {
        sum += num;
        count++;
      }
    }
    return count ? sum / count : 0;
  }

  function storeBlockHtml(store, entries, avg, isOpen) {
    const starsHtml = avgStarsHtml(avg);
    const expandedHtml = isOpen
      ? `<div class="reviews-store-list" data-store="${escapeHtml(store)}" style="margin-top:1rem;">
          ${entries.map(([id, r]) => reviewCardHtml(id, r)).join("")}
        </div>`
      : "";
    return `
      <div class="store-block" style="text-align:center; margin-bottom: 2rem;">
        <div onclick="window.reviews.toggleStore('${encodeURIComponent(store)}')" style="display:inline-block;">
          ${starsHtml}
        </div>
        ${expandedHtml}
      </div>
    `;
  }

  function reviewCardHtml(id, r) {
    const stars = reviewStarsHtml(r);
    return `
      <div class="review-card collapsed" id="review-${id}" onclick="this.classList.toggle('collapsed')" 
        style="
          cursor: pointer;
          border-radius: 12px;
          background: rgba(23,30,45,0.6);
          margin-bottom: 1rem;
          padding: 1rem;
          box-shadow: 0 0 12px rgba(30,144,255,0.3);
          color: #e7f2ff;
          transition: max-height 0.3s ease, opacity 0.3s ease;
          overflow: hidden;
          max-height: 70px;
        ">
        <div class="review-header" style="display:flex; justify-content: space-between; align-items: center; font-weight: 700;">
          <span class="review-star">${stars}</span>
          <div><b>Associate:</b> ${r.associate || "-"}</div>
          ${
            canDelete(window.currentRole)
              ? `<button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); window.reviews.deleteReview('${id}')">Delete</button>`
              : ""
          }
        </div>
        <div class="review-comment" style="margin-top: 0.5rem; max-height: 0; opacity: 0; pointer-events: none; transition: max-height 0.3s ease, opacity 0.3s ease;">
          ${r.comment || ""}
        </div>
        <div class="review-meta" style="margin-top: 0.3rem; font-size: 0.85rem; color: #a8b9db; max-height: 0; opacity: 0; pointer-events: none; transition: max-height 0.3s ease, opacity 0.3s ease;">
          <span><b>When:</b> ${formatTs(r.timestamp)}</span><br/>
          <span><b>Referral:</b> ${r.refName ? `${r.refName} / ${r.refPhone || ""}` : "-"}</span>
        </div>
      </div>
    `;
  }

  // Toggle review expansion on card click
  document.addEventListener("click", e => {
    if (e.target.closest(".review-card")) {
      const card = e.target.closest(".review-card");
      if (card.classList.contains("collapsed")) {
        card.classList.remove("collapsed");
        // expand comment/meta
        const comment = card.querySelector(".review-comment");
        const meta = card.querySelector(".review-meta");
        comment.style.maxHeight = "500px";
        comment.style.opacity = "1";
        comment.style.pointerEvents = "auto";
        meta.style.maxHeight = "500px";
        meta.style.opacity = "1";
        meta.style.pointerEvents = "auto";
        card.style.maxHeight = "1000px";
      } else {
        card.classList.add("collapsed");
        // collapse comment/meta
        const comment = card.querySelector(".review-comment");
        const meta = card.querySelector(".review-meta");
        comment.style.maxHeight = "0";
        comment.style.opacity = "0";
        comment.style.pointerEvents = "none";
        meta.style.maxHeight = "0";
        meta.style.opacity = "0";
        meta.style.pointerEvents = "none";
        card.style.maxHeight = "70px";
      }
    }
  });

  function renderReviewsSection(reviews, currentRole, users, currentUid) {
    const filteredReviews = filterReviewsByRole(reviews, users, currentUid, currentRole);
    const grouped = groupByStore(filteredReviews);

    const blocks = Object.entries(grouped)
      .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true, sensitivity: "base" }))
      .map(([store, entries]) => {
        const avg = calcAvg(entries);
        const openSet = window._reviews_ui_openStores;
        const storeKey = encodeURIComponent(store);
        const defaultOpen = avg < HIGH_AVG_THRESHOLD;
        const isOpen = openSet.has(storeKey)
          ? true
          : openSet.has("!" + storeKey)
          ? false
          : defaultOpen;
        return storeBlockHtml(store, entries, avg, isOpen);
      })
      .join("");

    return `
      <section class="admin-section reviews-section">
        <h2>Reviews</h2>
        <div class="reviews-container">
          ${blocks || `<p class="text-center">No reviews.</p>`}
        </div>
      </section>
    `;
  }

  function toggleStore(encStore) {
    const store = decodeURIComponent(encStore);
    const key = encodeURIComponent(store);
    const openSet = window._reviews_ui_openStores;
    openSet.delete(key);
    openSet.delete("!" + key);
    const summaryNode = document.querySelector(`.store-block div[onclick*="${encStore}"]`);
    const currentlyOpen = summaryNode?.parentElement.querySelector(".reviews-store-list") !== null;
    if (!currentlyOpen) {
      openSet.add(key);
    } else {
      openSet.add("!" + key);
    }
    window.renderAdminApp();
  }

  async function toggleStar(id, starred) {
    if (window.currentRole === ROLES.ME) return;
    await window.db.ref(`reviews/${id}/starred`).set(!starred);
    await window.renderAdminApp();
  }

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

  function escapeHtml(str) {
    return (str || "")
      .toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  window.reviews = {
    renderReviewsSection,
    deleteReview,
    toggleStar,
    renderReviewsReload,
    filterReviewsByRole,
    toggleStore,
  };
})();