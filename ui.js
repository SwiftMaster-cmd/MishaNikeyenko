const db = firebase.database();
const auth = firebase.auth();

window.renderAdminApp = async function(dmUid) {
  const adminAppDiv = document.getElementById('adminApp');
  adminAppDiv.innerHTML = "<div>Loading data...</div>";

  try {
    const [storesSnap, usersSnap, reviewsSnap, guestinfoSnap] = await Promise.all([
      db.ref('stores').once('value'),
      db.ref('users').once('value'),
      db.ref('reviews').once('value'),
      db.ref('guestinfo').once('value')
    ]);

    const stores = storesSnap.val() || {};
    const users = usersSnap.val() || {};
    const reviews = reviewsSnap.val() || {};
    const guestinfo = guestinfoSnap.val() || {};

    // Store Table HTML
    let storesHtml = `<table class="store-table"><thead><tr>
      <th>Store #</th><th>Assigned TL</th><th>Edit</th><th>Delete</th>
    </tr></thead><tbody>`;

    if (Object.keys(stores).length === 0) {
      storesHtml += `<tr><td colspan="4"><em>No stores added yet.</em></td></tr>`;
    }

    for (const storeId in stores) {
      const store = stores[storeId];
      const tlName = store.teamLeadUid && users[store.teamLeadUid]
        ? (users[store.teamLeadUid].name || users[store.teamLeadUid].email)
        : '';
      storesHtml += `<tr>
        <td><input value="${store.storeNumber}" onchange="updateStoreNumber('${storeId}', this.value)" style="width:110px"></td>
        <td>
          <select onchange="assignTL('${storeId}', this.value)">
            <option value="">-- Unassigned --</option>
            ${Object.entries(users).filter(([uid, u]) => u.role === 'lead' || u.role === 'dm').map(([uid, u]) =>
              `<option value="${uid}" ${store.teamLeadUid === uid ? 'selected' : ''}>${u.name || u.email}</option>`
            ).join('')}
          </select>
          ${tlName ? `<span class="role-badge role-lead">${tlName}</span>` : `<span class="role-badge role-guest">No TL</span>`}
        </td>
        <td><button onclick="editStorePrompt('${storeId}')">Edit</button></td>
        <td><button onclick="deleteStore('${storeId}')">Delete</button></td>
      </tr>`;
    }
    storesHtml += `</tbody></table>
      <input id="newStoreNum" placeholder="New Store #" style="width:120px; margin-right:8px;">
      <button onclick="addStore()">Add Store</button>`;

    // User Table HTML
    let usersHtml = `<table class="user-table"><thead><tr>
      <th>Name</th><th>Email</th><th>Role</th><th>Store</th><th>Assigned Lead</th><th>Assign Lead</th><th>Assigned DM</th><th>Assign DM</th><th>Delete</th>
    </tr></thead><tbody>`;

    if (Object.keys(users).length === 0) {
      usersHtml += `<tr><td colspan="9"><em>No users found.</em></td></tr>`;
    }

    for (const uid in users) {
      const u = users[uid];
      usersHtml += `<tr>
        <td>${u.name || ''}</td>
        <td>${u.email || ''}</td>
        <td>
          <span class="role-badge role-${u.role}">${u.role.toUpperCase()}</span>
          <select onchange="changeUserRole('${uid}', this.value)">
            <option value="guest" ${u.role === "guest" ? "selected" : ""}>Guest</option>
            <option value="lead" ${u.role === "lead" ? "selected" : ""}>Lead</option>
            <option value="dm" ${u.role === "dm" ? "selected" : ""}>DM</option>
          </select>
        </td>
        <td>${u.store || '-'}</td>
        <td>${u.assignedLead ? (users[u.assignedLead]?.name || users[u.assignedLead]?.email || '-') : '-'}</td>
        <td>
          <select onchange="assignLeadToGuest('${uid}', this.value)">
            <option value="">-- None --</option>
            ${Object.entries(users).filter(([leadUid, user]) => user.role === 'lead').map(([leadUid, user]) =>
              `<option value="${leadUid}" ${u.assignedLead === leadUid ? 'selected' : ''}>${user.name || user.email}</option>`
            ).join('')}
          </select>
        </td>
        <td>${u.assignedDM ? (users[u.assignedDM]?.name || users[u.assignedDM]?.email || '-') : '-'}</td>
        <td>
          <select onchange="assignDMToLead('${uid}', this.value)">
            <option value="">-- None --</option>
            ${Object.entries(users).filter(([dmUid, user]) => user.role === 'dm').map(([dmUid, user]) =>
              `<option value="${dmUid}" ${u.assignedDM === dmUid ? 'selected' : ''}>${user.name || user.email}</option>`
            ).join('')}
          </select>
        </td>
        <td><button onclick="deleteUser('${uid}')">Delete User</button></td>
      </tr>`;
    }
    usersHtml += `</tbody></table>`;

    // Reviews HTML
    let reviewsHtml = `<div class="review-cards">`;
    const reviewEntries = Object.entries(reviews).sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));
    if (reviewEntries.length === 0) {
      reviewsHtml += `<div style="padding:18px;"><em>No reviews submitted yet.</em></div>`;
    } else {
      for (const [id, r] of reviewEntries) {
        reviewsHtml += `
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
    }
    reviewsHtml += `</div>`;

    // Guestinfo HTML
    let guestInfoHtml = `<div class="review-cards">`;
    const guestEntries = Object.entries(guestinfo).sort((a, b) => (b[1].submittedAt || 0) - (a[1].submittedAt || 0));
    if (guestEntries.length === 0) {
      guestInfoHtml += `<div style="padding:18px;"><em>No guest info submitted yet.</em></div>`;
    } else {
      for (const [gid, g] of guestEntries) {
        guestInfoHtml += `
          <div class="review-card">
            <div class="review-meta"><b>Submitted by:</b> ${users[g.userUid]?.name || users[g.userUid]?.email || g.userUid || '-'}</div>
            <div class="review-meta"><b>Customer:</b> ${g.custName || '-'} <b>Phone:</b> ${g.custPhone || '-'}</div>
            <div class="review-meta"><b>Type:</b> ${g.serviceType || '-'}</div>
            <div class="review-meta"><b>Situation:</b> ${g.situation || '-'}</div>
            <div class="review-meta"><b>When:</b> ${g.submittedAt ? new Date(g.submittedAt).toLocaleString() : '-'}</div>
          </div>`;
      }
    }
    guestInfoHtml += `</div>`;

    adminAppDiv.innerHTML = `
      <div class="admin-section">
        <div class="section-title">Store Management</div>
        ${storesHtml}
      </div>
      <div class="admin-section">
        <div class="section-title">User Management</div>
        ${usersHtml}
      </div>
      <div class="admin-section">
        <div class="section-title">All Reviews</div>
        <button onclick="renderAdminApp()" style="float:right;margin-bottom:8px;">Reload</button>
        <button onclick="clearReviewFilter()" style="float:right;margin-bottom:8px;margin-right:10px;">Clear Filter</button>
        <div id="filteredReviews">${reviewsHtml}</div>
      </div>
      <div class="admin-section">
        <div class="section-title">All Guest Info</div>
        ${guestInfoHtml}
      </div>
    `;

    window._allReviews = reviewEntries;
    window._allReviewsHtml = reviewsHtml;
    window._users = users;
    window._stores = stores;

  } catch (error) {
    adminAppDiv.innerHTML = `<div style="color:#b00;padding:20px;">Error loading data: ${error.message || error}</div>`;
  }
};