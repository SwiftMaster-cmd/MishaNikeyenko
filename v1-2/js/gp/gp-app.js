import { onAuthStateChanged, getGuest, createNewLead, updateGuest, attachCompletionListener, getCurrentUserUid } from './gp-firebase.js';
import { normGuest, detectStatus, computeGuestPitchQuality } from './gp-core.js';
import { createProgressHeader, renderProgressBar, renderStepContainers, updateProgressBar } from './gp-ui-render.js';
import { initUIApp } from './ui-app.js';

const appState = {
  guestKey: null,
  guestObj: {},
  questions: []  // your questions list, import or pass here
};

function showStep(stepId) {
  ["step1Form", "step2Form", "step3Form"].forEach(id => {
    document.getElementById(id)?.classList.toggle("hidden", id !== stepId);
  });
}

async function loadGuestFromKey(gid) {
  try {
    let g = await getGuest(gid);
    if (!g) throw new Error("Guest not found");
    g = normGuest(g);
    appState.guestKey = gid;
    appState.guestObj = g;

    // Write UI fields
    // You should create a helper to populate UI fields from g (not shown here)
    populateUIFields(g);

    // Set step based on status
    const status = detectStatus(g);
    let step = "step1Form";
    if (status === "working") step = "step2Form";
    else if (status === "proposal") step = "step3Form";
    showStep(step);

    // Update header with guest key
    updateLeadIdInHeader(gid);

    // Setup progress bar listener
    attachCompletionListener(gid, pct => {
      updateProgressBar(pct);
    });

    // Compute initial progress bar
    const comp = computeGuestPitchQuality(g);
    updateProgressBar(comp.pct);

  } catch (e) {
    console.error(e);
  }
}

async function onNewLeadClicked() {
  try {
    const uid = getCurrentUserUid();
    const newKey = await createNewLead(uid);
    localStorage.setItem("last_guestinfo_key", newKey);
    // Reload with new gid param
    const baseUrl = window.location.pathname;
    window.location.href = `${baseUrl}?gid=${encodeURIComponent(newKey)}&uistart=step1`;
  } catch (e) {
    alert("Error creating new lead: " + e.message);
  }
}

function updateLeadIdInHeader(gid) {
  const leadIdDisplay = document.getElementById("leadIdDisplay");
  if (leadIdDisplay) leadIdDisplay.textContent = `Lead ID: ${gid}`;
}

function populateUIFields(g) {
  // Implement: populate your form fields from guest object g
  // Example:
  document.getElementById("custName").value = g.custName || "";
  document.getElementById("custPhone").value = g.custPhone || "";
  // Similarly for Step 2 fields and solution text
}

function getUrlParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

async function initApp(questions) {
  appState.questions = questions;

  // Render UI skeleton
  const headerElems = createProgressHeader(null, onNewLeadClicked);
  const progressBar = renderProgressBar();
  const steps = renderStepContainers();

  const app = document.getElementById("guestApp");
  app.appendChild(progressBar);
  app.appendChild(steps);

  // Setup event handlers
  initUIApp(questions);

  // On auth
  onAuthStateChanged(async user => {
    if (!user) {
      alert("Please sign in to continue.");
      return;
    }
    const gid = getUrlParam("gid") || localStorage.getItem("last_guestinfo_key");
    if (gid) {
      await loadGuestFromKey(gid);
    }
  });
}

export { initApp };