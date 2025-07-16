// admin-ui.js

const adminAppDiv = document.getElementById('adminApp');

function roleBadge(role) {
  if (role === "dm") return `<span class="role-badge role-dm">DM</span>`;
  if (role === "lead") return `<span class="role-badge role-lead">Lead</span>`;
  return `<span class="role-badge role-guest">Guest</span>`;
}

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
  const user = firebase.auth().currentUser;
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