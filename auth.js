// Handles auth state and sign-in/out logic, uses global firebase/auth

const adminAppDiv = document.getElementById('adminApp');
const logoutBtn = document.getElementById('logoutBtn');

auth.onAuthStateChanged(async user => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }
  adminAppDiv.innerHTML = "<div>Loading admin dashboard...</div>";
  try {
    const userSnap = await db.ref('users/' + user.uid).once('value');
    const profile = userSnap.val() || {};
    if (profile.role !== 'dm') {
      showDmUnlock();
      return;
    }
    logoutBtn.onclick = () => auth.signOut();
    window.renderAdminApp(user.uid);
  } catch (e) {
    showDmUnlock(e);
    console.error(e);
  }
});

function showDmUnlock(error) {
  adminAppDiv.innerHTML = `
    <h3>Access denied: DM only</h3>
    <p>If you’re the admin, enter your unlock code below to grant yourself access:</p>
    <input id="adminPass" placeholder="Enter code" style="padding:10px;width:160px;border-radius:8px;">
    <button onclick="trySelfPromote()" style="padding:10px 18px;border-radius:8px;font-weight:bold;margin-left:6px;">Unlock DM</button>
    <div id="unlockMsg" style="color:#b00;margin-top:8px;"></div>
    ${error ? `<div style="color:#b00;margin-top:8px;">${error.message || error.code}</div>` : ""}
  `;
}

window.trySelfPromote = async function() {
  const pass = document.getElementById('adminPass').value;
  if (pass !== '159896') {
    document.getElementById('unlockMsg').innerText = 'Wrong code!';
    return;
  }
  const user = auth.currentUser;
  if (!user) {
    document.getElementById('unlockMsg').innerText = 'Not signed in!';
    return;
  }
  try {
    await db.ref('users/' + user.uid + '/role').set('dm');
    document.getElementById('unlockMsg').innerText = 'DM access granted! Reloading...';
    setTimeout(() => window.location.reload(), 1200);
  } catch (e) {
    document.getElementById('unlockMsg').innerText = 'Upgrade failed: ' + (e.message || e.code);
  }
};