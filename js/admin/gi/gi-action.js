// guestinfo-actions.js

import { normGuest, computeGuestPitchQuality } from './gi-render.js';

// Toggle visibility of the action buttons container
export function toggleActionButtons(id) {
  const card = document.getElementById(`guest-card-${id}`);
  if (!card) return;
  const actions = card.querySelector('.guest-card-actions');
  if (!actions) return;
  actions.style.display = actions.style.display === 'flex' ? 'none' : 'flex';
}

// Show or hide the quick‐edit form
export function toggleEdit(id) {
  const card = document.getElementById(`guest-card-${id}`);
  if (!card) return;
  const display = card.querySelector('.guest-display');
  const form    = card.querySelector('.guest-edit-form');
  if (!display || !form) return;
  const showForm = form.style.display === 'none';
  form.style.display    = showForm ? 'block' : 'none';
  display.style.display = showForm ? 'none' : 'block';
}

export function cancelEdit(id) {
  const card = document.getElementById(`guest-card-${id}`);
  if (!card) return;
  card.querySelector('.guest-edit-form').style.display = 'none';
  card.querySelector('.guest-display').style.display    = 'block';
}

export async function saveEdit(id) {
  const form = document.getElementById(`guest-edit-form-${id}`);
  if (!form) return alert('Edit form not found.');
  const data = {
    custName:    form.custName.value.trim(),
    custPhone:   form.custPhone.value.trim(),
    serviceType: form.serviceType.value.trim(),
    situation:   form.situation.value.trim(),
    updatedAt:   Date.now()
  };
  try {
    await window.db.ref(`guestinfo/${id}`).update(data);
    await recomputePitch(id);
    cancelEdit(id);
    await window.renderAdminApp();
  } catch (e) {
    alert('Error saving changes: ' + e.message);
  }
}

export async function deleteGuestInfo(id) {
  if (!confirm('Delete this guest lead? This cannot be undone.')) return;
  try {
    await window.db.ref(`guestinfo/${id}`).remove();
    await window.renderAdminApp();
  } catch (e) {
    alert('Error deleting: ' + e.message);
  }
}

export async function markSold(id) {
  try {
    const snap = await window.db.ref(`guestinfo/${id}`).get();
    const g    = snap.val();
    if (!g) return alert('Guest record not found.');

    let units = parseInt(prompt('How many units were sold?', '1'), 10);
    if (isNaN(units) || units < 0) units = 0;

    const users     = window._users || {};
    const submitter = users[g.userUid] || {};
    let storeNumber = submitter.store || prompt('Enter store number for credit:', '') || '';
    storeNumber = storeNumber.toString().trim();

    const now = Date.now();
    const saleRef = await window.db.ref('sales').push({
      guestinfoKey: id,
      storeNumber,
      repUid: window.currentUid || null,
      units,
      createdAt: now
    });
    const saleId = saleRef.key;

    await window.db.ref(`guestinfo/${id}`).update({
      sale:   { saleId, soldAt: now, storeNumber, units },
      status: 'sold'
    });

    if (storeNumber) {
      try {
        await window.db.ref(`storeCredits/${storeNumber}`).push({
          saleId,
          guestinfoKey: id,
          creditedAt: now,
          units
        });
      } catch {}
    }

    await recomputePitch(id);
    await window.renderAdminApp();
  } catch (err) {
    alert('Error marking sold: ' + err.message);
  }
}

export async function deleteSale(id) {
  try {
    const snap = await window.db.ref(`guestinfo/${id}`).get();
    const g    = snap.val();
    if (!g?.sale?.saleId) return alert('No sale recorded.');
    if (!confirm('Delete this sale? This will remove store credit.')) return;

    const { saleId, storeNumber } = g.sale;
    const hasEval = !!g.evaluate;

    await window.db.ref(`sales/${saleId}`).remove();
    await window.db.ref(`guestinfo/${id}`).update({
      sale:   null,
      status: hasEval ? 'working' : 'new'
    });

    if (storeNumber) {
      const creditsSnap = await window.db.ref(`storeCredits/${storeNumber}`).get();
      const creditsObj  = creditsSnap.val() || {};
      await Promise.all(
        Object.entries(creditsObj)
          .filter(([, c]) => c.saleId === saleId)
          .map(([cid]) => window.db.ref(`storeCredits/${storeNumber}/${cid}`).remove())
      );
    }

    await recomputePitch(id);
    await window.renderAdminApp();
  } catch (err) {
    alert('Error deleting sale: ' + err.message);
  }
}

export async function recomputePitch(id) {
  try {
    const snap = await window.db.ref(`guestinfo/${id}`).get();
    const data = snap.val() || {};
    const comp = computeGuestPitchQuality(normGuest(data));
    await window.db.ref(`guestinfo/${id}/completion`).set({
      pct:       Math.round(comp.pct),
      steps:     comp.steps,
      fields:    comp.fields,
      updatedAt: Date.now()
    });
  } catch {}
}

export function openGuestInfoPage(guestKey) {
  const base   = window.GUESTINFO_PAGE || '../html/guestinfo.html';
  const g      = (window._guestinfo || {})[guestKey] || {};
  let uistart  = 'step1';
  const status = (g.status || '').toLowerCase();
  if (['proposal','sold'].includes(status)) uistart = 'step3';
  else if (status === 'working')            uistart = 'step2';
  else                                      uistart = g.prefilledStep1 ? 'step2' : 'step1';

  const sep = base.includes('?') ? '&' : '?';
  try { localStorage.setItem('last_guestinfo_key', guestKey); } catch {}
  window.location.href = `${base}${sep}gid=${encodeURIComponent(guestKey)}&uistart=${uistart}`;
} 