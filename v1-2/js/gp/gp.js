import { firebaseOnAuthStateChanged, signIn, getCurrentUserUid, createNewLead } from '../js/gp/gp-firebase.js';
import { gpApp } from './gp-app.js';

// Elements
const authContainer = document.getElementById('authContainer');
const guestApp = document.getElementById('guestApp');
const errorMsg = document.getElementById('errorMsg');
const signInBtn = document.getElementById('signInBtn');
const emailInput = document.getElementById('emailInput');
const passwordInput = document.getElementById('passwordInput');

const newLeadBtn = document.getElementById('newLeadBtn');
const dashboardBtn = document.getElementById('dashboardBtn');
const progressBar = document.getElementById('progressBar');
const progressLabel = document.getElementById('progressLabel');
const leadIdText = document.getElementById('leadIdText');
const toggleLeadIdBtn = document.getElementById('toggleLeadIdBtn');

const menuToggle = document.getElementById('menuToggle');
const headerNav = document.getElementById('headerNav');

// Toggle lead ID visibility
toggleLeadIdBtn.addEventListener('click', () => {
  const hidden = leadIdText.classList.toggle('hidden');
  toggleLeadIdBtn.textContent = hidden ? 'See Lead ID' : 'Hide Lead ID';
});

// Toggle mobile menu
menuToggle.addEventListener('click', () => {
  headerNav.classList.toggle('expanded');
});

// Sign in button
signInBtn.addEventListener('click', async () => {
  errorMsg.textContent = '';
  try {
    await signIn(emailInput.value.trim(), passwordInput.value.trim());
  } catch (e) {
    errorMsg.textContent = e.message || 'Sign in failed';
  }
});

// Auth state listener
firebaseOnAuthStateChanged(async (user) => {
  if (user) {
    authContainer.hidden = true;
    guestApp.hidden = false;

    if (!gpApp.guestKey) {
      const newKey = await createNewLead(getCurrentUserUid());
      gpApp.setGuestKey(newKey);
    }

    updateLeadDisplay();
    await gpApp.loadContext();
    gpApp.attachCompletionListener(updateProgress);
  } else {
    authContainer.hidden = false;
    guestApp.hidden = true;
  }
});

// New Lead button
newLeadBtn.addEventListener('click', async () => {
  if (!gpApp) return alert('App not ready');
  const newKey = await createNewLead(getCurrentUserUid());
  gpApp.setGuestKey(newKey);
  updateLeadDisplay();
  await gpApp.loadContext();
  updateProgress(0);
});

// Dashboard button
dashboardBtn.addEventListener('click', () => {
  window.location.href = './admin.html';
});

// Update progress bar & label
function updateProgress(pct) {
  progressBar.value = pct;
  progressLabel.textContent = `${pct}%`;
}

// Update lead ID display
function updateLeadDisplay() {
  leadIdText.textContent = gpApp.guestKey || '--';
}