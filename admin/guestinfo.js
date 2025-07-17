/* ========================================================================
   Guest Info Logic
   ===================================================================== */
async function renderGuestInfoSection(guestinfo, users) {
  const guestCards = Object.entries(guestinfo)
    .sort((a, b) => (b[1].submittedAt || 0) - (a[1].submittedAt || 0))
    .map(([id, g]) => `
      <div class="guest-card">
        <div><b>Submitted by:</b> ${users[g.userUid]?.name || users[g.userUid]?.email || g.userUid}</div>
        <div><b>Customer:</b> ${g.custName || '-'} | <b>Phone:</b> ${g.custPhone || '-'}</div>
        <div><b>Type:</b> ${g.serviceType || '-'}</div>
        <div><b>Situation:</b> ${g.situation || '-'}</div>
        <div><b>When:</b> ${g.submittedAt ? new Date(g.submittedAt).toLocaleString() : '-'}</div>
      </div>
    `).join('');

  return `
    <section class="admin-section guestinfo-section">
      <h2>Guest Info</h2>
      <div class="guestinfo-container">${guestCards}</div>
    </section>`;
}