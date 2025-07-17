/* ========================================================================
   Role Management & Permissions Admin Module
   ===================================================================== */

const ROLES = { ME: "me", LEAD: "lead", DM: "dm", ADMIN: "admin" };

// Default permission rules (can be changed live)
window.permissionRules = {
  canEdit:   { me: false, lead: true,  dm: true,  admin: true  },
  canDelete: { me: false, lead: false, dm: true,  admin: true  },
  canAssign: { me: false, lead: true,  dm: true,  admin: true  }
};

// Permission check functions exposed globally
window.canEdit = role => window.permissionRules.canEdit[role] || false;
window.canDelete = role => window.permissionRules.canDelete[role] || false;
window.canAssign = role => window.permissionRules.canAssign[role] || false;

/**
 * Renders the Role Management UI section.
 * Only admins should see this.
 * Should be called from dashboard.js inside main render.
 */
window.renderRoleManagementSection = function(currentRole) {
  if (currentRole !== ROLES.ADMIN) return '';

  const permTypes = Object.keys(window.permissionRules);
  const roles = Object.values(ROLES);

  const rows = roles.map(role => {
    const cells = permTypes.map(perm => {
      const allowed = window.permissionRules[perm][role];
      return `<td>
        <input type="checkbox" data-role="${role}" data-perm="${perm}" ${allowed ? 'checked' : ''}>
      </td>`;
    }).join('');
    return `<tr>
      <td><b>${role.toUpperCase()}</b></td>
      ${cells}
    </tr>`;
  }).join('');

  return `
    <section class="admin-section role-management-section" style="margin-top: 2rem;">
      <h2>Role Management</h2>
      <table border="1" cellspacing="0" cellpadding="6" style="width: 100%; max-width: 600px;">
        <thead>
          <tr>
            <th>Role</th>
            ${permTypes.map(perm => `<th>${perm}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      <p style="margin-top: 0.5rem; font-size: 0.85em; color: #666;">
        Toggle permissions for each role. Changes apply immediately.
      </p>
    </section>
  `;
};

// Event delegation: listen for permission toggles anywhere inside document
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

    // Optional: show UI feedback here, or persist permissions remotely
  }
});