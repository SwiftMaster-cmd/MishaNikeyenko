/* ==========================================================================
   renderAdminApp -- Main Dashboard UI Renderer
   ========================================================================== */
async function renderAdminApp() {
  adminAppDiv.innerHTML = "<div>Loading data…</div>";

  const [storesSnap, usersSnap, reviewsSnap, guestSnap] = await Promise.all([
    db.ref("stores").get(),
    db.ref("users").get(),
    db.ref("reviews").get(),
    db.ref("guestinfo").get()
  ]);

  const stores    = storesSnap.val()  || {};
  const users     = usersSnap.val()   || {};
  const reviews   = reviewsSnap.val() || {};
  const guestinfo = guestSnap.val()   || {};

  const storeRows = Object.entries(stores).map(([id, s]) => {
    const tl = users[s.teamLeadUid] || {};
    return `
      <tr>
        <td>${canEdit(currentRole)
          ? `<input type="text" value="${s.storeNumber||''}" onchange="updateStoreNumber('${id}',this.value)">`
          : s.storeNumber||'-'}</td>
        <td>
          ${canEdit(currentRole) ? `<select onchange="assignTL('${id}',this.value)">
            <option value="">-- Unassigned --</option>
            ${Object.entries(users)
              .filter(([,u]) => [ROLES.LEAD, ROLES.DM].includes(u.role))
              .map(([uid,u]) => `<option value="${uid}" ${s.teamLeadUid===uid?'selected':''}>${u.name||u.email}</option>`).join('')}
          </select>` : (tl.name||tl.email||'-')}
          ${tl.role ? roleBadge(tl.role) : ''}
        </td>
        <td>${canDelete(currentRole)?`<button class="btn btn-danger" onclick="deleteStore('${id}')">Delete</button>`:''}</td>
      </tr>`;
  }).join('');

  const userCards = Object.entries(users).map(([uid, u]) => {
    const lead = users[u.assignedLead] || {};
    const dm   = users[u.assignedDM]   || {};
    return `
      <div class="user-card">
        <div class="user-card-header">
          <div>
            <div class="user-name">${u.name||u.email}</div>
            <div class="user-email">${u.email}</div>
          </div>
          ${roleBadge(u.role)}
        </div>
        <div class="user-card-info">
          <div><b>Store:</b> ${u.store||'-'}</div>
          <div><b>Lead:</b> ${lead.name||lead.email||'-'}</div>
          <div><b>DM:</b> ${dm.name||dm.email||'-'}</div>
        </div>
        ${canEdit(currentRole) ? `
          <div class="user-card-actions">
            <label>Role:
              <select onchange="changeUserRole('${uid}',this.value)">
                <option value="${ROLES.ME}" ${u.role===ROLES.ME?'selected':''}>ME</option>
                <option value="${ROLES.LEAD}" ${u.role===ROLES.LEAD?'selected':''}>Lead</option>
                <option value="${ROLES.DM}" ${u.role===ROLES.DM?'selected':''}>DM</option>
                <option value="${ROLES.ADMIN}" ${u.role===ROLES.ADMIN?'selected':''}>Admin</option>
              </select>
            </label>
            <label>Assign Lead:
              <select onchange="assignLeadToGuest('${uid}',this.value)">
                <option value="">None</option>
                ${Object.entries(users).filter(([,x]) => x.role === ROLES.LEAD)
                  .map(([id, x]) => `<option value="${id}" ${u.assignedLead===id?'selected':''}>${x.name||x.email}</option>`).join('')}
              </select>
            </label>
            <label>Assign DM:
              <select onchange="assignDMToLead('${uid}',this.value)">
                <option value="">None</option>
                ${Object.entries(users).filter(([,x]) => x.role === ROLES.DM)
                  .map(([id, x]) => `<option value="${id}" ${u.assignedDM===id?'selected':''}>${x.name||x.email}</option>`).join('')}
              </select>
            </label>
            ${canDelete(currentRole) ? `<button class="btn btn-danger-outline" onclick="deleteUser('${uid}')">Delete</button>` : ''}
          </div>` : ''}
      </div>`;
  }).join('');

  const reviewEntries = Object.entries(reviews).sort((a,b)=>(b[1].timestamp||0)-(a[1].timestamp||0));
  const reviewCards = reviewEntries.map(([id, r]) => `
    <div class="review-card">
      <div class="review-header">
        <span class="review-star ${r.starred ? '' : 'inactive'}" ${canEdit(currentRole) ? `onclick="toggleStar('${id}',${!!r.starred})"` : ''}>&#9733;</span>
        <div><b>Store:</b> ${r.store||'-'}</div>
        <div><b>Associate:</b> ${r.associate||'-'}</div>
        ${canDelete(currentRole) ? `<button class="btn btn-danger btn-sm" onclick="deleteReview('${id}')">Delete</button>` : ''}
      </div>
      <div class="review-rating">${'★'.repeat(r.rating||0)}</div>
      <div class="review-comment">${r.comment||''}</div>
      <div class="review-meta"><b>When:</b> ${r.timestamp ? new Date(r.timestamp).toLocaleString() : '-'}</div>
      <div class="review-meta"><b>Referral:</b> ${r.refName ? `${r.refName} / ${r.refPhone}` : '-'}</div>
    </div>
  `).join('');

  const guestCards = Object.entries(guestinfo)
    .sort((a,b)=>(b[1].submittedAt||0)-(a[1].submittedAt||0))
    .map(([id, g]) => `
      <div class="guest-card">
        <div><b>Submitted by:</b> ${users[g.userUid]?.name || users[g.userUid]?.email || g.userUid}</div>
        <div><b>Customer:</b> ${g.custName||'-'} | <b>Phone:</b> ${g.custPhone||'-'}</div>
        <div><b>Type:</b> ${g.serviceType||'-'}</div>
        <div><b>Situation:</b> ${g.situation||'-'}</div>
        <div><b>When:</b> ${g.submittedAt ? new Date(g.submittedAt).toLocaleString() : '-'}</div>
      </div>
    `).join('');

  // Save raw review cache
  window._allReviews = reviewEntries;
  window._allReviewsHtml = reviewCards;
  window._users = users;
  window._stores = stores;

  // Render everything
  adminAppDiv.innerHTML = `
    <section class="admin-section stores-section">
      <h2>Stores</h2>
      <table class="store-table">
        <thead><tr><th>#</th><th>Team Lead</th><th>Actions</th></tr></thead>
        <tbody>${storeRows}</tbody>
      </table>
      ${canEdit(currentRole) ? `
        <div class="store-add">
          <input id="newStoreNum" placeholder="New Store #">
          <button onclick="addStore()">Add Store</button>
        </div>` : ''}
    </section>

    <section class="admin-section users-section">
      <h2>Users</h2>
      <div class="users-container">${userCards}</div>
    </section>

    <section class="admin-section reviews-section">
      <h2>Reviews</h2>
      <div class="review-controls"><button onclick="renderAdminApp()">Reload</button></div>
      <div class="reviews-container">${reviewCards}</div>
    </section>

    <section class="admin-section guestinfo-section">
      <h2>Guest Info</h2>
      <div class="guestinfo-container">${guestCards}</div>
    </section>

    <section class="admin-section guestform-section">
      <h2>Guest Forms</h2>
      <div class="guestform-link">
        <button onclick="window.location.href='employee/guest-portal.html'">Open Guest Portal</button>
      </div>
    </section>
  `;
}