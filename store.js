const db = firebase.database();

// Fetch all stores
export async function fetchStores() {
  try {
    const storesSnap = await db.ref('stores').get();
    return storesSnap.val() || {};
  } catch (error) {
    console.error("Error fetching stores:", error);
    throw error;
  }
}

// Assign team lead to store and update user accordingly
export async function assignTL(storeId, uid) {
  try {
    const storesSnap = await db.ref('stores').get();
    const stores = storesSnap.val() || {};
    for (const sId in stores) {
      if (stores[sId].teamLeadUid === uid && sId !== storeId) {
        await db.ref(`stores/${sId}/teamLeadUid`).set('');
      }
    }
    await db.ref(`stores/${storeId}/teamLeadUid`).set(uid);
    if (uid) {
      const storeNumSnap = await db.ref(`stores/${storeId}/storeNumber`).get();
      const storeNum = storeNumSnap.val();
      await db.ref(`users/${uid}/store`).set(storeNum);
      await db.ref(`users/${uid}/role`).set('lead');
    }
  } catch (error) {
    console.error(`Error assigning TL ${uid} to store ${storeId}:`, error);
    throw error;
  }
}

// Update store number
export async function updateStoreNumber(storeId, val) {
  try {
    await db.ref(`stores/${storeId}/storeNumber`).set(val);
  } catch (error) {
    console.error(`Error updating store number for store ${storeId}:`, error);
    throw error;
  }
}

// Delete store
export async function deleteStore(storeId) {
  try {
    await db.ref(`stores/${storeId}`).remove();
  } catch (error) {
    console.error(`Error deleting store ${storeId}:`, error);
    throw error;
  }
}

// Add new store
export async function addStore(storeNum) {
  try {
    if (!storeNum) throw new Error("Store number required");
    await db.ref('stores').push({ storeNumber: storeNum, teamLeadUid: "" });
  } catch (error) {
    console.error("Error adding store:", error);
    throw error;
  }
}

// Edit user's assigned store and update role
export async function editUserStore(uid, storeNum) {
  try {
    if (!storeNum) return;
    const storesSnap = await db.ref('stores').get();
    const stores = storesSnap.val() || {};
    let matchedStoreId = null;
    for (const sId in stores) {
      if (stores[sId].storeNumber == storeNum) matchedStoreId = sId;
    }
    if (matchedStoreId) {
      await db.ref(`stores/${matchedStoreId}/teamLeadUid`).set(uid);
      await db.ref(`users/${uid}/store`).set(storeNum);
      await db.ref(`users/${uid}/role`).set('lead');
    } else {
      const confirmCreate = confirm("Store not found. Create it?");
      if (confirmCreate) {
        await db.ref('stores').push({ storeNumber: storeNum, teamLeadUid: uid });
        await db.ref(`users/${uid}/store`).set(storeNum);
        await db.ref(`users/${uid}/role`).set('lead');
      }
    }
  } catch (error) {
    console.error(`Error editing store assignment for user ${uid}:`, error);
    throw error;
  }
}