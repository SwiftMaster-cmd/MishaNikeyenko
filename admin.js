// --- Firebase Init ---
const firebaseConfig = {
  apiKey: "AIzaSyD9fILTNJQ0wsPftUsPkdLrhRGV9dslMzE",
  authDomain: "osls-644fd.firebaseapp.com",
  databaseURL: "https://osls-644fd-default-rtdb.firebaseio.com",
  projectId: "osls-644fd",
  storageBucket: "osls-644fd.appspot.com",
  messagingSenderId: "798578046321",
  appId: "1:798578046321:web:8758776701786a2fccf2d0",
  measurementId: "G-9HWXNSBE1T"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const auth = firebase.auth();

const adminAppDiv = document.getElementById('adminApp');

// --- Auth check & Load ---
auth.onAuthStateChanged(async user => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }
  adminAppDiv.innerHTML = "<div>Loading admin dashboard...</div>";
  try {
    const userSnap = await db.ref('users/' + user.uid).get();
    const profile = userSnap.val() || {};
    if (profile.role !== 'dm') {
      showDmUnlock();
      return;
    }
    document.getElementById('logoutBtn').onclick = () => auth.signOut();
    await renderAdminApp();
  } catch (e) {
    showDmUnlock(e);
    console.error(e);
  }
});

// --- DM Self-Promotion UI ---
function showDmUnlock(error) {
  adminAppDiv.innerHTML = `
    <h3>Access denied: DM only</h3>
    <p>If you’re the admin, enter your unlock code below to grant yourself access:</p>
    <input id="adminPass" placeholder="Enter code" style="padding:10px;width:160px;border-radius:8px;">
    <button onclick="trySelfPromote()" style="padding:10px 18px;border-radius:8px;font-weight:bold;margin-left:6px;">Unlock DM</button>
    <div id="unlockMsg" style="color:#b00;margin-top:8px;"></div>
    ${error ? `<div style="color:#b00;margin-top:8px;">${error.message || error.code}</div>` : ""}
  `;
}
window.trySelfPromote = async function() {
  const pass = document.getElementById('adminPass').value;
  if (pass !== '159896') {
    document.getElementById('unlockMsg').innerText = 'Wrong code!';
    return;
  }
  const user = firebase.auth().currentUser;
  if (!user) {
    document.getElementById('unlockMsg').innerText = 'Not signed in!';
    return;
  }
  try {
    await firebase.database().ref('users/' + user.uid + '/role').set('dm');
    document.getElementById('unlockMsg').innerText = 'DM access granted! Reloading...';
    setTimeout(() => window.location.reload(), 1200);
  } catch (e) {
    document.getElementById('unlockMsg').innerText = 'Upgrade failed: ' + (e.message || e.code);
  }
};

// --- Helper: Badge for roles ---
function roleBadge(role) {
  if (role === "dm") return `<span class="role-badge role-dm">DM</span>`;
  if (role === "lead") return `<span class="role-badge role-lead">Lead</span>`;
  return `<span class="role-badge role-guest">Guest</span>`;
}

// --- Render Admin App ---
async function renderAdminApp() {
  adminAppDiv.innerHTML = "<div>Loading data...</div>";

  // Fetch all data in parallel
  const [storesSnap, usersSnap, reviewsSnap, guestinfoSnap] = await Promise.all([
    db.ref('stores').get(),
    db.ref('users').get(),
    db.ref('reviews').get(),
    db.ref('guestinfo').get()
  ]);
  
  const stores = storesSnap.val() || {};
  const users = usersSnap.val() || {};
  const reviews = reviewsSnap.val() || {};
  const guestinfo = guestinfoSnap.val() || {};

  // --- Store Management Section ---
  const storesRows = Object.entries(stores).map(([id, store]) => {
    const tlUser = users[store.teamLeadUid];
    const tlName = tlUser ? tlUser.name || tlUser.email : "Unassigned";
    return `
      <tr>
        <td><input type="text" value="${store.storeNumber || ''}" onchange="updateStoreNumber('${id}', this.value)"></td>
        <td>
          <select onchange="assignTL('${id}', this.value)">
            <option value="">-- Unassigned --</option>
            ${Object.entries(users).filter(([uid, u]) => u.role === 'lead' || u.role === 'dm').map(([uid, u]) =>
              `<option value="${uid}" ${store.teamLeadUid === uid ? 'selected' : ''}>${u.name || u.email}</option>`
            ).join('')}
          </select>
          ${tlUser ? roleBadge(tlUser.role) + ' ' + (tlUser.name || tlUser.email) : ''}
        </td>
        <td><button onclick="editStorePrompt('${id}')">Edit</button></td>
        <td><button onclick="deleteStore('${id}')">Delete</button></td>
      </tr>
    `;
  }).join('') || `<tr><td colspan="4" style="text-align:center; font-style: italic;">No stores added yet.</td></tr>`;

  const storesHtml = `
    <div class="admin-section">
      <h3 class="section-title">Stores</h3>
      <table class="store-table" cellspacing="0" cellpadding="0">
        <thead>
          <tr>
            <th>Store Number</th>
            <th>Team Lead</th>
            <th>Edit</th>
            <th>Delete</th>
          </tr>
        </thead>
        <tbody>${storesRows}</tbody>
      </table>
      <div style="margin-top:10px;">
        <input id="newStoreNum" placeholder="New Store #" style="width:140px; padding:8px; font-size:1rem; border-radius:8px; border:1.5px solid #ccc;">
        <button onclick="addStore()" style="margin-left:12px; padding:10px 18px; font-size:1rem; border-radius:8px;">Add Store</button>
      </div>
    </div>
  `;

  // --- User Management Section ---
  const usersRows = Object.entries(users).map(([uid, user]) => {
    const assignedLeadUser = users[user.assignedLead];
    const assignedDMUser = users[user.assignedDM];
    return `
      <tr>
        <td>${user.name || ''}</td>
        <td>${user.email || ''}</td>
        <td>
          ${roleBadge(user.role)}
          <select onchange="changeUserRole('${uid}', this.value)">
            <option value="guest" ${user.role === "guest" ? "selected" : ""}>Guest</option>
            <option value="lead" ${user.role === "lead" ? "selected" : ""}>Lead</option>
            <option value="dm" ${user.role === "dm" ? "selected" : ""}>DM</option>
          </select>
        </td>
        <td>${user.store || '-'}</td>
        <td>${assignedLeadUser ? assignedLeadUser.name || assignedLeadUser.email : '-'}</td>
        <td>
          <select onchange="assignLeadToGuest('${uid}', this.value)">
            <option value="">-- None --</option>
            ${Object.entries(users).filter(([id, u]) => u.role === 'lead').map(([id, u]) =>
              `<option value="${id}" ${user.assignedLead === id ? 'selected' : ''}>${u.name || u.email}</option>`
            ).join('')}
          </select>
        </td>
        <td>${assignedDMUser ? assignedDMUser.name || assignedDMUser.email : '-'}</td>
        <td>
          <select onchange="assignDMToLead('${uid}', this.value)">
            <option value="">-- None --</option>
            ${Object.entries(users).filter(([id, u]) => u.role === 'dm').map(([id, u]) =>
              `<option value="${id}" ${user.assignedDM === id ? 'selected' : ''}>${u.name || u.email}</option>`
            ).join('')}
          </select>
        </td>
        <td><button onclick="deleteUser('${uid}')">Delete</button></td>
      </tr>
    `;
  }).join('') || `<tr><td colspan="9" style="text-align:center; font-style: italic;">No users found.</td></tr>`;

  const usersHtml = `
    <div class="admin-section">
      <h3 class="section-title">Users</h3>
      <table class="user-table" cellspacing="0" cellpadding="0">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Store</th>
            <th>Assigned Lead</th>
            <th>Assign Lead</th>
            <th>Assigned DM</th>
            <th>Assign DM</th>
            <th>Delete</th>
          </tr>
        </thead>
        <tbody>${usersRows}</tbody>
      </table>
    </div>
  `;

  // --- Reviews Section ---
  const reviewEntries = Object.entries(reviews).sort((a,b) => (b[1].timestamp||0) - (a[1].timestamp||0));
  const reviewsHtml = `
    <div class="admin-section">
      <h3 class="section-title">Reviews</h3>
      <button onclick="renderAdminApp()" style="float:right; margin-bottom:12px;">Reload</button>
      <button onclick="clearReviewFilter()" style="float:right; margin-bottom:12px; margin-right:12px;">Clear Filter</button>
      <div id="reviewCards" style="display:flex; flex-wrap: wrap; gap: 20px;">
        ${reviewEntries.length ? reviewEntries.map(([id, r]) => `
          <div class="review-card">
            <span class="review-star ${r.starred ? '' : 'inactive'}" title="Star/unstar" onclick="toggleStar('${id}', ${!!r.starred})">&#9733;</span>
            <div class="review-meta"><b>Store:</b> <span class="clickable" onclick="filterReviewsByStore('${r.store || '-'}')">${r.store || '-'}</span> | <b>Associate:</b> <span class="clickable" onclick="filterReviewsByAssociate('${r.associate || '-'}')">${r.associate || '-'}</span></div>
            <div class="review-rating">${'★'.repeat(r.rating || 0)}</div>
            <div class="review-comment">${r.comment || ''}</div>
            <div class="review-meta"><b>When:</b> ${r.timestamp ? new Date(r.timestamp).toLocaleString() : '-'}</div>
            <div class="review-meta"><b>Referral:</b> ${r.refName ? `${r.refName} / ${r.refPhone}` : '-'}</div>
            <button onclick="deleteReview('${id}')" style="margin-top: 8px; font-size: 0.95rem;">Delete</button>
          </div>
        `).join('') : `<p style="text-align:center; font-style:italic;">No reviews submitted yet.</p>`}
      </div>
    </div>
  `;

  // --- Guest Info Section ---
  const guestEntries = Object.entries(guestinfo).sort((a,b) => (b[1].submittedAt || 0) - (a[1].submittedAt || 0));
  const guestHtml = `
    <div class="admin-section">
      <h3 class="section-title">Guest Info</h3>
      <div style="display:flex; flex-wrap: wrap; gap: 20px;">
        ${guestEntries.length ? guestEntries.map(([id, g]) => `
          <div class="review-card">
            <div class="review-meta"><b>Submitted by:</b> ${users[g.userUid]?.name || users[g.userUid]?.email || g.userUid || '-'}</div>
            <div class="review-meta"><b>Customer:</b> ${g.custName || '-'} | <b>Phone:</b> ${g.custPhone || '-'}</div>
            <div class="review-meta"><b>Type:</b> ${g.serviceType || '-'}</div>
            <div class="review-meta"><b>Situation:</b> ${g.situation || '-'}</div>
            <div class="review-meta"><b>When:</b> ${g.submittedAt ? new Date(g.submittedAt).toLocaleString() : '-'}</div>
          </div>
        `).join('') : `<p style="text-align:center; font-style:italic;">No guest info submitted yet.</p>`}
      </div>
    </div>
  `;

  // Render everything
  adminAppDiv.innerHTML = storesHtml + usersHtml + reviewsHtml + guestHtml;

  // Save global for filtering
  window._allReviews = reviewEntries;
  window._allReviewsHtml = reviewsHtml;
  window._users = users;
  window._stores = stores;
}

// --- Assign Lead to Guest ---
window.assignLeadToGuest = async function(guestUid, leadUid) {
  await db.ref('users/' + guestUid + '/assignedLead').set(leadUid || null);
  renderAdminApp();
};

// --- Assign DM to Lead ---
window.assignDMToLead = async function(leadUid, dmUid) {
  await db.ref('users/' + leadUid + '/assignedDM').set(dmUid || null);
  renderAdminApp();
};

// --- Change User Role ---
window.changeUserRole = async function(uid, role) {
  await db.ref('users/' + uid + '/role').set(role);
  renderAdminApp();
};

// --- Update Store Number ---
window.updateStoreNumber = async function(storeId, val) {
  await db.ref('stores/' + storeId + '/storeNumber').set(val);
  renderAdminApp();
};

// --- Edit Store Prompt ---
window.editStorePrompt = async function(storeId) {
  const storeSnap = await db.ref('stores/' + storeId).get();
  const oldNum = storeSnap.val()?.storeNumber || '';
  const newNum = prompt("Edit store number:", oldNum);
  if (newNum && newNum !== oldNum) {
    await db.ref('stores/' + storeId + '/storeNumber').set(newNum);
    renderAdminApp();
  }
};

// --- Delete Store ---
window.deleteStore = async function(storeId) {
  if (!confirm("Delete this store?")) return;
  await db.ref('stores/' + storeId).remove();
  renderAdminApp();
};

// --- Delete User ---
window.deleteUser = async function(uid) {
  if (!confirm("Delete this user?")) return;
  await db.ref('users/' + uid).remove();
  renderAdminApp();
};

// --- Toggle Star on Review ---
window.toggleStar = async function(reviewId, starred) {
  await db.ref('reviews/' + reviewId + '/starred').set(!starred);
  renderAdminApp();
};

// --- Delete Review ---
window.deleteReview = async function(reviewId) {
  if (!confirm("Delete this review?")) return;
  await db.ref('reviews/' + reviewId).remove();
  renderAdminApp();
};

// --- Add Store ---
window.addStore = async function() {
  const num = document.getElementById('newStoreNum').value.trim();
  if (!num) return alert("Enter store #");
  await db.ref('stores').push({ storeNumber: num, teamLeadUid: "" });
  renderAdminApp();
};

// --- Filter Reviews ---
window.filterReviewsByStore = function(store) {
  const filtered = (window._allReviews || []).filter(([id, r]) => r.store === store);
  document.getElementById('reviewCards').innerHTML = reviewsToHtml(filtered);
};
window.filterReviewsByAssociate = function(associate) {
  const filtered = (window._allReviews || []).filter(([id, r]) => r.associate === associate);
  document.getElementById('reviewCards').innerHTML = reviewsToHtml(filtered);
};
window.clearReviewFilter = function() {
  document.getElementById('reviewCards').innerHTML = window._allReviewsHtml;
};
function reviewsToHtml(entries) {
  if (!entries.length) return `<p style="text-align:center; font-style: italic;">No reviews found for this filter.</p>`;
  return entries.map(([id, r]) => `
    <div class="review-card">
      <span class="review-star ${r.starred ? '' : 'inactive'}" title="Star/unstar" onclick="toggleStar('${id}', ${!!r.starred})">&#9733;</span>
      <div class="review-meta"><b>Store:</b> <span class="clickable" onclick="filterReviewsByStore('${r.store || '-'}')">${r.store || '-'}</span> | <b>Associate:</b> <span class="clickable" onclick="filterReviewsByAssociate('${r.associate || '-'}')">${r.associate || '-'}</span></div>
      <div class="review-rating">${'★'.repeat(r.rating || 0)}</div>
      <div class="review-comment">${r.comment || ''}</div>
      <div class="review-meta"><b>When:</b> ${r.timestamp ? new Date(r.timestamp).toLocaleString() : '-'}</div>
      <div class="review-meta"><b>Referral:</b> ${r.refName ? `${r.refName} / ${r.refPhone}` : '-'}</div>
      <button onclick="deleteReview('${id}')" style="margin-top:8px; font-size:0.95rem;">Delete</button>
    </div>`).join('');
}