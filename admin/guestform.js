(() => {
  const ROLES = { ME: "me", LEAD: "lead", DM: "dm", ADMIN: "admin" };

  // UPDATE: path to the employee guest info workflow page
  // Override by defining window.GUEST_INFO_PAGE before this script loads.
  const GUEST_INFO_PAGE = window.GUEST_INFO_PAGE || "/employee/guestinfo.html";

  function canDelete(role) {
    return role === ROLES.ADMIN || role === ROLES.DM;
  }

  function canContinue(role) {
    return true; // let all signed-in roles work submissions; change if needed
  }

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
      const when   = g.timestamp ? new Date(g.timestamp).toLocaleString() : "-";
      const linked = !!g.guestinfoKey;
      return `
        <tr class="${linked ? 'linked' : ''}">
          <td>${g.guestName || "-"}</td>
          <td>${g.guestPhone || "-"}</td>
          <td>${when}</td>
          <td style="text-align:center; white-space:nowrap;">
            ${linked
              ? `<button class="btn btn-secondary btn-sm" onclick="window.guestforms.openLinkedGuestInfo('${g.guestinfoKey}')">Open</button>`
              : (canContinue(currentRole)
                  ? `<button class="btn btn-primary btn-sm" onclick="window.guestforms.continueToGuestInfo('${id}')">Continue</button>`
                  : ""
                )
            }
            ${canDelete(currentRole)
              ? `<button class="btn btn-danger btn-sm" onclick="window.guestforms.deleteGuestFormEntry('${id}')">Delete</button>`
              : ""
            }
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

  async function continueToGuestInfo(entryId) {
    const role = window.currentRole;
    if (!canContinue(role)) {
      alert("You don't have permission to work this submission.");
      return;
    }
    try {
      const snap = await window.db.ref(`guestEntries/${entryId}`).get();
      const formEntry = snap.val();
      if (!formEntry) {
        alert("Submission not found.");
        return;
      }

      // Already linked? Go there.
      if (formEntry.guestinfoKey) {
        openLinkedGuestInfo(formEntry.guestinfoKey);
        return;
      }

      // Seed guestinfo record from submission
      const payload = {
        custName:    formEntry.guestName  || "",
        custPhone:   formEntry.guestPhone || "",
        submittedAt: Date.now(),
        userUid:     window.currentUid || null,
        source:      "guestform",
        sourceEntry: entryId,
      };

      const refPush      = await window.db.ref("guestinfo").push(payload);
      const guestinfoKey = refPush.key;

      // Link back to submission
      await window.db.ref(`guestEntries/${entryId}`).update({
        guestinfoKey,
        consumedAt: Date.now(),
      });

      openLinkedGuestInfo(guestinfoKey);
    } catch (err) {
      alert("Error continuing submission: " + err.message);
    }
  }

  function openLinkedGuestInfo(guestinfoKey) {
    const url = `${GUEST_INFO_PAGE}?entry=${encodeURIComponent(guestinfoKey)}&from=guestforms`;
    window.location.href = url;
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
    continueToGuestInfo,
    openLinkedGuestInfo,
    deleteGuestFormEntry,
  };
})();