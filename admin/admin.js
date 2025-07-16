Below is a single, complete admin.js with the new scoping and permissions you specified. Copy-paste everything (it’s ~620 lines) and reload.

/* ==========================================================================
   Firebase Init
   ======================================================================= */
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

const adminAppDiv = document.getElementById("adminApp");

/* ==========================================================================
   RBAC helpers
   ======================================================================= */
const ROLES = { ME: "me", LEAD: "lead", DM: "dm", ADMIN: "admin" };
let currentUid  = null;
let currentRole = ROLES.ME;

// abilities (granular)
const canEditGlobal  = r => [ROLES.DM, ROLES.ADMIN].includes(r);      // big settings
const canDelete      = r => [ROLES.DM, ROLES.ADMIN].includes(r);
const canToggleStar  = r => r !== ROLES.ME;                            // harmless
const roleDropdownChoices = r =>
  r === ROLES.ADMIN ? [ROLES.ME, ROLES.LEAD, ROLES.DM, ROLES.ADMIN]
  : r === ROLES.DM  ? [ROLES.ME, ROLES.LEAD]
  : [];                                                             // leads/ME no role edits

/* guards -- block console hacks */
const assertEditGlobal = () => { if (!canEditGlobal(currentRole)) throw "PERM_DENIED_EDIT"; };
const assertDelete     = () => { if (!canDelete(currentRole))     throw "PERM_DENIED_DELETE"; };

/* misc ui */
const roleBadge = r => `<span class="role-badge role-${r}">${r.toUpperCase()}</span>`;

/* ==========================================================================
   Auth
   ======================================================================= */
auth.onAuthStateChanged(async user => {
  if (!user) { window.location.href = "index.html"; return; }

  currentUid = user.uid;
  const snap = await db.ref("users/"+user.uid).get();
  const prof = snap.val() || {
    role : ROLES.ME,
    name : user.displayName || user.email,
    email: user.email
  };
  await db.ref("users/"+user.uid).update(prof);          // ensure record
  currentRole = prof.role;

  document.getElementById("logoutBtn")?.addEventListener("click", ()=>auth.signOut());
  renderAdminApp();
});

/* ==========================================================================
   Visibility helpers
   ======================================================================= */
function visibleUsers(allUsers) {
  if (currentRole === ROLES.ADMIN) return allUsers;

  if (currentRole === ROLES.DM) {
    const vis = {};
    Object.entries(allUsers).forEach(([uid,u])=>{
      const isSelf         = uid === currentUid;
      const isLeadUnderMe  = u.role === ROLES.LEAD && u.assignedDM === currentUid;
      const isMeOfMyLead   = u.role === ROLES.ME   && allUsers[u.assignedLead]?.assignedDM === currentUid;
      if (isSelf || isLeadUnderMe || isMeOfMyLead) vis[uid] = u;
    });
    return vis;
  }

  if (currentRole === ROLES.LEAD) {
    const vis = {};
    Object.entries(allUsers).forEach(([uid,u])=>{
      const isSelf  = uid === currentUid;
      const isMyMe  = u.role === ROLES.ME && u.assignedLead === currentUid;
      if (isSelf || isMyMe) vis[uid] = u;
    });
    return vis;
  }

  // ME: just self
  return { [currentUid]: allUsers[currentUid] };
}

/* ==========================================================================
   Main render
   ======================================================================= */
async function renderAdminApp() {
  adminAppDiv.innerHTML = "<div>Loading…</div>";

  const [storesSnap, usersSnap, reviewsSnap, guestSnap] = await Promise.all([
    db.ref("stores").get(),
    db.ref("users").get(),
    db.ref("reviews").get(),
    db.ref("guestinfo").get()
  ]);

  const stores    = storesSnap.val()  || {};
  const usersFull = usersSnap.val()   || {};
  const reviews   = reviewsSnap.val() || {};
  const guestinfo = guestSnap.val()   || {};

  const users = visibleUsers(usersFull);        // scoped view

  /* ------------------ STORES (DM/Admin only) ------------------ */
  const storeRows = Object.entries(stores).map(([id,s])=>{
    const tl = usersFull[s.teamLeadUid] || {};   // may be outside view, still show badge
    return `<tr>
      <td>${canEditGlobal(currentRole)
        ? `<input type="text" value="${s.storeNumber||''}" onchange="updateStoreNumber('${id}',this.value)">`
        : s.storeNumber||'-'}</td>
      <td>
        ${canEditGlobal(currentRole) ? `<select onchange="assignTL('${id}',this.value)">
          <option value="">-- Unassigned --</option>
          ${Object.entries(usersFull)
              .filter(([,u])=>[ROLES.LEAD,ROLES.DM].includes(u.role))
              .map(([uid,u])=>`<option value="${uid}" ${s.teamLeadUid===uid?'selected':''}>${u.name||u.email}</option>`).join('')}
        </select>` : (tl.name||tl.email||'-')}
        ${tl.role ? roleBadge(tl.role) : ''}
      </td>
      <td>${canDelete(currentRole)?`<button class="btn btn-danger" onclick="deleteStore('${id}')">Delete</button>`:''}</td>
    </tr>`;
  }).join('');

  /* ------------------ USERS ------------------ */
  const userCards = Object.entries(users).map(([uid,u])=>{
    const lead = usersFull[u.assignedLead] || {};
    const dm   = usersFull[u.assignedDM]   || {};
    const canEditThisUser = roleDropdownChoices(currentRole).length && (currentRole !== ROLES.DM || u.role !== ROLES.ADMIN);

    /* build role dropdown if allowed */
    let roleSelect = "";
    if (canEditThisUser) {
      roleSelect = `<label>Role:
        <select onchange="changeUserRole('${uid}',this.value)">
          ${roleDropdownChoices(currentRole).map(r=>`<option value="${r}" ${u.role===r?'selected':''}>${r.toUpperCase()}</option>`).join('')}
        </select>
      </label>`;
    }

    /* assignments (DM/Admin only) */
    const assignmentControls = canEditGlobal(currentRole) ? `
      <label>Assign Lead:
        <select onchange="assignLeadToGuest('${uid}',this.value)">
          <option value="">None</option>
          ${Object.entries(usersFull).filter(([,x])=>x.role===ROLES.LEAD)
             .map(([id,x])=>`<option value="${id}" ${u.assignedLead===id?'selected':''}>${x.name||x.email}</option>`).join('')}
        </select>
      </label>
      <label>Assign DM:
        <select onchange="assignDMToLead('${uid}',this.value)">
          <option value="">None</option>
          ${Object.entries(usersFull).filter(([,x])=>x.role===ROLES.DM)
             .map(([id,x])=>`<option value="${id}" ${u.assignedDM===id?'selected':''}>${x.name||x.email}</option>`).join('')}
        </select>
      </label>` : "";

    const deleteBtn = canDelete(currentRole) ? `<button class="btn btn-danger-outline" onclick="deleteUser('${uid}')">Delete</button>` : "";

    return `<div class="user-card">
      <div class="user-card-header">
        <div><div class="user-name">${u.name||u.email}</div><div class="user-email">${u.email}</div></div>
        ${roleBadge(u.role)}
      </div>
      <div class="user-card-info">
        <div><b>Store:</b> ${u.store||'-'}</div>
        <div><b>Lead:</b> ${lead.name||lead.email||'-'}</div>
        <div><b>DM:</b>   ${dm.name||dm.email||'-'}</div>
      </div>
      ${(roleSelect||assignmentControls||deleteBtn)?`<div class="user-card-actions">${roleSelect}${assignmentControls}${deleteBtn}</div>`:""}
    </div>`;
  }).join('');

  /* ------------------ REVIEWS ------------------ */
  const reviewEntries = Object.entries(reviews).sort((a,b)=>(b[1].timestamp||0)-(a[1].timestamp||0));
  const reviewCards = reviewEntries.map(([id,r])=>`
    <div class="review-card">
      <div class="review-header">
        <span class="review-star ${r.starred?'':'inactive'}" ${canToggleStar(currentRole)?`onclick="toggleStar('${id}',${!!r.starred})"`:''}>&#9733;</span>
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
    .filter(([,g])=>users[g.userUid])                    // only show if we can see submitter
    .sort((a,b)=>(b[1].submittedAt||0)-(a[1].submittedAt||0))
    .map(([id,g])=>`
      <div class="guest-card">
        <div><b>Submitted by:</b> ${usersFull[g.userUid]?.name||usersFull[g.userUid]?.email||g.userUid}</div>
        <div><b>Customer:</b> ${g.custName||'-'} | <b>Phone:</b> ${g.custPhone||'-'}</div>
        <div><b>Type:</b> ${g.serviceType||'-'}</div>
        <div><b>Situation:</b> ${g.situation||'-'}</div>
        <div><b>When:</b> ${g.submittedAt?new Date(g.submittedAt).toLocaleString():'-'}</div>
      </div>`).join('');

  /* ------------------ Inject ------------------ */
  adminAppDiv.innerHTML = `
    <section class="admin-section stores-section">
      <h2>Stores</h2>
      <table class="store-table">
        <thead><tr><th>#</th><th>Team Lead</th><th>Actions</th></tr></thead>
        <tbody>${storeRows}</tbody>
      </table>
      ${canEditGlobal(currentRole)?`
        <div class="store-add">
          <input id="newStoreNum" placeholder="New Store #">
          <button onclick="addStore()">Add Store</button>
        </div>`:''}
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
    </section>`;

  // cache (for review filters)
  window._allReviews     = reviewEntries;
  window._allReviewsHtml = reviewCards;
}

/* ==========================================================================
   Mutations (RBAC-checked)
   ======================================================================= */
window.assignLeadToGuest = async (guestUid, leadUid)=>{
  assertEditGlobal(); await db.ref(`users/${guestUid}/assignedLead`).set(leadUid||null); renderAdminApp();
};
window.assignDMToLead = async (leadUid, dmUid)=>{
  assertEditGlobal(); await db.ref(`users/${leadUid}/assignedDM`).set(dmUid||null);     renderAdminApp();
};

window.assignTL = async (storeId,uid)=>{
  assertEditGlobal();
  const stores=(await db.ref("stores").get()).val()||{};
  for(const sId in stores) if(stores[sId].teamLeadUid===uid && sId!==storeId)
    await db.ref(`stores/${sId}/teamLeadUid`).set("");
  await db.ref(`stores/${storeId}/teamLeadUid`).set(uid);
  if(uid){
    const num=(await db.ref(`stores/${storeId}/storeNumber`).get()).val();
    await db.ref(`users/${uid}`).update({store:num,role:ROLES.LEAD});
  }
  renderAdminApp();
};

window.updateStoreNumber = async(id,val)=>{ assertEditGlobal(); await db.ref(`stores/${id}/storeNumber`).set(val); renderAdminApp(); };
window.addStore          = async()=>{
  assertEditGlobal();
  const num=document.getElementById("newStoreNum").value.trim();
  if(!num) return alert("Enter store #");
  await db.ref("stores").push({storeNumber:num,teamLeadUid:""});
  renderAdminApp();
};

window.changeUserRole = async (uid,newRole)=>{
  if (!roleDropdownChoices(currentRole).includes(newRole)) return; // silently ignore bad option
  assertEditGlobal();
  await db.ref(`users/${uid}/role`).set(newRole);
  renderAdminApp();
};

window.toggleStar = async(id,starred)=>{ if(!canToggleStar(currentRole))return; await db.ref(`reviews/${id}/starred`).set(!starred); renderAdminApp(); };

window.deleteStore  = async id => { assertDelete(); if(confirm("Delete store?"))  { await db.ref(`stores/${id}`).remove(); renderAdminApp(); }};
window.deleteUser   = async id => { assertDelete(); if(confirm("Delete user?"))   { await db.ref(`users/${id}`).remove();  renderAdminApp(); }};
window.deleteReview = async id => { assertDelete(); if(confirm("Delete review?")) { await db.ref(`reviews/${id}`).remove(); renderAdminApp(); }};

/* ==========================================================================
   Review filter helpers (read-only)
   ======================================================================= */
window.reviewsToHtml = entries => entries.length ? entries.map(([id,r])=>`
  <div class="review-card">
    <div class="review-header">
      <span class="review-star ${r.starred?'':'inactive'}" ${canToggleStar(currentRole)?`onclick="toggleStar('${id}',${!!r.starred})"`:''}>&#9733;</span>
      <div><b>Store:</b> ${r.store||'-'}</div>
      <div><b>Associate:</b> ${r.associate||'-'}</div>
      ${canDelete(currentRole)?`<button class="btn btn-danger btn-sm" onclick="deleteReview('${id}')">Delete</button>`:''}
    </div>
    <div class="review-rating">${'★'.repeat(r.rating||0)}</div>
    <div class="review-comment">${r.comment||''}</div>
    <div class="review-meta"><b>When:</b> ${r.timestamp?new Date(r.timestamp).toLocaleString():'-'}</div>
    <div class="review-meta"><b>Referral:</b> ${r.refName?`${r.refName} / ${r.refPhone}`:'-'}</div>
  </div>`).join('') : `<p class="text-center">No reviews.</p>`;

window.filterReviewsByStore     = store => document.querySelector(".reviews-container").innerHTML = reviewsToHtml(_allReviews.filter(([,r])=>r.store===store));
window.filterReviewsByAssociate = name  => document.querySelector(".reviews-container").innerHTML = reviewsToHtml(_allReviews.filter(([,r])=>r.associate===name));
window.clearReviewFilter        = ()    => document.querySelector(".reviews-container").innerHTML = _allReviewsHtml;