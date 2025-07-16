// store.js
import { db } from './firebaseConfig.js';

export async function getAllStores() {
  const snapshot = await db.ref('stores').get();
  return snapshot.val() || {};
}

export async function assignTL(storeId, uid) {
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
}

export async function addStore(storeNumber) {
  await db.ref('stores').push({ storeNumber, teamLeadUid: "" });
}

export async function updateStoreNumber(storeId, val) {
  await db.ref('stores/' + storeId + '/storeNumber').set(val);
}

export async function deleteStore(storeId) {
  await db.ref('stores/' + storeId).remove();
}

export async function editStorePrompt(storeId) {
  const store = await db.ref('stores/' + storeId).get();
  const oldNum = store.val()?.storeNumber || '';
  const newNum = prompt("Edit store number:", oldNum);
  if (newNum && newNum !== oldNum) {
    await updateStoreNumber(storeId, newNum);
  }
}

export function renderStores(stores, users) {
  let storesHtml = `<table class="store-table"><tr>
    <th>Store #</th><th>Assigned TL</th><th>Edit</th><th>Delete</th></tr>`;

  if (!Object.keys(stores).length) {
    storesHtml += `<tr><td colspan="4"><em>No stores added yet.</em></td></tr>`;
  }

  for (const storeId in stores) {
    const store = stores[storeId];
    const tl = store.teamLeadUid && users[store.teamLeadUid]
      ? (users[store.teamLeadUid].name || users[store.teamLeadUid].email)
      : '';
    storesHtml += `<tr>
      <td><input value="${store.storeNumber}" onchange="window.updateStoreNumber('${storeId}', this.value)" style="width:110px"></td>
      <td>
        <select onchange="window.assignTL('${storeId}', this.value)">
          <option value="">-- Unassigned --</option>
          ${Object.entries(users).filter(([uid, u]) => u.role === 'lead' || u.role === 'dm').map(([uid, u]) =>
            `<option value="${uid}" ${store.teamLeadUid === uid ? 'selected' : ''}>${u.name || u.email}</option>`
          ).join('')}
        </select>
        ${tl ? `<span class="role-badge role-lead">${tl}</span>` : `<span class="role-badge role-guest">No TL</span>`}
      </td>
      <td><button onclick="window.editStorePrompt('${storeId}')">Edit</button></td>
      <td><button onclick="window.deleteStore('${storeId}')">Delete</button></td>
    </tr>`;
  }
  storesHtml += `</table>`;
  storesHtml += `
    <input id="newStoreNum" placeholder="New Store #" style="width:120px;">
    <button onclick="window.addStore(document.getElementById('newStoreNum').value.trim())">Add Store</button>
  `;
  return storesHtml;
}