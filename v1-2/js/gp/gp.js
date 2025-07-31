// Elements
const newLeadBtn = document.getElementById('newLeadBtn');
const dashboardBtn = document.getElementById('dashboardBtn');
const toggleLeadIdBtn = document.getElementById('toggleLeadIdBtn');
const leadIdText = document.getElementById('leadIdText');
const menuToggle = document.getElementById('menuToggle');
const headerNav = document.getElementById('headerNav');

toggleLeadIdBtn.addEventListener('click', () => {
  const hidden = leadIdText.classList.toggle('hidden');
  toggleLeadIdBtn.textContent = hidden ? 'See Lead ID' : 'Hide Lead ID';
});

menuToggle.addEventListener('click', () => {
  headerNav.classList.toggle('hidden');
});

// New Lead button creates and loads new lead
newLeadBtn.addEventListener('click', async () => {
  if (!window.gpApp) return alert('App not ready');
  const newKey = await window.gpApp.createNewLead();
  if (newKey) {
    window.gpApp.setGuestKey(newKey);
    await window.gpApp.loadGuest(newKey);
  }
});

// Dashboard button redirect
dashboardBtn.addEventListener('click', () => {
  window.location.href = './admin.html';
});