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

// --- Auth check ---
auth.onAuthStateChanged(async user => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  const userSnap = await db.ref('users/' + user.uid).get();
  const profile = userSnap.val() || {};
  if (profile.role !== 'dm') {
    document.getElementById('adminApp').innerHTML = "<h3>Access denied: DM only</h3>";
    return;
  }
  document.getElementById('logoutBtn').onclick = () => auth.signOut();
  renderAdminApp();
});

async function renderAdminApp() {
  // Fetch data
  const [storesSnap, usersSnap, reviewsSnap] = await Promise.all([
    db.ref('stores').get(), db.ref('users').get(), db.ref('reviews').get()
  ]);
  const stores = storesSnap.val() || {};
  const users = usersSnap.val() || {};
  const reviews = reviewsSnap.val() || {};

  // --- Store Management Section ---
  let storesHtml = `<table class="store-table"><tr>
    <th>Store #</th><th>Assigned TL</th><th>Edit</th><th>Delete</th></tr>`;
  for (const storeId in stores) {
    const store = stores[storeId];
    const tl = store.teamLeadUid && users[store.teamLeadUid] ? users[store.teamLeadUid].name || users[store.teamLeadUid].email : '';
    storesHtml += `<tr>
      <td><input value="${store.storeNumber}" onchange="updateStoreNumber('${storeId}', this.value)" style="width:110px"></td>
      <td>
        <select onchange="assignTL('${storeId}', this.value)">
          <option value="">-- Unassigned --</option>
          ${Object.entries(users).filter(([uid, u]) => u.role === 'lead').map(([uid, u]) =>
            `<option value="${uid}" ${store.teamLeadUid === uid ? 'selected' : ''}>${u.name || u.email}</option>`
          ).join('')}
        </select>
      </td>
      <td><button onclick="editStorePrompt('${storeId}')">Edit</button></td>
      <td><button onclick="deleteStore('${storeId}')">Delete</button></td>
    </tr>`;
  }
  storesHtml += `</table>
    <input id="newStoreNum" placeholder="New Store #" style="width:120px;">
    <button onclick="addStore()">Add Store</button>`;

  // --- User Management Section ---
  let usersHtml = `<table class="user-table"><tr>
    <th>Name</th><th>Email</th><th>Role</th><th>Store</th><th>Change Role</th><th>Assign Store</th></tr>`;
  for (const uid in users) {
    const u = users[uid];
    usersHtml += `<tr>
      <td>${u.name||''}</td>
      <td>${u.email||''}</td>
      <td>
        <select onchange="changeUserRole('${uid}', this.value)">
          <option value="guest" ${u.role==="guest"?"selected":""}>Guest</option>
          <option value="lead" ${u.role==="lead"?"selected":""}>Lead</option>
          <option value="dm" ${u.role==="dm"?"selected":""}>DM</option>
        </select>
      </td>
      <td>${u.store||''}</td>
      <td><button onclick="editUserStore('${uid}')">Assign Store</button></td>
      <td><button onclick="deleteUser('${uid}')">Delete User</button></td>
    </tr>`;
  }
  usersHtml += `</table>`;

  // --- Reviews Section ---
  let reviewsHtml = `<div class="review-cards">`;
  Object.entries(reviews).sort((a,b) => (b[1].timestamp||0)-(a[1].timestamp||0)).forEach(([id, r]) => {
    reviewsHtml += `
      <div class="review-card">
        <span class="review-star ${r.starred ? '' : 'inactive'}" title="Star/unstar" onclick="toggleStar('${id}', ${!!r.starred})">
          &#9733;
        </span>
        <div class="review-meta"><b>Store:</b> ${r.store||'-'} | <b>Associate:</b> ${r.associate||'-'}</div>
        <div class="review-rating"><b>Rating:</b> ${'★'.repeat(r.rating||0)}</div>
        <div class="review-comment">${r.comment||''}</div>
        <div class="review-meta"><b>When:</b> ${r.timestamp ? new Date(r.timestamp).toLocaleString() : '-'}</div>
        <div class="review-meta"><b>Referral:</b> ${r.refName?`${r.refName} / ${r.refPhone}`:'-'}</div>
        <button onclick="deleteReview('${id}')" style="margin-top:8px;font-size:0.96em;">Delete Review</button>
      </div>`;
  });
  reviewsHtml += `</div>`;

  // --- Render all sections ---
  document.getElementById('adminApp').innerHTML = `
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
      ${reviewsHtml}
    </div>
  `;
}

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
window.assignTL = async function(storeId, uid) {
  await db.ref('stores/'+storeId+'/teamLeadUid').set(uid);
  if (uid) await db.ref('users/'+uid+'/store').set((await db.ref('stores/'+storeId+'/storeNumber').get()).val());
  renderAdminApp();
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
window.editUserStore = async function(uid) {
  const store = prompt("Enter store number for this user:");
  if (store) await db.ref('users/'+uid+'/store').set(store);
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