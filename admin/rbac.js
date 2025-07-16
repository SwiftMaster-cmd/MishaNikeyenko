/* Centralised role / permission logic */
export const ROLES = { ME:'me', LEAD:'lead', DM:'dm', ADMIN:'admin' };

export const rules = {
  canEdit   : r => r !== ROLES.ME,
  canDelete : r => r === ROLES.DM || r === ROLES.ADMIN,
  roleChoices : r =>
      r === ROLES.ADMIN ? [ROLES.ME,ROLES.LEAD,ROLES.DM,ROLES.ADMIN] :
      r === ROLES.DM    ? [ROLES.ME,ROLES.LEAD]                     : [],

  visibleUsers(viewerId, viewerRole, users) {
    if (viewerRole === ROLES.ADMIN) return users;

    if (viewerRole === ROLES.DM) {
      const vis={};
      for (const [uid,u] of Object.entries(users))
        if (uid===viewerId ||
            (u.role===ROLES.LEAD && u.assignedDM===viewerId) ||
            (u.role===ROLES.ME   && users[u.assignedLead]?.assignedDM===viewerId))
          vis[uid]=u;
      return vis;
    }
    if (viewerRole === ROLES.LEAD) {
      const vis={};
      for (const [uid,u] of Object.entries(users))
        if (uid===viewerId || (u.role===ROLES.ME && u.assignedLead===viewerId))
          vis[uid]=u;
      return vis;
    }
    return { [viewerId]: users[viewerId] };
  }
};