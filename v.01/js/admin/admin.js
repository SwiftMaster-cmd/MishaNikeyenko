/* ========================================================================
   Role Management & Permissions Admin Module
   ===================================================================== */

window.ROLES = { ME: "me", LEAD: "lead", DM: "dm", ADMIN: "admin" };

// Default mutable permission rules (can be changed live)
window.permissionRules = {
  canEdit:   { me: false, lead: true,  dm: true,  admin: true  },
  canDelete: { me: false, lead: false, dm: true,  admin: true  },
  canAssign: { me: false, lead: true,  dm: true,  admin: true  }
};

// Permission check helpers (normalize role to lowercase)
window.canEdit = function(role) {
  if (!role) return false;
  return !!window.permissionRules.canEdit[role.toLowerCase()];
};
window.canDelete = function(role) {
  if (!role) return false;
  return !!window.permissionRules.canDelete[role.toLowerCase()];
};
window.canAssign = function(role) {
  if (!role) return false;
  return !!window.permissionRules.canAssign[role.toLowerCase()];
};

/**
 * Render Role Management UI (only for admins)
 * @param {string} currentRole
 * @returns {string} HTML or empty string if not admin
 */
window.renderRoleManagementSection = function(currentRole) {
  if (!currentRole || currentRole.toLowerCase() !== window.ROLES.ADMIN) return '';

  const permTypes = Object.keys(window.permissionRules);
  const roles = Object.values(window.ROLES);

  const rows = roles.map(role => {
    const r = role.toLowerCase();
    const cells = permTypes.map(perm => {
      const checked = window.permissionRules[perm][r] ? 'checked' : '';
      return `<td style="text-align:center;">
        <input type="checkbox" data-role="${r}" data-perm="${perm}" ${checked}>
      </td>`;
    }).join('');
    return `<tr>
      <td style="font-weight:bold;">${role.toUpperCase()}</td>
      ${cells}
    </tr>`;
  }).join('');

  return `
    <section class="admin-section role-management-section" style="
      margin: 2rem auto;
      max-width: 700px;
      border: 2px solid #4a90e2;
      border-radius: 8px;
      background: #f0f8ff;
      padding: 20px;
      font-family: Arial, sans-serif;
      color: #222;
    ">
      <h2 style="margin-bottom: 16px; color: #003366;">Role Management</h2>
      <table border="1" cellpadding="8" cellspacing="0" style="width: 100%; border-collapse: collapse;">
        <thead style="background: #d9eaff;">
          <tr>
            <th style="width: 110px; text-align: left;">Role</th>
            ${permTypes.map(p => `<th style="text-transform: capitalize;">${p}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      <p style="margin-top: 12px; font-size: 0.9em; color: #555;">
        Toggle permissions per role. Changes apply immediately.
      </p>
    </section>
  `;
};

// Event delegation to update permissionRules on checkbox toggle
document.addEventListener('change', (event) => {
  const el = event.target;
  if (!el.matches('.role-management-section input[type="checkbox"]')) return;

  const role = el.dataset.role;
  const perm = el.dataset.perm;

  if (!role || !perm) return;
  if (window.permissionRules[perm] && role in window.permissionRules[perm]) {
    window.permissionRules[perm][role] = el.checked;
    console.log(`Permission updated: ${perm} for ${role} = ${el.checked}`);
    // Optional: persist changes remotely here
  }
});