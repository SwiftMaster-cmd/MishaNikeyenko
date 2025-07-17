(() => {
  const ROLES = window.ROLES || { ME: "me", LEAD: "lead", DM: "dm", ADMIN: "admin" };

  const roleBadge = r => `<span class="role-badge role-${r}">${r.toUpperCase()}</span>`;

  // Permission helpers from admin.js
  function assertEdit() {
    if (!window.canEdit || !window.canEdit(window.currentRole)) throw "PERM_DENIED_EDIT";
  }
  function assertDelete() {
    if (!window.canDelete || !window.canDelete(window.currentRole)) throw "PERM_DENIED_DELETE";
  }

  // Filter users visible to current user based on role hierarchy
  function filterVisibleUsers(users) {
    const currentRole = window.currentRole;
    const currentUid = window.currentUid;
    if (currentRole === ROLES.ADMIN) {
      return Object.entries(users);
    }
    if (currentRole === ROLES.DM) {
      return Object.entries(users).filter(([uid, u]) => {
        if (u.role === ROLES.LEAD && u.assignedDM === currentUid) return true;
        if (u.role === ROLES.ME) {
          const leadUid = u.assignedLead;
          return users[leadUid]?.assignedDM === currentUid;
        }
        return false;
      });
    }
    if (currentRole === ROLES.LEAD) {
      return Object.entries(users).filter(([uid, u]) => {
        if (u.role === ROLES.ME && u.assignedLead === currentUid) return true;
        if (u.role === ROLES.DM && uid === users[currentUid]?.assignedDM) return true;
        if (uid === currentUid) return true; // can see self
        return false;
      });
    }
    // ME sees only self
    return Object.entries(users).filter(([uid]) => uid === currentUid);
  }

  // Check if current user can edit a specific user's info (name, store, assign pickers)
  function canEditUser(targetUserId) {
    const currentRole = window.currentRole;
    const currentUid = window.currentUid;
    if (![ROLES.ADMIN, ROLES.DM].includes(currentRole)) return false;
    if (targetUserId === currentUid) return false; // can't edit self
    return true;
  }

  // Pin upgrade to admin prompt for DM or Lead trying to get Admin role
  async function tryUpgradeToAdmin(uid) {
    const pin = prompt("Enter PIN to upgrade to Admin:");
    if (pin !== "159896") {
      alert("Incorrect PIN.");
      return false;
    }
    await window.db.ref(`users/${uid}/role`).set(ROLES.ADMIN);
    await window.renderAdminApp();
    return true;
  }

  function renderUsersSection(users, currentRole) {
    const visibleUsers = filterVisibleUsers(users);

    return `
      <section class="admin-section users-section">
        <h2>Users</h2>
        <div class="users-container">
          ${visibleUsers.map(([uid, u]) => {
            const lead = users[u.assignedLead] || {};
            const dm = users[u.assignedDM] || {};

            const isMe = currentRole === ROLES.ME;
            const isLead = currentRole === ROLES.LEAD;
            const isDM = currentRole === ROLES.DM;
            const isAdmin = currentRole === ROLES.ADMIN;

            const editingSelf = uid === window.currentUid;

            // Show role picker only for DM or Admin and not for self
            const showRolePicker = (isDM || isAdmin) && !editingSelf;

            // Assign Lead picker for Admin & DM, filtered options
            const showAssignLeadPicker = (isAdmin || isDM) && !isLead;

            // Assign DM picker only for Admin
            const showAssignDMPicker = isAdmin;

            // Role options
            let roleOptions = '';
            if (showRolePicker) {
              Object.values(ROLES).forEach(role => {
                if (isDM && role === ROLES.ADMIN) return; // DM can't assign Admin
                roleOptions += `<option value="${role}" ${u.role === role ? 'selected' : ''}>${role.toUpperCase()}</option>`;
              });
            }

            // Assign Lead options (Admin: LEAD & DM, DM: LEAD only)
            let assignLeadOptions = '';
            if (showAssignLeadPicker) {
              assignLeadOptions = Object.entries(users)
                .filter(([, x]) => {
                  if (isAdmin) return [ROLES.LEAD, ROLES.DM].includes(x.role);
                  if (isDM) return x.role === ROLES.LEAD;
                  return false;
                })
                .map(([id, x]) => `<option value="${id}" ${u.assignedLead === id ? 'selected' : ''}>${x.name || x.email}</option>`)
                .join('');
            }

            // Assign DM options (Admin: DM & Admin, others none)
            let assignDmOptions = '';
            if (showAssignDMPicker) {
              assignDmOptions = Object.entries(users)
                .filter(([, x]) => [ROLES.DM, ROLES.ADMIN].includes(x.role))
                .map(([id, x]) => `<option value="${id}" ${u.assignedDM === id ? 'selected' : ''}>${x.name || x.email}</option>`)
                .join('');
            }

            // Editable name and store only for Admin and DM, not for self
            const canEditName = (isAdmin || isDM) && !editingSelf;
            const canEditStore = (isAdmin || isDM) && !editingSelf;

            return `
              <div class="user-card">
                <div class="user-card-header">
                  <div>
                    ${canEditName
                      ? `<input type="text" value="${u.name || ''}" onchange="window.users.editUserName('${uid}', this.value)" />`
                      : `<div class="user-name">${u.name || u.email}</div>`
                    }
                    <div class="user-email">${u.email}</div>
                  </div>
                  ${roleBadge(u.role)}
                </div>
                <div class="user-card-info">
                  <div><b>Store:</b> ${
                    canEditStore
                      ? `<input type="text" value="${u.store || ''}" onchange="window.users.editUserStore('${uid}', this.value)" />`
                      : (u.store || '-')
                  }</div>
                  <div><b>Lead:</b> ${
                    showAssignLeadPicker
                      ? `<select onchange="window.users.assignLeadToGuest('${uid}', this.value)">
                          <option value="">None</option>
                          ${assignLeadOptions}
                        </select>`
                      : (lead.name || lead.email || '-')
                  }</div>
                  <div><b>DM:</b> ${
                    showAssignDMPicker
                      ? `<select onchange="window.users.assignDMToLead('${uid}', this.value)">
                          <option value="">None</option>
                          ${assignDmOptions}
                        </select>`
                      : (dm.name || dm.email || '-')
                  }</div>
                </div>

                ${showRolePicker ? `
                  <div class="user-card-actions">
                    <label>Role:
                      <select onchange="window.users.onRoleChange('${uid}', this.value, '${u.role}')">
                        ${roleOptions}
                      </select>
                    </label>
                    ${window.canDelete && window.canDelete(currentRole) ? `<button class="btn btn-danger-outline" onclick="window.users.deleteUser('${uid}')">Delete</button>` : ''}
                  </div>` : ''}
              </div>
            `;
          }).join('')}
        </div>
      </section>
    `;
  }

  // Role change with PIN check
  async function onRoleChange(uid, newRole, oldRole) {
    if (uid === window.currentUid) {
      alert("You cannot change your own role.");
      await window.renderAdminApp();
      return;
    }

    if (newRole === ROLES.ADMIN && oldRole !== ROLES.ADMIN) {
      const pin = prompt("Enter PIN to upgrade to Admin:");
      if (pin !== "159896") {
        alert("Incorrect PIN.");
        await window.renderAdminApp();
        return;
      }
    }

    assertEdit();
    await window.db.ref(`users/${uid}/role`).set(newRole);
    await window.renderAdminApp();
  }

  async function editUserName(uid, newName) {
    if (!newName.trim()) {
      alert("Name cannot be empty.");
      await window.renderAdminApp();
      return;
    }
    if (![ROLES.ADMIN, ROLES.DM].includes(window.currentRole)) {
      alert("You do not have permission to edit names.");
      await window.renderAdminApp();
      return;
    }
    if (uid === window.currentUid) {
      alert("You cannot edit your own name here.");
      await window.renderAdminApp();
      return;
    }
    assertEdit();
    await window.db.ref(`users/${uid}/name`).set(newName.trim());
    await window.renderAdminApp();
  }

  async function editUserStore(uid, newStore) {
    if (![ROLES.ADMIN, ROLES.DM].includes(window.currentRole)) {
      alert("You do not have permission to edit stores.");
      await window.renderAdminApp();
      return;
    }
    if (uid === window.currentUid) {
      alert("You cannot edit your own store here.");
      await window.renderAdminApp();
      return;
    }
    await window.db.ref(`users/${uid}/store`).set(newStore.trim());
    await window.renderAdminApp();
  }

  async function changeUserRole(uid, role) {
    return onRoleChange(uid, role, null); // for backward compatibility
  }

  async function assignLeadToGuest(guestUid, leadUid) {
    assertEdit();
    await window.db.ref(`users/${guestUid}/assignedLead`).set(leadUid || null);
    await window.renderAdminApp();
  }

  async function assignDMToLead(leadUid, dmUid) {
    assertEdit();
    await window.db.ref(`users/${leadUid}/assignedDM`).set(dmUid || null);
    await window.renderAdminApp();
  }

  async function deleteUser(uid) {
    if (!window.canDelete || !window.canDelete(window.currentRole)) throw "PERM_DENIED_DELETE";
    if (confirm("Delete this user?")) {
      await window.db.ref(`users/${uid}`).remove();
      await window.renderAdminApp();
    }
  }

  window.users = {
    renderUsersSection,
    onRoleChange,
    changeUserRole,
    assignLeadToGuest,
    assignDMToLead,
    deleteUser,
    editUserName,
    editUserStore,
  };
})();