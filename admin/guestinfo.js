(() => {
  const ROLES = { ME: "me", LEAD: "lead", DM: "dm", ADMIN: "admin" };

  function canDelete(role) {
    return [ROLES.ADMIN, ROLES.DM, ROLES.LEAD].includes(role);
  }

  function canEdit(role) {
    return role !== ROLES.ME || true; // ME can edit own; others can edit visible
  }

  // Helper: get users under this DM (leads + ME)
  function getUsersUnderDM(users, dmUid) {
    const leads = Object.entries(users).filter(([,u]) => u.role === ROLES.LEAD && u.assignedDM === dmUid).map(([uid])=>uid);
    const mes = Object.entries(users).filter(([,u]) => u.role === ROLES.ME && leads.includes(u.assignedLead)).map(([uid])=>uid);
    return new Set([...leads, ...mes]);
  }

  // Filter guestinfo by visibility rules per role
  function filterGuestinfo(guestinfo, users, currentUid, currentRole) {
    if (!guestinfo || !users || !currentUid || !currentRole) return {};

    if (currentRole === ROLES.ADMIN) return guestinfo;

    if (currentRole === ROLES.DM) {
      // DM sees guestinfo submitted by leads and mes under them + self
      const underUsers = getUsersUnderDM(users, currentUid);
      underUsers.add(currentUid);
      return Object.fromEntries(
        Object.entries(guestinfo).filter(([id, g]) => underUsers.has(g.userUid))
      );
    }

    if (currentRole === ROLES.LEAD) {
      // Lead sees own guestinfo + ME under them
      const mesUnderLead = Object.entries(users).filter(([,u]) => u.role === ROLES.ME && u.assignedLead === currentUid).map(([uid]) => uid);
      const visibleUsers = new Set([...mesUnderLead, currentUid]);
      return Object.fromEntries(
        Object.entries(guestinfo).filter(([id, g]) => visibleUsers.has(g.userUid))
      );
    }

    if (currentRole === ROLES.ME) {
      // ME sees own guestinfo only
      return Object.fromEntries(
        Object.entries(guestinfo).filter(([id, g]) => g.userUid === currentUid)
      );
    }

    return {};
  }

  function renderGuestinfoSection(guestinfo, users, currentUid, currentRole) {
    const visibleGuestinfo = filterGuestinfo(guestinfo, users, currentUid, currentRole);

    if (Object.keys(visibleGuestinfo).length === 0) return `<p class="text-center">No guest info found.</p>`;

    // Render cards with toggle edit per card
    const guestCards = Object.entries(visibleGuestinfo)
      .sort((a,b) => (b[1].submittedAt||0) - (a[1].submittedAt||0))
      .map(([id, g]) => {
        const submitter = users[g.userUid];
        const canDeleteEntry = canDelete(currentRole);
        const canEditEntry = (currentRole !== ROLES.ME) || (g.userUid === currentUid); 

        return `
          <div class="guest-card" id="guest-card-${id}">
            <div><b>Submitted by:</b> ${submitter?.name||submitter?.email||g.userUid}</div>
            <div><b>Customer:</b> <span class="guest-custName">${g.custName||'-'}</span> | <b>Phone:</b> <span class="guest-custPhone">${g.custPhone||'-'}</span></div>
            <div><b>Type:</b> <span class="guest-serviceType">${g.serviceType||'-'}</span></div>
            <div><b>Situation:</b> <span class="guest-situation">${g.situation||'-'}</span></div>
            <div><b>When:</b> ${g.submittedAt ? new Date(g.submittedAt).toLocaleString() : '-'}</div>
            <div style="margin-top: 8px;">
              ${canEditEntry ? `<button onclick="window.guestinfo.toggleEdit('${id}')">Edit</button>` : ''}
              ${canDeleteEntry ? `<button onclick="window.guestinfo.deleteGuestInfo('${id}')">Delete</button>` : ''}
            </div>
            <form class="guest-edit-form" id="guest-edit-form-${id}" style="display:none; margin-top: 8px;">
              <label>
                Customer Name:<br>
                <input type="text" name="custName" value="${g.custName || ''}">
              </label><br>
              <label>
                Customer Phone:<br>
                <input type="text" name="custPhone" value="${g.custPhone || ''}">
              </label><br>
              <label>
                Service Type:<br>
                <input type="text" name="serviceType" value="${g.serviceType || ''}">
              </label><br>
              <label>
                Situation:<br>
                <textarea name="situation">${g.situation || ''}</textarea>
              </label><br>
              <button type="button" onclick="window.guestinfo.saveEdit('${id}')">Save</button>
              <button type="button" onclick="window.guestinfo.cancelEdit('${id}')">Cancel</button>
            </form>
          </div>
        `;
      }).join('');

    return `
      <section class="admin-section guestinfo-section">
        <h2>Guest Info</h2>
        <div class="guestinfo-container">${guestCards}</div>
      </section>
    `;
  }

  // Toggle edit form visibility for a guest info card
  function toggleEdit(id) {
    const form = document.getElementById(`guest-edit-form-${id}`);
    if (!form) return;
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
  }

  // Cancel edit hides the form
  function cancelEdit(id) {
    const form = document.getElementById(`guest-edit-form-${id}`);
    if (!form) return;
    form.style.display = 'none';
  }

  // Save edit: collects form data and updates Firebase
  async function saveEdit(id) {
    const form = document.getElementById(`guest-edit-form-${id}`);
    if (!form) return alert("Edit form not found.");

    const data = {
      custName: form.custName.value.trim(),
      custPhone: form.custPhone.value.trim(),
      serviceType: form.serviceType.value.trim(),
      situation: form.situation.value.trim(),
    };

    try {
      await window.db.ref(`guestinfo/${id}`).update(data);
      form.style.display = 'none';
      await window.renderAdminApp();
    } catch (e) {
      alert("Error saving changes: " + e.message);
    }
  }

  async function deleteGuestInfo(id) {
    if (!canDelete(window.currentRole)) return alert("You don't have permission to delete.");
    if (!confirm("Delete this guest info?")) return;
    try {
      await window.db.ref(`guestinfo/${id}`).remove();
      await window.renderAdminApp();
    } catch (e) {
      alert("Error deleting: " + e.message);
    }
  }

  window.guestinfo = {
    renderGuestinfoSection,
    toggleEdit,
    cancelEdit,
    saveEdit,
    deleteGuestInfo
  };
})();