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

  // Load all needed data
  let [storesSnap, usersSnap, reviewsSnap, guestinfoSnap] = await Promise.all([
    db.ref('stores').get(), 
    db.ref('users').get(), 
    db.ref('reviews').get(),
    db.ref('guestinfo').get()
  ]);
  let stores = storesSnap.val() || {};
  let users = usersSnap.val() || {};
  let reviews = reviewsSnap.val() || {};
  let guestinfo = guestinfoSnap.val() || {};

  // --- Store Management Section ---
  let storesHtml = `<table class="store-table"><tr>
    <th>Store #</th><th>Assigned TL</th><th>Edit</th><th>Delete</th></tr>`;
  if (Object.keys(stores).length === 0) {
    storesHtml += `<tr><td colspan="4"><em>No stores added yet.</em></td></tr>`;
  }
  for (const storeId in stores) {
    const store = stores[storeId];
    const tl = store.teamLeadUid && users[store.teamLeadUid]
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
        ${tl ? `<span class="role-badge role-lead">${tl}</span>` : `<span class="role-badge role-guest">No TL</span>`}
      </td>
      <td><button onclick="editStorePrompt('${storeId}')">Edit</button></td>
      <td><button onclick="deleteStore('${storeId}')">Delete</button></td>
    </tr>`;
  }
  storesHtml += `</table>
    <input id="newStoreNum" placeholder="New Store #" style="width:120px;">
    <button onclick="addStore()">Add Store</button>`;

  // --- User Management Section (with all assignments) ---
  let usersHtml = `<table class="user-table"><tr>
    <th>Name</th><th>Email</th><th>Role</th><th>Store</th><th>Assigned Lead</th><th>Assign Lead</th><th>Assigned DM</th><th>Assign DM</th><th>Delete</th></tr>`;
  if (Object.keys(users).length === 0) {
    usersHtml += `<tr><td colspan="9"><em>No users found.</em></td></tr>`;
  }
  for (const uid in users) {
    const u = users[uid];
    usersHtml += `<tr>
      <td>${u.name || ''}</td>
      <td>${u.email || ''}</td>
      <td>
        ${roleBadge(u.role)}
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
          ${Object.entries(users)
            .filter(([leadUid, user]) => user.role === 'lead')
            .map(([leadUid, user]) =>
              `<option value="${leadUid}" ${u.assignedLead === leadUid ? 'selected' : ''}>${user.name || user.email}</option>`
            ).join('')}
        </select>
      </td>
      <td>${u.assignedDM ? (users[u.assignedDM]?.name || users[u.assignedDM]?.email || '-') : '-'}</td>
      <td>
        <select onchange="assignDMToLead('${uid}', this.value)">
          <option value="">-- None --</option>
          ${Object.entries(users)
            .filter(([dmUid, user]) => user.role === 'dm')
            .map(([dmUid, user]) =>
              `<option value="${dmUid}" ${u.assignedDM === dmUid ? 'selected' : ''}>${user.name || user.email}</option>`
            ).join('')}
        </select>
      </td>
      <td><button onclick="deleteUser('${uid}')">Delete User</button></td>
    </tr>`;
  }
  usersHtml += `</table>`;

  // --- Reviews Section ---
  let reviewsHtml = `<div class="review-cards">`;
  const reviewEntries = Object.entries(reviews).sort((a,b) => (b[1].timestamp||0)-(a[1].timestamp||0));
  if (reviewEntries.length === 0) {
    reviewsHtml += `<div style="padding:18px;"><em>No reviews submitted yet.</em></div>`;
  }
  for (const [id, r] of reviewEntries) {
    reviewsHtml += `
      <div class="review-card">
        <span class="review-star ${r.starred ? '' : 'inactive'}" title="Star/unstar" onclick="toggleStar('${id}', ${!!r.starred})">
          &#9733;
        </span>
        <div class="review-meta">
          <b>Store:</b> <span class="clickable" onclick="filterReviewsByStore('${r.store||'-'}')">${r.store||'-'}</span>
           | <b>Associate:</b> <span class="clickable" onclick="filterReviewsByAssociate('${r.associate||'-'}')">${r.associate||'-'}</span>
        </div>
        <div class="review-rating"><b>Rating:</b> ${'★'.repeat(r.rating||0)}</div>
        <div class="review-comment">${r.comment||''}</div>
        <div class="review-meta"><b>When:</b> ${r.timestamp ? new Date(r.timestamp).toLocaleString() : '-'}</div>
        <div class="review-meta"><b>Referral:</b> ${r.refName?`${r.refName} / ${r.refPhone}`:'-'}</div>
        <button onclick="deleteReview('${id}')" style="margin-top:8px;font-size:0.96em;">Delete Review</button>
      </div>`;
  }
  reviewsHtml += `</div>`;

  // --- Guest Info Section (all for users/TLs under this DM) ---
  let guestInfoHtml = `<div class="guestinfo-cards"><h3>All Guest Info Submissions</h3>`;
  const currentDmUid = auth.currentUser.uid;
  const allUserUidsUnderDM = Object.keys(users).filter(
    uid => users[uid].assignedDM === currentDmUid || uid === currentDmUid
  );
  const filteredGuestInfo = Object.entries(guestinfo).filter(([gid, g]) => g.userUid && allUserUidsUnderDM.includes(g.userUid));
  if (filteredGuestInfo.length === 0) {
    guestInfoHtml += `<div style="padding:18px;"><em>No guest info submitted yet.</em></div>`;
  } else {
    guestInfoHtml += `
      <table border="0" cellpadding="7" class="guestinfo-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Customer Name</th>
            <th>Customer Phone</th>
            <th>Service Type</th>
            <th>Situation</th>
            <th>When</th>
          </tr>
        </thead>
        <tbody>
          ${filteredGuestInfo.map(([gid, g]) => `
            <tr>
              <td>${users[g.userUid]?.email || g.userUid}</td>
              <td>${g.custName || ''}</td>
              <td>${g.custPhone || ''}</td>
              <td>${g.serviceType || ''}</td>
              <td>${g.situation || ''}</td>
              <td>${g.submittedAt ? new Date(g.submittedAt).toLocaleString() : ''}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }
  guestInfoHtml += `</div>`;

  // --- Render all sections ---
  adminAppDiv.innerHTML = `
    <style>
      .role-badge {display:inline-block;padding:3px 8px;border-radius:12px;font-size:0.95em;margin-right:5px;}
      .role-dm {background:#388fff;color:#fff;}
      .role-lead {background:#43d77f;color:#fff;}
      .role-guest {background:#ccd1db;color:#223;}
      .clickable {color:#388fff;text-decoration:underline;cursor:pointer;}
      .review-card {border-radius:18px;background:#f7faff;box-shadow:0 2px 8px #b8d1ff26;padding:16px;margin:10px 0;}
      .review-star {font-size:1.4em;cursor:pointer;}
      .review-star.inactive {color:#b5b5b5;}
      .guestinfo-cards {margin-top:36px;}
      .guestinfo-table {margin-top:8px;}
    </style>
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
  window._allReviews = reviewEntries; // Save for filtering
  window._allReviewsHtml = reviewsHtml;
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
  document.getElementById('filteredReviews').innerHTML = reviewsToHtml(filtered);
};
window.filterReviewsByAssociate = function(associate) {
  const filtered = (window._allReviews || []).filter(([id, r]) => r.associate === associate);
  document.getElementById('filteredReviews').innerHTML = reviewsToHtml(filtered);
};
window.clearReviewFilter = function() {
  document.getElementById('filteredReviews').innerHTML = window._allReviewsHtml;
};
function reviewsToHtml(entries) {
  if (!entries.length) return `<div style="padding:18px;"><em>No reviews found for this filter.</em></div>`;
  let html = '';
  for (const [id, r] of entries) {
    html += `
      <div class="review-card">
        <span class="review-star ${r.starred ? '' : 'inactive'}" title="Star/unstar" onclick="toggleStar('${id}', ${!!r.starred})">
          &#9733;
        </span>
        <div class="review-meta">
          <b>Store:</b> <span class="clickable" onclick="filterReviewsByStore('${r.store||'-'}')">${r.store||'-'}</span>
           | <b>Associate:</b> <span class="clickable" onclick="filterReviewsByAssociate('${r.associate||'-'}')">${r.associate||'-'}</span>
        </div>
        <div class="review-rating"><b>Rating:</b> ${'★'.repeat(r.rating||0)}</div>
        <div class="review-comment">${r.comment||''}</div>
        <div class="review-meta"><b>When:</b> ${r.timestamp ? new Date(r.timestamp).toLocaleString() : '-'}</div>
        <div class="review-meta"><b>Referral:</b> ${r.refName?`${r.refName} / ${r.refPhone}`:'-'}</div>
        <button onclick="deleteReview('${id}')" style="margin-top:8px;font-size:0.96em;">Delete Review</button>
      </div>`;
  }
  return html;
}

// --- Interconnected Store/TL assignment ---
window.assignTL = async function(storeId, uid) {
  // Remove this TL from any previous stores
  const storesSnap = await db.ref('stores').get();
  const stores = storesSnap.val() || {};
  for (const sId in stores) {
    if (stores[sId].teamLeadUid === uid && sId !== storeId) {
      await db.ref('stores/' + sId + '/teamLeadUid').set('');
    }
  }
  // Set new TL for this store
  await db.ref('stores/' + storeId + '/teamLeadUid').set(uid);
  // Update user's assigned store and role
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
  // Find the storeId with this store number
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
    // Optionally create new store
    if (confirm("Store not found. Create it?")) {
      const newRef = await db.ref('stores').push({ storeNumber: storeNum, teamLeadUid: uid });
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