(() => {
  const ROLES = window.ROLES || { ME: "me", LEAD: "lead", DM: "dm", ADMIN: "admin" };

  const roleBadge = r => `<span class="role-badge role-${r}">${r.toUpperCase()}</span>`;

  function assertEdit() {
    if (!window.canEdit || !window.canEdit(window.currentRole)) throw "PERM_DENIED_EDIT";
  }
  function assertDelete() {
    if (!window.canDelete || !window.canDelete(window.currentRole)) throw "PERM_DENIED_DELETE";
  }

  // Helper to check if current user can edit a specific user's info
  function canEditUser(targetUserRole, targetUserId) {
    const currentRole = window.currentRole;
    const currentUid = window.currentUid;

    if (!window.canEdit) return false;
    if (!window.canEdit(currentRole)) return false;

    // Cannot edit own role or store, name (except admin maybe)
    if (targetUserId === currentUid) return false;

    // Admin can edit anyone except themselves (handled above)
    if (currentRole === ROLES.ADMIN) return true;

    // DM can edit leads and ME under their leads (enforced in visibility, allow edit)
    if (currentRole === ROLES.DM) {
      // Simplify: allow editing leads and ME (actual filtering happens in render)
      if (targetUserRole === ROLES.LEAD || targetUserRole === ROLES.ME) return true;
    }

    // Leads cannot edit others' info except their MEs (handled in visibility)
    if (currentRole === ROLES.LEAD) {
      if (targetUserRole === ROLES.ME) return true;
    }

    return false;
  }

  // Visibility filter for users based on current user role
  function filterVisibleUsers(users) {
    const currentRole = window.currentRole;
    const currentUid = window.currentUid;
    if (currentRole === ROLES.ADMIN) {
      // Admin sees all
      return Object.entries(users);
    }
    if (currentRole === ROLES.DM) {
      // DM sees leads and ME under their leads
      return Object.entries(users).filter(([uid, u]) => {
        if (u.role === ROLES.LEAD) {
          // Lead must be assigned to this DM
          return u.assignedDM === currentUid;
        }
        if (u.role === ROLES.ME) {
          // ME whose assignedLead is one of DM's leads
          const leadUid = u.assignedLead;
          return users[leadUid]?.assignedDM === currentUid;
        }
        return false;
      });
    }
    if (currentRole === ROLES.LEAD) {
      // Lead sees their MEs and their own DM
      return Object.entries(users).filter(([uid, u]) => {
        if (u.role === ROLES.ME && u.assignedLead === currentUid) return true;
        if (u.role === ROLES.DM && uid === users[currentUid]?.assignedDM) return true;
        // Plus themselves
        if (uid === currentUid) return true;
        return false;
      });
    }
    // ME sees only themselves
    return Object.entries(users).filter(([uid]) => uid === currentUid);
  }

  // Prompt for PIN to upgrade self to admin
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

  // Renders user cards with full logic
  function renderUsersSection(users, currentRole) {
    const visibleUsers = filterVisibleUsers(users);

    return `
      <section class="admin-section users-section">
        <h2>Users</h2>
        <div class="users-container">
          ${visibleUsers.map(([uid, u]) => {
            const lead = users[u.assignedLead] || {};
            const dm = users[u.assignedDM] || {};

            const canEditThisUser = canEditUser(u.role, uid);
            const canDeleteThisUser = window.canDelete ? window.canDelete(currentRole) : false;

            // Prevent changing own role or store or name
            const editingSelf = uid === window.currentUid;

            // Role options filtered by your rules:
            // - Cannot change own role
            // - Only admins and DMs can assign DM/admin as options accordingly
            let roleOptions = "";
            Object.values(ROLES).forEach(role => {
              let showOption = true;

              // You cannot change your own role
              if (editingSelf) {
                showOption = false;
              } else {
                // DM can assign only ME, LEAD, DM, but not admin except with PIN
                if (currentRole === ROLES.DM && role === ROLES.ADMIN) showOption = false;

                // Lead cannot assign DM or admin
                if (currentRole === ROLES.LEAD && (role === ROLES.DM || role === ROLES.ADMIN)) showOption = false;
              }

              if (showOption) {
                roleOptions += `<option value="${role}" ${u.role === role ? "selected" : ""}>${role.toUpperCase()}</option>`;
              }
            });

            // Assign Lead picker options:
            // DM or Admin can see DMs in assign lead dropdown
            const assignLeadOptions = Object.entries(users)
              .filter(([, x]) => {
                if ([ROLES.LEAD, ROLES.DM].includes(x.role)) {
                  if (x.role === ROLES.DM && ![ROLES.ADMIN, ROLES.DM].includes(currentRole)) return false;
                  return true;
                }
                return false;
              })
              .map(([id, x]) =>
                `<option value="${id}" ${u.assignedLead === id ? "selected" : ""}>${x.name || x.email}</option>`
              )
              .join("");

            // Assign DM picker options:
            // Admin can assign Admin too
            const assignDmOptions = Object.entries(users)
              .filter(([, x]) => {
                if (x.role === ROLES.ADMIN) return currentRole === ROLES.ADMIN;
                return [ROLES.DM].includes(x.role);
              })
              .map(([id, x]) =>
                `<option value="${id}" ${u.assignedDM === id ? "selected" : ""}>${x.name || x.email}</option>`
              )
              .join("");

            // Editable name only if admin or DM
            const canEditName = [ROLES.ADMIN, ROLES.DM].includes(currentRole);

            // Editable store only if admin or DM
            const canEditStore = [ROLES.ADMIN, ROLES.DM].includes(currentRole);

            return `
              <div class="user-card">
                <div class="user-card-header">
                  <div>
                    ${canEditName && !editingSelf
                      ? `<input type="text" value="${u.name || ""}" onchange="window.users.editUserName('${uid}', this.value)" />`
                      : `<div class="user-name">${u.name || u.email}</div>`
                    }
                    <div class="user-email">${u.email}</div>
                  </div>
                  ${roleBadge(u.role)}
                </div>
                <div class="user-card-info">
                  <div>
                    <b>Store:</b>
                    ${canEditStore && !editingSelf
                      ? `<input type="text" value="${u.store || ""}" onchange="window.users.editUserStore('${uid}', this.value)" />`
                      : (u.store || '-')
                    }
                  </div>
                  <div><b>Lead:</b>
                    ${canEditThisUser ? `
                      <select onchange="window.users.assignLeadToGuest('${uid}', this.value)">
                        <option value="">None</option>
                        ${assignLeadOptions}
                      </select>` : (lead.name || lead.email || '-')
                    }
                  </div>
                  <div><b>DM:</b>
                    ${canEditThisUser ? `
                      <select onchange="window.users.assignDMToLead('${uid}', this.value)">
                        <option value="">None</option>
                        ${assignDmOptions}
                      </select>` : (dm.name || dm.email || '-')
                    }
                  </div>
                </div>

                ${canEditThisUser ? `
                  <div class="user-card-actions">
                    <label>Role:
                      <select onchange="window.users.onRoleChange('${uid}', this.value, '${u.role}')">
                        ${roleOptions}
                      </select>
                    </label>
                    ${canDeleteThisUser ? `<button class="btn btn-danger-outline" onclick="window.users.deleteUser('${uid}')">Delete</button>` : ''}
                  </div>` : ''}
              </div>
            `;
          }).join("")}
        </div>
      </section>
    `;
  }

  // Change role handler with PIN logic
  async function onRoleChange(uid, newRole, oldRole) {
    // You cannot change your own role (ignore UI for this, but double-check)
    if (uid === window.currentUid) {
      alert("You cannot change your own role.");
      await window.renderAdminApp();
      return;
    }

    // If upgrading to admin from lead or dm, ask for PIN
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

  // Edit user name handler (only admin or dm)
  async function editUserName(uid, newName) {
    if (![ROLES.ADMIN, ROLES.DM].includes(window.currentRole)) {
      alert("You do not have permission to edit names.");
      await window.renderAdminApp();
      return;
    }
    if (!newName.trim()) {
      alert("Name cannot be empty.");
      await window.renderAdminApp();
      return;
    }
    assertEdit();
    await window.db.ref(`users/${uid}/name`).set(newName.trim());
    await window.renderAdminApp();
  }

  // Edit user store handler (only admin or dm)
  async function editUserStore(uid, newStore) {
    if (![ROLES.ADMIN, ROLES.DM].includes(window.currentRole)) {
      alert("You do not have permission to edit stores.");
      await window.renderAdminApp();
      return;
    }
    await window.db.ref(`users/${uid}/store`).set(newStore.trim());
    await window.renderAdminApp();
  }

  async function changeUserRole(uid, role) {
    return onRoleChange(uid, role, null); // deprecated, use onRoleChange for PIN logic
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
    changeUserRole, // deprecated, calls onRoleChange internally
    assignLeadToGuest,
    assignDMToLead,
    deleteUser,
    editUserName,
    editUserStore,
  };
})();