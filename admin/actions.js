/* All side-effect functions referenced by ui.js */
import { dbSet, dbPush, dbUpd, dbDel } from "./api.js";
import { ROLES } from "./rbac.js";
import { render } from "./main.js";  // circular-safe (imported late)

export async function updateStoreNumber(id,val){ await dbSet(`stores/${id}/storeNumber`,val); render(); }
export async function assignTL(id,uid){ await dbSet(`stores/${id}/teamLeadUid`,uid); render(); }
export async function deleteStore(id){ if(confirm("Delete store?")) {await dbDel(`stores/${id}`); render();} }

export async function changeUserRole(uid,role){ await dbSet(`users/${uid}/role`,role); render(); }
export async function deleteUser(uid){ if(confirm("Delete user?")) {await dbDel(`users/${uid}`); render();} }
export async function assignLead(uid,leadUid){ await dbSet(`users/${uid}/assignedLead`,leadUid||null); render(); }
export async function assignDM(uid,dmUid){ await dbSet(`users/${uid}/assignedDM`,dmUid||null); render(); }

export async function toggleStar(id,starred){ await dbSet(`reviews/${id}/starred`,!starred); render(); }
export async function deleteReview(id){ if(confirm("Delete review?")) {await dbDel(`reviews/${id}`); render();} }

export async function addStore(num){
  if(!num){ alert("Enter store #"); return; }
  await dbPush("stores",{storeNumber:num,teamLeadUid:""});
  render();
}