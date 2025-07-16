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
    await renderAdminApp(user.uid);
  } catch (e) {
    showDmUnlock(e);
    console.error(e);
  }
});

// ---- DM Self-Promotion UI ----
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
    await db.ref('users/' + user.uid + '/role').set('dm');
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
async function renderAdminApp(dmUid) {
  adminAppDiv.innerHTML = "<div>Loading data...</div>";

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

  // --- Store Management: Table ---
  const storesRows = Object.entries(stores).map(([id, store]) => {
    const tlUser = users[store.teamLeadUid];
    return `
      <tr>
        <td><input type="text" value="${store.storeNumber || ''}" onchange="updateStoreNumber('${id}', this.value)" /></td>
        <td>
          <select onchange="assignTL('${id}', this.value)">
            <option value="">-- Unassigned --</option>
            ${Object.entries(users).filter(([uid, u]) => u.role === 'lead' || u.role === 'dm').map(([uid, u]) =>
              `<option value="${uid}" ${store.teamLeadUid === uid ? 'selected' : ''}>${u.name || u.email}</option>`
            ).join('')}
          </select>
          ${tlUser ? `<span class="role-badge role-${tlUser.role}">${tlUser.name || tlUser.email}</span>` : ''}
        </td>
        <td><button class="btn btn-danger" onclick="deleteStore('${id}')">Delete</button></td>
      </tr>
    `;
  }).join('') || `<tr><td colspan="3" class="text-center">No stores added.</td></tr>`;

  // --- Users: Card layout ---
  const userCards = Object.entries(users).map(([uid, user]) => {
    const leadUser = users[user.assignedLead];
    const dmUser = users[user.assignedDM];
    return `
      <div class="user-card">
        <div class="user-header">
          <div class="user-name">${user.name || user.email}</div>
          <div class="role-badge role-${user.role}">${user.role.toUpperCase()}</div>
          <button class="btn btn-danger btn-sm" onclick="deleteUser('${uid}')">Delete</button>
        </div>
        <div class="user-info">
          <div><b>Email:</b> ${user.email}</div>
          <div><b>Store:</b> ${user.store || '-'}</div>
          <div><b>Lead:</b> ${leadUser ? leadUser.name || leadUser.email : '-'}</div>
          <div><b>DM:</b> ${dmUser ? dmUser.name || dmUser.email : '-'}</div>
        </div>
        <div class="user-actions">
          <label>Role:
            <select onchange="changeUserRole('${uid}', this.value)">
              <option value="guest" ${user.role === 'guest' ? 'selected' : ''}>Guest</option>
              <option value="lead" ${user.role === 'lead' ? 'selected' : ''}>Lead</option>
              <option value="dm" ${user.role === 'dm' ? 'selected' : ''}>DM</option>
            </select>
          </label>
          <label>Assign Lead:
            <select onchange="assignLeadToGuest('${uid}', this.value)">
              <option value="">None</option>
              ${Object.entries(users).filter(([id, u]) => u.role === 'lead').map(([id, u]) =>
                `<option value="${id}" ${user.assignedLead === id ? 'selected' : ''}>${u.name || u.email}</option>`
              ).join('')}
            </select>
          </label>
          <label>Assign DM:
            <select onchange="assignDMToLead('${uid}', this.value)">
              <option value="">None</option>
              ${Object.entries(users).filter(([id, u]) => u.role === 'dm').map(([id, u]) =>
                `<option value="${id}" ${user.assignedDM === id ? 'selected' : ''}>${u.name || u.email}</option>`
              ).join('')}
            </select>
          </label>
        </div>
      </div>
    `;
  }).join('') || `<p class="text-center">No users found.</p>`;

  // --- Reviews: Cards with filter ---
  const reviewEntries = Object.entries(reviews).sort((a,b) => (b[1].timestamp||0) - (a[1].timestamp||0));
  const reviewCards = reviewEntries.length
    ? reviewEntries.map(([id, r]) => `
        <div class="review-card">
          <div class="review-header">
            <span class="review-star ${r.starred ? '' : 'inactive'}" title="Star/unstar" onclick="toggleStar('${id}', ${!!r.starred})">&#9733;</span>
            <div><b>Store:</b> <span class="clickable" onclick="filterReviewsByStore('${r.store || '-'}')">${r.store || '-'}</span></div>
            <div><b>Associate:</b> <span class="clickable" onclick="filterReviewsByAssociate('${r.associate || '-'}')">${r.associate || '-'}</span></div>
            <button class="btn btn-danger btn-sm" onclick="deleteReview('${id}')">Delete</button>
          </div>
          <div class="review-rating">${'★'.repeat(r.rating || 0)}</div>
          <div class="review-comment">${r.comment || ''}</div>
          <div class="review-meta"><b>When:</b> ${r.timestamp ? new Date(r.timestamp).toLocaleString() : '-'}</div>
          <div class="review-meta"><b>Referral:</b> ${r.refName ? `${r.refName} / ${r.refPhone}` : '-'}</div>
        </div>
      `).join('')
    : `<p class="text-center">No reviews yet.</p>`;

  // --- Guest Info: Cards ---
  const guestEntries = Object.entries(guestinfo).sort((a,b) => (b[1].submittedAt || 0) - (a[1].submittedAt || 0));
  const guestCards = guestEntries.length
    ? guestEntries.map(([id, g]) => `
        <div class="guest-card">
          <div><b>Submitted by:</b> ${users[g.userUid]?.name || users[g.userUid]?.email || g.userUid || '-'}</div>
          <div><b>Customer:</b> ${g.custName || '-'} | <b>Phone:</b> ${g.custPhone || '-'}</div>
          <div><b>Type:</b> ${g.serviceType || '-'}</div>
          <div><b>Situation:</b> ${g.situation || '-'}</div>
          <div><b>When:</b> ${g.submittedAt ? new Date(g.submittedAt).toLocaleString() : '-'}</div>
        </div>
      `).join('')
    : `<p class="text-center">No guest info yet.</p>`;

  // Render all sections
  adminAppDiv.innerHTML = `
    <section class="admin-section stores-section">
      <h2>Stores</h2>
      <table class="store-table">
        <thead>
          <tr><th>Store #</th><th>Team Lead</th><th>Actions</th></tr>
        </thead>
        <tbody>${storesRows}</tbody>
      </table>
      <div class="store-add">
        <input id="newStoreNum" placeholder="New Store #" />
        <button onclick="addStore()">Add Store</button>
      </div>
    </section>

    <section class="admin-section users-section">
      <h2>Users</h2>
      <div class="users-container">${userCards}</div>
    </section>

    <section class="admin-section reviews-section">
      <h2>Reviews</h2>
      <div class="review-controls">
        <button onclick="renderAdminApp()">Reload</button>
        <button onclick="clearReviewFilter()">Clear Filter</button>
      </div>
      <div class="reviews-container">${reviewCards}</div>
    </section>

    <section class="admin-section guestinfo-section">
      <h2>Guest Info</h2>
      <div class="guestinfo-container">${guestCards}</div>
    </section>
  `;

  // Save globals for filtering
  window._allReviews = reviewEntries;
  window._allReviewsHtml = reviewCards;
  window._users = users;
  window._stores = stores;
}

// --- Assign guest to lead ---
window.assignLeadToGuest = async function(guestUid, leadUid) {
  await db.ref('users/' + guestUid + '/assignedLead').set(leadUid || null);
  renderAdminApp();
};

// --- Assign DM to TL ---
window.assignDMToLead = async function(leadUid, dmUid) {
  await db.ref('users/' + leadUid + '/assignedDM').set(dmUid || null);
  renderAdminApp();
};

// --- Filtering reviews ---
window.filterReviewsByStore = function(store) {
  const filtered = (window._allReviews || []).filter(([id, r]) => r.store === store);
  document.querySelector('.reviews-container').innerHTML = reviewsToHtml(filtered);
};
window.filterReviewsByAssociate = function(associate) {
  const filtered = (window._allReviews || []).filter(([id, r]) => r.associate === associate);
  document.querySelector('.reviews-container').innerHTML = reviewsToHtml(filtered);
};
window.clearReviewFilter = function() {
  document.querySelector('.reviews-container').innerHTML = window._allReviewsHtml;
};
function reviewsToHtml(entries) {
  if (!entries.length) return `<p class="text-center">No reviews found for this filter.</p>`;
  return entries.map(([id, r]) => `
    <div class="review-card">
      <div class="review-header">
        <span class="review-star ${r.starred ? '' : 'inactive'}" title="Star/unstar" onclick="toggleStar('${id}', ${!!r.starred})">&#9733;</span>
        <div><b>Store:</b> <span class="clickable" onclick="filterReviewsByStore('${r.store || '-'}')">${r.store || '-'}</span></div>
        <div><b>Associate:</b> <span class="clickable" onclick="filterReviewsByAssociate('${r.associate || '-'}')">${r.associate || '-'}</span></div>
        <button class="btn btn-danger btn-sm" onclick="deleteReview('${id}')">Delete</button>
      </div>
      <div class="review-rating">${'★'.repeat(r.rating || 0)}</div>
      <div class="review-comment">${r.comment || ''}</div>
      <div class="review-meta"><b>When:</b> ${r.timestamp ? new Date(r.timestamp).toLocaleString() : '-'}</div>
      <div class="review-meta"><b>Referral:</b> ${r.refName ? `${r.refName} / ${r.refPhone}` : '-'}</div>
    </div>
  `).join('');
}

// --- Interconnected Store/TL assignment ---
window.assignTL = async function(storeId, uid) {
  const storesSnap = await db.ref('stores').get();
  const stores = storesSnap.val() || {};
  for (const sId in stores) {
    if (stores[sId].teamLeadUid === uid && sId !== storeId) {
      await db.ref('stores/' + sId + '/teamLeadUid').set('');
    }
  }
  await db.ref('stores/' + storeId + '/teamLeadUid').set(uid);
  if (uid) {
    const storeNum = (await db.ref('stores/' + storeId + '/storeNumber').get()).val();
    await db.ref('users/' + uid + '/store').set(storeNum);
    await db.ref('users/' + uid + '/role').set('lead');
  }
  renderAdminApp();
};

// --- Assign Store to User (reverse assign, and sync store table) ---
window.editUserStore = async function(uid) {
  const storeNum = prompt("Enter store number for this user:");
  if (!storeNum) return;
  const storesSnap = await db.ref('stores').get();
  const stores = storesSnap.val() || {};
  let matchedStoreId = null;
  for (const sId in stores) {
    if (stores[sId].storeNumber == storeNum) matchedStoreId = sId;
  }
  if (matchedStoreId) {
    await db.ref('stores/' + matchedStoreId + '/teamLeadUid').set(uid);
    await db.ref('users/' + uid + '/store').set(storeNum);
    await db.ref('users/' + uid + '/role').set('lead');
  } else {
    if (confirm("Store not found. Create it?")) {
      await db.ref('stores').push({ storeNumber: storeNum, teamLeadUid: uid });
      await db.ref('users/' + uid + '/store').set(storeNum);
      await db.ref('users/' + uid + '/role').set('lead');
    }
  }
  renderAdminApp();
};

// ---- Admin Actions (global so HTML can call) ----
window.addStore = async function() {
  const num = document.getElementById('newStoreNum').value.trim();
  if (!num) return alert("Enter store #");
  await db.ref('stores').push({ storeNumber: num, teamLeadUid: "" });
  renderAdminApp();
};
window.updateStoreNumber = async function(storeId, val) {
  await db.ref('stores/'+storeId+'/storeNumber').set(val);
  renderAdminApp();
};
window.editStorePrompt = async function(storeId) {
  const store = await db.ref('stores/'+storeId).get();
  const oldNum = store.val()?.storeNumber || '';
  const newNum = prompt("Edit store number:", oldNum);
  if (newNum && newNum !== oldNum) {
    await db.ref('stores/'+storeId+'/storeNumber').set(newNum);
    renderAdminApp();
  }
};
window.deleteStore = async function(storeId) {
  if (!confirm("Delete this store?")) return;
  await db.ref('stores/'+storeId).remove();
  renderAdminApp();
};
window.changeUserRole = async function(uid, role) {
  await db.ref('users/'+uid+'/role').set(role);
  renderAdminApp();
};
window.deleteUser = async function(uid) {
  if (!confirm("Delete this user?")) return;
  await db.ref('users/'+uid).remove();
  renderAdminApp();
};
window.toggleStar = async function(reviewId, starred) {
  await db.ref('reviews/'+reviewId+'/starred').set(!starred);
  renderAdminApp();
};
window.deleteReview = async function(reviewId) {
  if (!confirm("Delete this review?")) return;
  await db.ref('reviews/'+reviewId).remove();
  renderAdminApp();
};