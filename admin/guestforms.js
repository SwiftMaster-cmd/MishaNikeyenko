// guestforms.js

window.renderGuestFormsSection = (guestinfo, users) => {
  const entries = Object.entries(guestinfo).sort((a, b) => (b[1].submittedAt || 0) - (a[1].submittedAt || 0));

  const links = entries.map(([id, g]) => `
    <div class="guestform-card" onclick="window.location.href='employee/guest-portal.html?formId=${id}'">
      <div><b>Customer:</b> ${g.custName || '-'} | <b>Phone:</b> ${g.custPhone || '-'}</div>
      <div><b>Submitted by:</b> ${users[g.userUid]?.name || users[g.userUid]?.email || g.userUid}</div>
      <div><b>Type:</b> ${g.serviceType || '-'}</div>
      <div><b>Submitted At:</b> ${g.submittedAt ? new Date(g.submittedAt).toLocaleString() : '-'}</div>
    </div>
  `).join('');

  return `
    <section class="admin-section guestforms-section">
      <h2>Guest Forms</h2>
      <div class="guestforms-container">
        ${links}
      </div>
    </section>`;
};