/* ==========================================================================
   Action Handlers (RBAC-enforced)
   ========================================================================== */

// ----- ASSIGNMENTS -----
window.assignLeadToGuest = async (guestUid, leadUid) => {
  assertEdit();
  await db.ref(`users/${guestUid}/assignedLead`).set(leadUid || null);
  renderAdminApp();
};

window.assignDMToLead = async (leadUid, dmUid) => {
  assertEdit();
  await db.ref(`users/${leadUid}/assignedDM`).set(dmUid || null);
  renderAdminApp();
};

window.assignTL = async (storeId, uid) => {
  assertEdit();
  const stores = (await db.ref("stores").get()).val() || {};
  for (const sId in stores) {
    if (stores[sId].teamLeadUid === uid && sId !== storeId) {
      await db.ref(`stores/${sId}/teamLeadUid`).set("");
    }
  }
  await db.ref(`stores/${storeId}/teamLeadUid`).set(uid);
  if (uid) {
    const num = (await db.ref(`stores/${storeId}/storeNumber`).get()).val();
    await db.ref(`users/${uid}`).update({ store: num, role: ROLES.LEAD });
  }
  renderAdminApp();
};

// ----- STORE MANAGEMENT -----
window.updateStoreNumber = async (id, val) => {
  assertEdit();
  await db.ref(`stores/${id}/storeNumber`).set(val);
  renderAdminApp();
};

window.addStore = async () => {
  assertEdit();
  const num = document.getElementById("newStoreNum").value.trim();
  if (!num) return alert("Enter store #");
  await db.ref("stores").push({ storeNumber: num, teamLeadUid: "" });
  renderAdminApp();
};

window.editStorePrompt = async storeId => {
  assertEdit();
  const snap = await db.ref(`stores/${storeId}`).get();
  const old = snap.val()?.storeNumber || "";
  const nn = prompt("Edit store number:", old);
  if (nn && nn !== old) {
    await db.ref(`stores/${storeId}/storeNumber`).set(nn);
    renderAdminApp();
  }
};

// ----- USER MGMT -----
window.editUserStore = async uid => {
  assertEdit();
  const num = prompt("Enter store number:");
  if (!num) return;
  const stores = (await db.ref("stores").get()).val() || {};
  let sid = null;
  for (const k in stores) {
    if (stores[k].storeNumber == num) sid = k;
  }
  if (sid) {
    await db.ref(`stores/${sid}/teamLeadUid`).set(uid);
    await db.ref(`users/${uid}`).update({ store: num, role: ROLES.LEAD });
  } else if (confirm("Store not found. Create it?")) {
    await db.ref("stores").push({ storeNumber: num, teamLeadUid: uid });
    await db.ref(`users/${uid}`).update({ store: num, role: ROLES.LEAD });
  }
  renderAdminApp();
};

window.changeUserRole = async (uid, role) => {
  assertEdit();
  await db.ref(`users/${uid}/role`).set(role);
  renderAdminApp();
};

// ----- REVIEWS -----
window.toggleStar = async (id, starred) => {
  assertEdit();
  await db.ref(`reviews/${id}/starred`).set(!starred);
  renderAdminApp();
};

// ----- DELETE -----
window.deleteStore = async id => {
  assertDelete();
  if (confirm("Delete this store?")) {
    await db.ref(`stores/${id}`).remove();
    renderAdminApp();
  }
};

window.deleteUser = async id => {
  assertDelete();
  if (confirm("Delete this user?")) {
    await db.ref(`users/${id}`).remove();
    renderAdminApp();
  }
};

window.deleteReview = async id => {
  assertDelete();
  if (confirm("Delete this review?")) {
    await db.ref(`reviews/${id}`).remove();
    renderAdminApp();
  }
};