import {
  firebaseOnAuthStateChanged,
  signIn,
  getCurrentUserUid,
  createNewLead,
  getGuest,
  updateGuest,
  attachCompletionListener
} from "./gp-firebase.js";

import { GuestFormApp } from "./gp-app.js";

// DOM Elements
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

// Show/hide lead ID
toggleLeadIdBtn.addEventListener('click', () => {
  if (leadIdText.classList.contains('hidden')) {
    leadIdText.classList.remove('hidden');
    toggleLeadIdBtn.textContent = 'Hide Lead ID';
  } else {
    leadIdText.classList.add('hidden');
    toggleLeadIdBtn.textContent = 'See Lead ID';
  }
});

// Toggle mobile menu
menuToggle.addEventListener('click', () => {
  headerNav.classList.toggle('expanded');
});

// Sign-in button logic
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
    authContainer.style.display = 'none';
    guestApp.style.display = 'block';

    if (!window.gpApp) {
      window.gpApp = new GuestFormApp({
        onLeadChange: updateLeadDisplay,
        onProgressUpdate: updateProgress
      });
    }

    if (!window.gpApp.guestKey) {
      const newKey = await createNewLead(getCurrentUserUid());
      window.gpApp.setGuestKey(newKey);
    }

    updateLeadDisplay();
    await window.gpApp.loadContext();
    window.gpApp.attachCompletionListener(updateProgress);
  } else {
    authContainer.style.display = 'block';
    guestApp.style.display = 'none';
  }
});

// New lead button
newLeadBtn.addEventListener('click', async () => {
  if (!window.gpApp) return alert('App not ready');
  const newKey = await createNewLead(getCurrentUserUid());
  window.gpApp.setGuestKey(newKey);
  updateLeadDisplay();
  await window.gpApp.loadContext();
  updateProgress(0);
});

// Dashboard button (optional additional logic can go here)
dashboardBtn.addEventListener('click', () => {
  window.location.href = './admin.html';
});

// Update progress bar & label
function updateProgress(pct) {
  progressBar.value = pct;
  progressLabel.textContent = `${pct}%`;
}

// Update lead ID display
function updateLeadDisplay(id) {
  leadIdText.textContent = window.gpApp.guestKey || '--';
}