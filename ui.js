import { changeUserRole, assignLeadToGuest, assignDMToLead, deleteUser } from './user.js';
import { assignTL, updateStoreNumber, deleteStore, addStore, editUserStore } from './store.js';
import { fetchUsers, fetchStores, fetchReviews, fetchGuestInfo } from './dataFetchers.js'; // (assumed combined fetch functions)

// Cached global data
let _users = {};
let _stores = {};
let _reviews = {};
let _guestinfo = {};

const adminAppDiv = document.getElementById('adminApp');

// Render badges
function roleBadge(role) {
  if (role === "dm") return `<span class="role-badge role-dm">DM</span>`;
  if (role === "lead") return `<span class="role-badge role-lead">Lead</span>`;
  return `<span class="role-badge role-guest">Guest</span>`;
}

// Render Stores Table
function renderStoresTable(stores, users) {
  let html = `<table class="store-table"><thead><tr>
    <th>Store #</th><th>Assigned TL</th><th>Edit</th><th>Delete</th></tr></thead><tbody>`;
  if (Object.keys(stores).length === 0) {
    html += `<tr><td colspan="4"><em>No stores added yet.</em></td></tr>`;
  } else {
    for (const storeId in stores) {
      const store = stores[storeId];
      const tlName = store.teamLeadUid && users[store.teamLeadUid]
        ? (users[store.teamLeadUid].name || users[store.teamLeadUid].email)
        : '';
      html += `<tr>
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
  }
  html += `</tbody></table>
    <input id="newStoreNum" placeholder="New Store #" style="width:120px;">
    <button onclick="handleAddStore()">Add Store</button>`;
  return html;
}

// Render Users Table
function renderUsersTable(users) {
  let html = `<table class="user-table"><thead><tr>
    <th>Name</th><th>Email</th><th>Role</th><th>Store</th><th>Assigned Lead</th><th>Assign Lead</th><th>Assigned DM</th><th>Assign DM</th><th>Delete</th></tr></thead><tbody>`;
  if (Object.keys(users).length === 0) {
    html += `<tr><td colspan="9"><em>No users found.</em></td></tr>`;
  } else {
    for (const uid in users) {
      const u = users[uid];
      html += `<tr>
        <td>${u.name || ''}</td>
        <td>${u.email || ''}</td>
        <td>
          ${roleBadge(u.role)}
          <select onchange="handleChangeUserRole('${uid}', this.value)">
            <option value="guest" ${u.role === "guest" ? "selected" : ""}>Guest</option>
            <option value="lead" ${u.role === "lead" ? "selected" : ""}>Lead</option>
            <option value="dm" ${u.role === "dm" ? "selected" : ""}>DM</option>
          </select>
        </td>
        <td>${u.store || '-'}</td>
        <td>${u.assignedLead ? (users[u.assignedLead]?.name || users[u.assignedLead]?.email || '-') : '-'}</td>
        <td>
          <select onchange="handleAssignLeadToGuest('${uid}', this.value)">
            <option value="">-- None --</option>
            ${Object.entries(users)
              .filter(([leadUid, user]) => user.role === 'lead')
              .map(([leadUid, user]) =>
                `<option value="${leadUid}" ${u.assignedLead === leadUid ? 'selected' : ''}>${user.name || user.email}</option>`
              ).join('')}
          </select>
        </td>
        <td>${u.assignedDM ? (users[u.assignedDM]?.name || users[u.assignedDM]?.email || '-') : '-'}</td>
        <td>
          <select onchange="handleAssignDMToLead('${uid}', this.value)">
            <option value="">-- None --</option>
            ${Object.entries(users)
              .filter(([dmUid, user]) => user.role === 'dm')
              .map(([dmUid, user]) =>
                `<option value="${dmUid}" ${u.assignedDM === dmUid ? 'selected' : ''}>${user.name || user.email}</option>`
              ).join('')}
          </select>
        </td>
        <td><button onclick="handleDeleteUser('${uid}')">Delete User</button></td>
      </tr>`;
    }
  }
  html += `</tbody></table>`;
  return html;
}

// Render Reviews Cards
function renderReviewsCards(reviews, users) {
  const reviewEntries = Object.entries(reviews).sort((a,b) => (b[1].timestamp||0)-(a[1].timestamp||0));
  if (reviewEntries.length === 0) {
    return `<div style="padding:18px;"><em>No reviews submitted yet.</em></div>`;
  }
  let html = `<div class="review-cards">`;
  for (const [id, r] of reviewEntries) {
    html += `
      <div class="review-card">
        <span class="review-star ${r.starred ? '' : 'inactive'}" title="Star/unstar" onclick="handleToggleStar('${id}', ${!!r.starred})">
          &#9733;
        </span>
        <div class="review-meta">
          <b>Store:</b> <span class="clickable" onclick="handleFilterReviewsByStore('${r.store||'-'}')">${r.store||'-'}</span>
           | <b>Associate:</b> <span class="clickable" onclick="handleFilterReviewsByAssociate('${r.associate||'-'}')">${r.associate||'-'}</span>
        </div>
        <div class="review-rating"><b>Rating:</b> ${'★'.repeat(r.rating||0)}</div>
        <div class="review-comment">${r.comment||''}</div>
        <div class="review-meta"><b>When:</b> ${r.timestamp ? new Date(r.timestamp).toLocaleString() : '-'}</div>
        <div class="review-meta"><b>Referral:</b> ${r.refName?`${r.refName} / ${r.refPhone}`:'-'}</div>
        <button onclick="handleDeleteReview('${id}')" style="margin-top:8px;font-size:0.96em;">Delete Review</button>
      </div>`;
  }
  html += `</div>`;
  return html;
}

// Render Guest Info Cards
function renderGuestInfoCards(guestinfo, users) {
  const guestEntries = Object.entries(guestinfo).sort((a,b) => (b[1].submittedAt||0) - (a[1].submittedAt||0));
  if (guestEntries.length === 0) {
    return `<div style="padding:18px;"><em>No guest info submitted yet.</em></div>`;
  }
  let html = `<div class="review-cards">`;
  for (const [id, g] of guestEntries) {
    html += `
      <div class="review-card">
        <div class="review-meta"><b>Submitted by:</b> ${users[g.userUid]?.name || users[g.userUid]?.email || g.userUid || '-'}</div>
        <div class="review-meta"><b>Customer:</b> ${g.custName || '-'} <b>Phone:</b> ${g.custPhone || '-'}</div>
        <div class="review-meta"><b>Type:</b> ${g.serviceType || '-'}</div>
        <div class="review-meta"><b>Situation:</b> ${g.situation || '-'}</div>
        <div class="review-meta"><b>When:</b> ${g.submittedAt ? new Date(g.submittedAt).toLocaleString() : '-'}</div>
      </div>`;
  }
  html += `</div>`;
  return html;
}

// Main render function to update UI
export function renderAdminUI({ stores, users, reviews, guestinfo }) {
  const adminAppDiv = document.getElementById('adminApp');
  if (!adminAppDiv) return;

  adminAppDiv.innerHTML = `
    <section class="admin-section">
      <h3 class="section-title">Store Management</h3>
      ${renderStoresTable(stores, users)}
    </section>
    <section class="admin-section">
      <h3 class="section-title">User Management</h3>
      ${renderUsersTable(users)}
    </section>
    <section class="admin-section">
      <h3 class="section-title">All Reviews</h3>
      <button onclick="window.reloadAdminData()" style="float:right;margin-bottom:8px;">Reload</button>
      <button onclick="window.clearReviewFilter()" style="float:right;margin-bottom:8px;margin-right:10px;">Clear Filter</button>
      <div id="filteredReviews">${renderReviewsCards(reviews, users)}</div>
    </section>
    <section class="admin-section">
      <h3 class="section-title">All Guest Info</h3>
      ${renderGuestInfoCards(guestinfo, users)}
    </section>
  `;
}