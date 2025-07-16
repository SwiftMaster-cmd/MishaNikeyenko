/* Pure DOM-string builders */
import { ROLES, rules } from "./rbac.js";

export const roleBadge = r => `<span class="role-badge role-${r}">${r.toUpperCase()}</span>`;

export function buildStoreRows(stores, usersFull, canEdit, canDelete) {
  return Object.entries(stores).map(([id,s])=>{
    const tl=usersFull[s.teamLeadUid]||{};
    return `<tr>
      <td>${canEdit
        ? `<input type="text" value="${s.storeNumber||''}" onchange="window.UI.updateStoreNumber('${id}',this.value)">`
        : s.storeNumber||'-'}</td>
      <td>
        ${canEdit?`<select onchange="window.UI.assignTL('${id}',this.value)">
          <option value="">-- Unassigned --</option>
          ${Object.entries(usersFull)
              .filter(([,u])=>[ROLES.LEAD,ROLES.DM].includes(u.role))
              .map(([uid,u])=>`<option value="${uid}" ${s.teamLeadUid===uid?'selected':''}>${u.name||u.email}</option>`).join('')}
        </select>`:(tl.name||tl.email||'-')}
        ${tl.role?roleBadge(tl.role):''}
      </td>
      <td>${canDelete?`<button class="btn btn-danger" onclick="window.UI.deleteStore('${id}')">Delete</button>`:''}</td>
    </tr>`;
  }).join('');
}

export function buildUserCards(viewRole, currentRole, currentUid, users, usersFull){
  return Object.entries(users).map(([uid,u])=>{
    const canEdit      = rules.canEdit(currentRole);
    const canDelete    = rules.canDelete(currentRole);
    const choices      = rules.roleChoices(currentRole);
    const lead         = usersFull[u.assignedLead]||{};
    const dm           = usersFull[u.assignedDM]  ||{};
    const roleSelect   = choices.length?`<label>Role:
      <select onchange="window.UI.changeUserRole('${uid}',this.value)">
        ${choices.map(r=>`<option value="${r}" ${u.role===r?'selected':''}>${r.toUpperCase()}</option>`).join('')}
      </select></label>`:"";
    const assignCtrls  = (currentRole===ROLES.DM||currentRole===ROLES.ADMIN)?`
      <label>Assign Lead:
        <select onchange="window.UI.assignLead('${uid}',this.value)">
          <option value="">None</option>
          ${Object.entries(usersFull).filter(([,x])=>x.role===ROLES.LEAD)
             .map(([id,x])=>`<option value="${id}" ${u.assignedLead===id?'selected':''}>${x.name||x.email}</option>`).join('')}
        </select>
      </label>
      <label>Assign DM:
        <select onchange="window.UI.assignDM('${uid}',this.value)">
          <option value="">None</option>
          ${Object.entries(usersFull).filter(([,x])=>x.role===ROLES.DM)
             .map(([id,x])=>`<option value="${id}" ${u.assignedDM===id?'selected':''}>${x.name||x.email}</option>`).join('')}
        </select>
      </label>`:"";
    const delBtn = canDelete?`<button class="btn btn-danger-outline" onclick="window.UI.deleteUser('${uid}')">Delete</button>`:"";
    return `<div class="user-card">
      <div class="user-card-header">
        <div><div class="user-name">${u.name||u.email}</div><div class="user-email">${u.email}</div></div>
        ${roleBadge(u.role)}
      </div>
      <div class="user-card-info">
        <div><b>Store:</b> ${u.store||'-'}</div>
        <div><b>Lead:</b> ${lead.name||lead.email||'-'}</div>
        <div><b>DM:</b>   ${dm.name||dm.email||'-'}</div>
      </div>
      ${(roleSelect||assignCtrls||delBtn)?`<div class="user-card-actions">${roleSelect}${assignCtrls}${delBtn}</div>`:""}
    </div>`;
  }).join('');
}