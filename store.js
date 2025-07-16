// store.js


window.addStore = async function() {
  const num = document.getElementById('newStoreNum').value.trim();
  if (!num) return alert("Enter store #");
  await db.ref('stores').push({ storeNumber: num, teamLeadUid: "" });
  window.renderAdminApp();
};

window.updateStoreNumber = async function(storeId, val) {
  await db.ref('stores/' + storeId + '/storeNumber').set(val);
  window.renderAdminApp();
};

window.editStorePrompt = async function(storeId) {
  const storeSnap = await db.ref('stores/' + storeId).once('value');
  const oldNum = storeSnap.val()?.storeNumber || '';
  const newNum = prompt("Edit store number:", oldNum);
  if (newNum && newNum !== oldNum) {
    await db.ref('stores/' + storeId + '/storeNumber').set(newNum);
    window.renderAdminApp();
  }
};

window.deleteStore = async function(storeId) {
  if (!confirm("Delete this store?")) return;
  await db.ref('stores/' + storeId).remove();
  window.renderAdminApp();
};

window.assignTL = async function(storeId, uid) {
  const storesSnap = await db.ref('stores').once('value');
  const stores = storesSnap.val() || {};
  for (const sId in stores) {
    if (stores[sId].teamLeadUid === uid && sId !== storeId) {
      await db.ref('stores/' + sId + '/teamLeadUid').set('');
    }
  }
  await db.ref('stores/' + storeId + '/teamLeadUid').set(uid);
  if (uid) {
    const storeNumSnap = await db.ref('stores/' + storeId + '/storeNumber').once('value');
    await db.ref('users/' + uid + '/store').set(storeNumSnap.val());
    await db.ref('users/' + uid + '/role').set('lead');
  }
  window.renderAdminApp();
};