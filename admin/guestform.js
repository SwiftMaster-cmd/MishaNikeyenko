(() => {
  const ROLES = { ME: "me", LEAD: "lead", DM: "dm", ADMIN: "admin" };

  function canDelete(role) {
    return role === ROLES.ADMIN || role === ROLES.DM;
  }

  // Render submissions list
  function renderGuestFormsSection(entriesObj, currentRole) {
    const entries = Object.entries(entriesObj || {}).sort(
      (a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0)
    );

    if (!entries.length) {
      return `
        <section class="admin-section guest-forms-section">
          <h2>Guest Form Submissions</h2>
          <p class="text-center">No guest submissions yet.</p>
        </section>
      `;
    }

    const rows = entries.map(([id, g]) => {
      const when = g.timestamp ? new Date(g.timestamp).toLocaleString() : "-";
      return `
        <tr>
          <td>${g.guestName || "-"}</td>
          <td>${g.guestPhone || "-"}</td>
          <td>${when}</td>
          <td style="text-align:center;">
            ${canDelete(currentRole)
              ? `<button class="btn btn-danger btn-sm" onclick="window.guestforms.deleteGuestFormEntry('${id}')">Delete</button>`
              : ""}
          </td>
        </tr>
      `;
    }).join("");

    return `
      <section class="admin-section guest-forms-section">
        <h2>Guest Form Submissions</h2>
        <table class="guest-forms-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Submitted</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </section>
    `;
  }

  async function deleteGuestFormEntry(id) {
    if (!canDelete(window.currentRole)) {
      alert("You don't have permission to delete guest submissions.");
      return;
    }
    if (!confirm("Delete this guest submission?")) return;
    try {
      await window.db.ref(`guestEntries/${id}`).remove();
      await window.renderAdminApp();
    } catch (err) {
      alert("Error deleting: " + err.message);
    }
  }

  window.guestforms = {
    renderGuestFormsSection,
    deleteGuestFormEntry,
  };
})();