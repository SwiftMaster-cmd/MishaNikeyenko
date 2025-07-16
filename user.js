// user.js
import { db } from './firebaseConfig.js';

export async function getAllUsers() {
  const snapshot = await db.ref('users').get();
  return snapshot.val() || {};
}

export async function changeUserRole(uid, role) {
  await db.ref('users/' + uid + '/role').set(role);
}

export async function assignLeadToGuest(guestUid, leadUid) {
  await db.ref('users/' + guestUid + '/assignedLead').set(leadUid || null);
}

export async function assignDMToLead(leadUid, dmUid) {
  await db.ref('users/' + leadUid + '/assignedDM').set(dmUid || null);
}

export async function deleteUser(uid) {
  await db.ref('users/' + uid).remove();
}

export function roleBadge(role) {
  if (role === "dm") return `<span class="role-badge role-dm">DM</span>`;
  if (role === "lead") return `<span class="role-badge role-lead">Lead</span>`;
  return `<span class="role-badge role-guest">Guest</span>`;
}

export function renderUsers(users) {
  let usersHtml = `<table class="user-table"><tr>
    <th>Name</th><th>Email</th><th>Role</th><th>Store</th><th>Assigned Lead</th><th>Assign Lead</th><th>Assigned DM</th><th>Assign DM</th><th>Delete</th></tr>`;

  if (!Object.keys(users).length) {
    usersHtml += `<tr><td colspan="9"><em>No users found.</em></td></tr>`;
  }

  for (const uid in users) {
    const u = users[uid];
    usersHtml += `<tr>
      <td>${u.name || ''}</td>
      <td>${u.email || ''}</td>
      <td>
        ${roleBadge(u.role)}
        <select onchange="window.changeUserRole('${uid}', this.value)">
          <option value="guest" ${u.role === "guest" ? "selected" : ""}>Guest</option>
          <option value="lead" ${u.role === "lead" ? "selected" : ""}>Lead</option>
          <option value="dm" ${u.role === "dm" ? "selected" : ""}>DM</option>
        </select>
      </td>
      <td>${u.store || '-'}</td>
      <td>${u.assignedLead ? (users[u.assignedLead]?.name || users[u.assignedLead]?.email || '-') : '-'}</td>
      <td>
        <select onchange="window.assignLeadToGuest('${uid}', this.value)">
          <option value="">-- None --</option>
          ${Object.entries(users)
            .filter(([leadUid, user]) => user.role === 'lead')
            .map(([leadUid, user]) =>
              `<option value="${leadUid}" ${u.assignedLead === leadUid ? 'selected' : ''}>${user.name || user.email}</option>`
            ).join('')}
        </select>
      </td>
      <td>${u.assignedDM ? (users[u.assignedDM]?.name || users[u.assignedDM]?.email || '-') : '-'}</td>
      <td>
        <select onchange="window.assignDMToLead('${uid}', this.value)">
          <option value="">-- None --</option>
          ${Object.entries(users)
            .filter(([dmUid, user]) => user.role === 'dm')
            .map(([dmUid, user]) =>
              `<option value="${dmUid}" ${u.assignedDM === dmUid ? 'selected' : ''}>${user.name || user.email}</option>`
            ).join('')}
        </select>
      </td>
      <td><button onclick="window.deleteUser('${uid}')">Delete User</button></td>
    </tr>`;
  }
  usersHtml += `</table>`;
  return usersHtml;
}