const db = firebase.database();

// Fetch all users
export async function fetchUsers() {
  try {
    const usersSnap = await db.ref('users').get();
    return usersSnap.val() || {};
  } catch (error) {
    console.error("Error fetching users:", error);
    throw error;
  }
}

// Change user role
export async function changeUserRole(uid, role) {
  try {
    await db.ref(`users/${uid}/role`).set(role);
  } catch (error) {
    console.error(`Error changing role for user ${uid}:`, error);
    throw error;
  }
}

// Assign lead to guest
export async function assignLeadToGuest(guestUid, leadUid) {
  try {
    await db.ref(`users/${guestUid}/assignedLead`).set(leadUid || null);
  } catch (error) {
    console.error(`Error assigning lead ${leadUid} to guest ${guestUid}:`, error);
    throw error;
  }
}

// Assign DM to lead
export async function assignDMToLead(leadUid, dmUid) {
  try {
    await db.ref(`users/${leadUid}/assignedDM`).set(dmUid || null);
  } catch (error) {
    console.error(`Error assigning DM ${dmUid} to lead ${leadUid}:`, error);
    throw error;
  }
}

// Delete user
export async function deleteUser(uid) {
  try {
    await db.ref(`users/${uid}`).remove();
  } catch (error) {
    console.error(`Error deleting user ${uid}:`, error);
    throw error;
  }
}