import { normGuest, computeGuestPitchQuality } from './gi-render.js';

// Show or hide the quick-edit form (for 'edit' mode)
export function toggleEdit(id) {
  const card = document.getElementById(`guest-card-${id}`);
  if (!card) return;
  const form = card.querySelector('.guest-edit-form');
  if (!form) return;
  // Only show the form, everything else is replaced
  form.style.display = 'block';
}

// Close edit form
export function cancelEdit(id) {
  const card = document.getElementById(`guest-card-${id}`);
  if (!card) return;
  const form = card.querySelector('.guest-edit-form');
  if (!form) return;
  form.style.display = 'none';
}

// Save quick edit
export async function saveEdit(id) {
  const form = document.getElementById(`guest-edit-form-${id}`);
  if (!form) return;
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
    // Silent fail for now (optional: alert user)
  }
}

// Immediate delete (no confirm)
export async function deleteGuestInfo(id) {
  try {
    await window.db.ref(`guestinfo/${id}`).remove();
    await window.renderAdminApp();
  } catch (e) {}
}

// Mark as sold (still needs minimal prompt for units/store unless you want defaults)
export async function markSold(id) {
  try {
    const snap = await window.db.ref(`guestinfo/${id}`).get();
    const g    = snap.val();
    if (!g) return;

    let units = 1; // Default to 1
    // If you want zero prompt: comment/remove below
    // let units = parseInt(prompt('How many units were sold?', '1'), 10);
    // if (isNaN(units) || units < 0) units = 0;

    const users     = window._users || {};
    const submitter = users[g.userUid] || {};
    let storeNumber = submitter.store || '';
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
  } catch (err) {}
}

// Delete sale (can keep a minimal confirm or skip it)
export async function deleteSale(id) {
  try {
    const snap = await window.db.ref(`guestinfo/${id}`).get();
    const g    = snap.val();
    if (!g?.sale?.saleId) return;

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
  } catch (err) {}
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