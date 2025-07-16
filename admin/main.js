import { auth, db } from "./firebase-init.js";
import { ref, update } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-database.js";
import { ROLES, rules } from "./rbac.js";
import { fetchAll } from "./api.js";
import * as UI from "./ui.js";
import * as ACT from "./actions.js";

/* expose actions for inline HTML handlers */
window.UI = ACT;

let currentUid="", currentRole=ROLES.ME;

export async function render(){
  document.getElementById("adminApp").innerHTML = "<p>Loading…</p>";

  const {stores,users:usersFull,reviews,guestinfo} = await fetchAll();
  const users   = rules.visibleUsers(currentUid,currentRole,usersFull);

  /* Build HTML */
  const storesHtml = UI.buildStoreRows(stores,usersFull,rules.canEdit(currentRole),rules.canDelete(currentRole));
  const usersHtml  = UI.buildUserCards(currentRole,currentRole,currentUid,users,usersFull);

  document.getElementById("adminApp").innerHTML=`
    <section><h2>Stores</h2>
      <table class="store-table"><thead><tr><th>#</th><th>Lead</th><th></th></tr></thead><tbody>${storesHtml}</tbody></table>
      ${rules.canEdit(currentRole)?`<input id="newStoreNum"><button onclick="UI.addStore(document.getElementById('newStoreNum').value.trim())">Add Store</button>`:""}
    </section>
    <section><h2>Users</h2><div class="users-container">${usersHtml}</div></section>
    <pre class="debug">Role: ${currentRole}</pre>`;   // quick sanity
}

auth.onAuthStateChanged(async user=>{
  if(!user){ location.href="index.html"; return; }
  currentUid=user.uid;

  /* ensure profile */
  const snap=await fetchAll().then(res=>res.users[user.uid]||null);
  if(!snap) await update(ref(db,`users/${user.uid}`),{role:ROLES.ME,name:user.displayName||user.email,email:user.email});
  currentRole=(snap?.role)||ROLES.ME;

  document.getElementById("logoutBtn").style.display="inline-block";
  document.getElementById("logoutBtn").onclick=()=>auth.signOut();

  render();
});