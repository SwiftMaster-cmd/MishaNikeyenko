const db = firebase.database();

// Fetch and render guest info assigned to a lead or DM
export async function fetchGuestInfo(currentUser, users) {
  try {
    const guestinfoSnap = await db.ref('guestinfo').get();
    const guestinfo = guestinfoSnap.val() || {};

    let filteredGuests = {};

    if (!currentUser) return filteredGuests;

    const currentRole = users[currentUser.uid]?.role || '';

    if (currentRole === 'dm') {
      filteredGuests = guestinfo; // DM sees all guest info
    } else if (currentRole === 'lead') {
      // Lead sees guestinfo of assigned guests only
      const assignedGuests = Object.entries(users)
        .filter(([uid, user]) => user.assignedLead === currentUser.uid)
        .map(([uid]) => uid);

      Object.entries(guestinfo).forEach(([gid, g]) => {
        if (g.userUid && assignedGuests.includes(g.userUid)) {
          filteredGuests[gid] = g;
        }
      });
    }
    return filteredGuests;
  } catch (error) {
    console.error("Error fetching guest info:", error);
    throw error;
  }
}