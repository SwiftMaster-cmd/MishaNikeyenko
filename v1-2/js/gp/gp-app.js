import {
  onAuthStateChanged,
  getGuest,
  createNewLead,
  attachCompletionListener,
  getCurrentUserUid,
} from './gp-firebase.js';

import {
  createProgressHeader,
  renderProgressBar,
  renderStepContainers,
  updateProgressBar,
} from './gp-ui-render.js';

import { initUIApp } from './ui-app.js';
import { normGuest, detectStatus, computeGuestPitchQuality } from './gp-core.js';

let currentGuestKey = null;

function showStep(stepId) {
  ['step1Form', 'step2Form', 'step3Form'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', id !== stepId);
  });
}

function updateLeadIdInHeader(gid) {
  const leadIdDisplay = document.getElementById('leadIdDisplay');
  if (leadIdDisplay) leadIdDisplay.textContent = `Lead ID: ${gid}`;
}

function populateUIFields(g) {
  if (!g) return;
  document.getElementById('custName').value = g.custName || '';
  document.getElementById('custPhone').value = g.custPhone || '';
  // Similarly populate Step 2 and Step 3 fields...
}

async function loadGuestFromKey(gid, questions) {
  try {
    let g = await getGuest(gid);
    if (!g) throw new Error('Guest not found');
    g = normGuest(g);
    currentGuestKey = gid;

    updateLeadIdInHeader(gid);
    populateUIFields(g);

    const status = detectStatus(g);
    let step = 'step1Form';
    if (status === 'working') step = 'step2Form';
    else if (status === 'proposal') step = 'step3Form';
    showStep(step);

    attachCompletionListener(gid, pct => {
      updateProgressBar(pct);
    });

    const comp = computeGuestPitchQuality(g);
    updateProgressBar(comp.pct);
  } catch (err) {
    console.error(err);
  }
}

async function onNewLeadClicked() {
  try {
    const uid = getCurrentUserUid();
    const newKey = await createNewLead(uid);
    localStorage.setItem('last_guestinfo_key', newKey);
    const baseUrl = window.location.pathname;
    window.location.href = `${baseUrl}?gid=${encodeURIComponent(newKey)}&uistart=step1`;
  } catch (err) {
    alert('Error creating new lead: ' + err.message);
  }
}

export async function initApp(questions) {
  // Render UI skeleton
  createProgressHeader(null, onNewLeadClicked);
  const progressBar = renderProgressBar();
  const steps = renderStepContainers();

  const app = document.getElementById('guestApp');
  app.appendChild(progressBar);
  app.appendChild(steps);

  // Setup event handlers
  initUIApp(questions);

  onAuthStateChanged(async user => {
    if (!user) {
      alert('Please sign in to continue.');
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const gid = params.get('gid') || localStorage.getItem('last_guestinfo_key');
    if (gid) {
      await loadGuestFromKey(gid, questions);
    }
  });
}

export function getGuestKey() {
  return currentGuestKey;
}