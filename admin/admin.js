/* ========================================================================
   Role Management & Permissions Admin Module
   ===================================================================== */

const ROLES = { ME: "me", LEAD: "lead", DM: "dm", ADMIN: "admin" };

// Default permission rules (editable live)
window.permissionRules = {
  canEdit:   { me: false, lead: true,  dm: true,  admin: true  },
  canDelete: { me: false, lead: false, dm: true,  admin: true  },
  canAssign: { me: false, lead: true,  dm: true,  admin: true  }
};

// Permission check functions exposed globally
window.canEdit = role => {
  if (!role) return false;
  return window.permissionRules.canEdit[role.toLowerCase()] || false;
};
window.canDelete = role => {
  if (!role) return false;
  return window.permissionRules.canDelete[role.toLowerCase()] || false;
};
window.canAssign = role => {
  if (!role) return false;
  return window.permissionRules.canAssign[role.toLowerCase()] || false;
};

/**
 * Renders the Role Management UI section.
 * Only admins see this.
 * Called from dashboard.js inside main render.
 */
window.renderRoleManagementSection = function(currentRole) {
  if (!currentRole || currentRole.toLowerCase() !== ROLES.ADMIN) return '';

  const permTypes = Object.keys(window.permissionRules);
  const roles = Object.values(ROLES);

  const rows = roles.map(role => {
    const roleLower = role.toLowerCase();
    const cells = permTypes.map(perm => {
      const allowed = window.permissionRules[perm][roleLower];
      return `<td style="text-align:center;">
        <input type="checkbox" data-role="${roleLower}" data-perm="${perm}" ${allowed ? 'checked' : ''}>
      </td>`;
    }).join('');
    return `<tr>
      <td><b>${role.toUpperCase()}</b></td>
      ${cells}
    </tr>`;
  }).join('');

  return `
    <section class="admin-section role-management-section" style="
      margin-top: 2rem;
      border: 2px solid #4a90e2;
      padding: 16px;
      background: #f0f8ff;
      color: #222;
      max-width: 700px;
      font-family: Arial, sans-serif;
    ">
      <h2 style="margin-bottom: 12px; font-weight: 700; color: #003366;">Role Management</h2>
      <table border="1" cellspacing="0" cellpadding="6" style="width: 100%; border-collapse: collapse;">
        <thead style="background: #d9eaff;">
          <tr>
            <th style="width: 100px; text-align: left;">Role</th>
            ${permTypes.map(perm => `<th style="text-transform: capitalize;">${perm}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      <p style="margin-top: 12px; font-size: 0.85em; color: #555;">
        Toggle permissions for each role. Changes apply immediately across the dashboard.
      </p>
    </section>
  `;
};

// Listen for changes on checkboxes and update permissionRules live
document.addEventListener('change', e => {
  if (!e.target.matches('.role-management-section input[type="checkbox"]')) return;

  const role = e.target.dataset.role;
  const perm = e.target.dataset.perm;
  const checked = e.target.checked;

  if (
    role && perm &&
    window.permissionRules[perm] &&
    role in window.permissionRules[perm]
  ) {
    window.permissionRules[perm][role] = checked;
    console.log(`Permission updated: ${perm} for ${role} = ${checked}`);
  }
});