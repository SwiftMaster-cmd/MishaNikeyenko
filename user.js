

window.changeUserRole = async function(uid, role) {
  await db.ref('users/' + uid + '/role').set(role);
  window.renderAdminApp();
};

window.deleteUser = async function(uid) {
  if (!confirm("Delete this user?")) return;
  await db.ref('users/' + uid).remove();
  window.renderAdminApp();
};

window.assignLeadToGuest = async function(guestUid, leadUid) {
  await db.ref('users/' + guestUid + '/assignedLead').set(leadUid || null);
  window.renderAdminApp();
};

window.assignDMToLead = async function(leadUid, dmUid) {
  await db.ref('users/' + leadUid + '/assignedDM').set(dmUid || null);
  window.renderAdminApp();
};

window.editUserStore = async function(uid) {
  const storeNum = prompt("Enter store number for this user:");
  if (!storeNum) return;
  const storesSnap = await db.ref('stores').once('value');
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
  window.renderAdminApp();
};