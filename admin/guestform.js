(() => {
  const ROLES = { ME: "me", LEAD: "lead", DM: "dm", ADMIN: "admin" };

  function canDelete(role) {
    return role === ROLES.ADMIN || role === ROLES.DM;
  }

  // Everyone signed in can continue working a lead; change if you want to restrict
  function canContinue(role) {
    return true;
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
      const when = g.timestamp ? new Date(g.timestamp).toLocaleString() : "-";
      const linked = g.guestinfoKey ? true : false;
      return `
        <tr>
          <td>${g.guestName || "-"}</td>
          <td>${g.guestPhone || "-"}</td>
          <td>${when}</td>
          <td style="text-align:center;">
            ${linked
              ? `<button class="btn btn-secondary btn-sm" onclick="window.guestforms.openLinkedGuestInfo('${g.guestinfoKey}')">Open</button>`
              : (canContinue(currentRole)
                  ? `<button class="btn btn-primary btn-sm" onclick="window.guestforms.continueToGuestInfo('${id}')">Continue</button>`
                  : ''
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

  // Called when clicking "Continue" on an unlinked guest form submission
  async function continueToGuestInfo(entryId) {
    const role = window.currentRole;
    if (!canContinue(role)) {
      alert("You don't have permission to work this submission.");
      return;
    }
    try {
      // read the submission
      const snap = await window.db.ref(`guestEntries/${entryId}`).get();
      const formEntry = snap.val();
      if (!formEntry) {
        alert("Submission not found.");
        return;
      }

      // if already linked, just open
      if (formEntry.guestinfoKey) {
        openLinkedGuestInfo(formEntry.guestinfoKey);
        return;
      }

      // create guestinfo record (Step 1 equivalent)
      const payload = {
        custName:  formEntry.guestName  || "",
        custPhone: formEntry.guestPhone || "",
        submittedAt: Date.now(),
        userUid: window.currentUid || null, // may be undefined until we expose globally; fallback okay
        // mark source so we know this came from guest forms
        source: "guestform",
        sourceEntry: entryId,
      };

      const refPush = await window.db.ref("guestinfo").push(payload);
      const guestinfoKey = refPush.key;

      // write back linkage so we don't duplicate
      await window.db.ref(`guestEntries/${entryId}`).update({
        guestinfoKey,
        consumedAt: Date.now(),
      });

      // redirect to guest-portal and continue from Step 2
      openLinkedGuestInfo(guestinfoKey);
    } catch (err) {
      alert("Error continuing submission: " + err.message);
    }
  }

  // Open guest portal for an existing guestinfo record
  function openLinkedGuestInfo(guestinfoKey) {
    // carry a ?entry= so guest-portal.js can load and skip Step 1
    const url = `guest-portal.html?entry=${encodeURIComponent(guestinfoKey)}&from=guestforms`;
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