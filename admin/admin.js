/* ========================================================================
   Firebase Init
   ===================================================================== */
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
const db   = firebase.database();
const auth = firebase.auth();

window.db = db; // expose for users.js and others

const adminAppDiv = document.getElementById("adminApp");

/* ========================================================================
   RBAC helpers
   ===================================================================== */
const ROLES = { ME: "me", LEAD: "lead", DM: "dm", ADMIN: "admin" };
let currentUid  = null;
let currentRole = ROLES.ME;

// abilities
const canEdit   = r => r !== ROLES.ME;
const canDelete = r => r === ROLES.DM || r === ROLES.ADMIN;

// guard rails (blocks console hacking)
function assertEdit()   { if (!canEdit(currentRole))   throw "PERM_DENIED_EDIT";   }
function assertDelete() { if (!canDelete(currentRole)) throw "PERM_DENIED_DELETE"; }

// label
const roleBadge = r => `<span class="role-badge role-${r}">${r.toUpperCase()}</span>`;

/* ========================================================================
   Auth flow
   ===================================================================== */
auth.onAuthStateChanged(async user => {
  if (!user) { window.location.href = "index.html"; return; }

  currentUid = user.uid;
  const snap = await db.ref("users/"+user.uid).get();
  const prof = snap.val() || {
    role : ROLES.ME,
    name : user.displayName || user.email,
    email: user.email
  };
  // ensure record
  await db.ref("users/"+user.uid).update(prof);

  currentRole = prof.role || ROLES.ME;
  window.currentRole = currentRole; // for users.js

  document.getElementById("logoutBtn")?.addEventListener("click", () => auth.signOut());

  renderAdminApp();
});

/* ========================================================================
   Main render
   ===================================================================== */
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

  /* ------------------ STORES ------------------ */
  const storeRows = Object.entries(stores).map(([id,s])=>{
    const tl = users[s.teamLeadUid] || {};
    return `<tr>
      <td>${canEdit(currentRole)
        ? `<input type="text" value="${s.storeNumber||''}" onchange="updateStoreNumber('${id}',this.value)">`
        : s.storeNumber||'-'}</td>
      <td>
        ${canEdit(currentRole) ? `<select onchange="assignTL('${id}',this.value)">
          <option value="">-- Unassigned --</option>
          ${Object.entries(users)
              .filter(([,u])=>[ROLES.LEAD,ROLES.DM].includes(u.role))
              .map(([uid,u])=>`<option value="${uid}" ${s.teamLeadUid===uid?'selected':''}>${u.name||u.email}</option>`).join('')}
        </select>` : (tl.name||tl.email||'-')}
        ${tl.role ? roleBadge(tl.role) : ''}
      </td>
      <td>${canDelete(currentRole)?`<button class="btn btn-danger" onclick="deleteStore('${id}')">Delete</button>`:''}</td>
    </tr>`;
  }).join('');

  /* ------------------ USERS ------------------ */
  const usersHtml = window.users?.renderUsersSection
    ? window.users.renderUsersSection(users, currentRole)
    : `<p class="text-center">Users module not loaded.</p>`;

  /* ------------------ REVIEWS ------------------ */
  const reviewEntries = Object.entries(reviews).sort((a,b)=>(b[1].timestamp||0)-(a[1].timestamp||0));
  const reviewCards = reviewEntries.map(([id,r])=>`
    <div class="review-card">
      <div class="review-header">
        <span class="review-star ${r.starred?'':'inactive'}" ${canEdit(currentRole)?`onclick="toggleStar('${id}',${!!r.starred})"`:''}>&#9733;</span>
        <div><b>Store:</b> ${r.store||'-'}</div>
        <div><b>Associate:</b> ${r.associate||'-'}</div>
        ${canDelete(currentRole)?`<button class="btn btn-danger btn-sm" onclick="deleteReview('${id}')">Delete</button>`:''}
      </div>
      <div class="review-rating">${'★'.repeat(r.rating||0)}</div>
      <div class="review-comment">${r.comment||''}</div>
      <div class="review-meta"><b>When:</b> ${r.timestamp?new Date(r.timestamp).toLocaleString():'-'}</div>
      <div class="review-meta"><b>Referral:</b> ${r.refName?`${r.refName} / ${r.refPhone}`:'-'}</div>
    </div>`).join('');

  /* ------------------ GUEST INFO ------------------ */
  const guestCards = Object.entries(guestinfo)
    .sort((a,b)=>(b[1].submittedAt||0)-(a[1].submittedAt||0))
    .map(([id,g])=>`
      <div class="guest-card">
        <div><b>Submitted by:</b> ${users[g.userUid]?.name||users[g.userUid]?.email||g.userUid}</div>
        <div><b>Customer:</b> ${g.custName||'-'} | <b>Phone:</b> ${g.custPhone||'-'}</div>
        <div><b>Type:</b> ${g.serviceType||'-'}</div>
        <div><b>Situation:</b> ${g.situation||'-'}</div>
        <div><b>When:</b> ${g.submittedAt?new Date(g.submittedAt).toLocaleString():'-'}</div>
      </div>`).join('');

  /* ------------------ DOM inject ------------------ */
  adminAppDiv.innerHTML = `
    <section class="admin-section stores-section">
      <h2>Stores</h2>
      <table class="store-table">
        <thead><tr><th>#</th><th>Team Lead</th><th>Actions</th></tr></thead>
        <tbody>${storeRows}</tbody>
      </table>
      ${canEdit(currentRole)?`
        <div class="store-add">
          <input id="newStoreNum" placeholder="New Store #">
          <button onclick="addStore()">Add Store</button>
        </div>`:''}
    </section>

    ${usersHtml}

    <section class="admin-section reviews-section">
      <h2>Reviews</h2>
      <div class="review-controls"><button onclick="renderAdminApp()">Reload</button></div>
      <div class="reviews-container">${reviewCards}</div>
    </section>

    <section class="admin-section guestinfo-section">
      <h2>Guest Info</h2>
      <div class="guestinfo-container">${guestCards}</div>
    </section>`;

  // cache for filters
  window._allReviews     = reviewEntries;
  window._allReviewsHtml = reviewCards;
  window._users          = users;
  window._stores         = stores;
}

/* ========================================================================
   Action handlers (RBAC enforced)
   ===================================================================== */
// Delegate user handlers to users.js
window.assignLeadToGuest = (guestUid, leadUid) => window.users.assignLeadToGuest(guestUid, leadUid);
window.assignDMToLead    = (leadUid, dmUid)    => window.users.assignDMToLead(leadUid, dmUid);

// Store actions
window.assignTL = async (storeId,uid)=>{
  assertEdit();
  const stores=(await db.ref("stores").get()).val()||{};
  for(const sId in stores) if(stores[sId].teamLeadUid===uid&&sId!==storeId)
    await db.ref(`stores/${sId}/teamLeadUid`).set("");
  await db.ref(`stores/${storeId}/teamLeadUid`).set(uid);
  if(uid){
    const num=(await db.ref(`stores/${storeId}/storeNumber`).get()).val();
    await db.ref(`users/${uid}`).update({store:num,role:ROLES.LEAD});
  }
  renderAdminApp();
};

window.updateStoreNumber = async(id,val)=>{assertEdit(); await db.ref(`stores/${id}/storeNumber`).set(val); renderAdminApp();};
window.addStore          = async()=>{
  assertEdit();
  const num=document.getElementById("newStoreNum").value.trim();
  if(!num)return alert("Enter store #");
  await db.ref("stores").push({storeNumber:num,teamLeadUid:""});
  renderAdminApp();
};

window.editStorePrompt = async storeId =>{
  assertEdit();
  const snap=await db.ref(`stores/${storeId}`).get();
  const old=snap.val()?.storeNumber||"";
  const nn=prompt("Edit store number:",old);
  if(nn&&nn!==old){ await db.ref(`stores/${storeId}/storeNumber`).set(nn); renderAdminApp(); }
};

window.editUserStore = async uid =>{
  if(window.users?.editUserStore) return window.users.editUserStore(uid);
  assertEdit();
  const num=prompt("Enter store number:");
  if(!num)return;
  const stores=(await db.ref("stores").get()).val()||{};
  let sid=null;
  for(const k in stores) if(stores[k].storeNumber==num) sid=k;
  if(sid){
    await db.ref(`stores/${sid}/teamLeadUid`).set(uid);
    await db.ref(`users/${uid}`).update({store:num,role:ROLES.LEAD});
  }else if(confirm("Store not found. Create it?")){
    await db.ref("stores").push({storeNumber:num,teamLeadUid:uid});
    await db.ref(`users/${uid}`).update({store:num,role:ROLES.LEAD});
  }
  renderAdminApp();
};

// Reviews actions
window.toggleStar     = async(id,starred)=>{assertEdit(); await db.ref(`reviews/${id}/starred`).set(!starred); renderAdminApp();};
window.deleteStore    = async id => {assertDelete(); if(confirm("Delete this store?"))  {await db.ref(`stores/${id}`).remove(); renderAdminApp();}};
window.deleteReview   = async id => {assertDelete(); if(confirm("Delete this review?")) {await db.ref(`reviews/${id}`).remove(); renderAdminApp();}};

/* ========================================================================
   Review filter helpers (read-only)
   ===================================================================== */
window.filterReviewsByStore     = store  => document.querySelector(".reviews-container").innerHTML = reviewsToHtml(_allReviews.filter(([,r])=>r.store===store));
window.filterReviewsByAssociate = name   => document.querySelector(".reviews-container").innerHTML = reviewsToHtml(_allReviews.filter(([,r])=>r.associate===name));
window.clearReviewFilter        = ()     => document.querySelector(".reviews-container").innerHTML = _allReviewsHtml;
window.reviewsToHtml            = entries=> entries.length ? entries.map(([id,r])=>`
  <div class="review-card">
    <div class="review-header">
      <span class="review-star ${r.starred?'':'inactive'}" ${canEdit(currentRole)?`onclick="toggleStar('${id}',${!!r.starred})"`:''}>&#9733;</span>
      <div><b>Store:</b> ${r.store||'-'}</div>
      <div><b>Associate:</b> ${r.associate||'-'}</div>
      ${canDelete(currentRole)?`<button class="btn btn-danger btn-sm" onclick="deleteReview('${id}')">Delete</button>`:''}
    </div>
    <div class="review-rating">${'★'.repeat(r.rating||0)}</div>
    <div class="review-comment">${r.comment||''}</div>
    <div class="review-meta"><b>When:</b> ${r.timestamp?new Date(r.timestamp).toLocaleString():'-'}</div>
    <div class="review-meta"><b>Referral:</b> ${r.refName?`${r.refName} / ${r.refPhone}`:'-'}</div>
  </div>`).join('') : `<p class="text-center">No reviews.</p>`;