import {
  firebaseOnAuthStateChanged,
  signIn,
  getCurrentUserUid,
  createNewLead,
  getGuest,
  updateGuest,
  attachCompletionListener
} from "./gp-firebase.js";

const gpQuestions = [
  { id: "currentPlan", label: "What plan are you currently on and how much do you pay per month?", type: "text", weight: 15 },
  { id: "topFrustration", label: "What’s your #1 frustration with your current carrier or service?", type: "text", weight: 14 },
  { id: "familyNeeds", label: "Is your account just for you or do you have family members using your plan?", type: "text", weight: 12 },
  { id: "coveragePriority", label: "How important is coverage where you live, work, or travel?", type: "text", weight: 10 },
  { id: "dataUsage", label: "Do you ever run into issues with slow data or data limits?", type: "text", weight: 8 }
];

// App logic
export class GuestFormApp {
  constructor({ onLeadChange, onProgressUpdate }) {
    this.onLeadChange = onLeadChange;
    this.onProgressUpdate = onProgressUpdate;

    this.progressBar = document.getElementById("progressBar");
    this.progressLabel = document.getElementById("progressLabel");
    this.leadIdText = document.getElementById("leadIdText");

    this.custNameInput = document.getElementById("custName");
    this.custPhoneInput = document.getElementById("custPhone");
    this.solutionText = document.getElementById("solutionText");
    this.step2Container = document.getElementById("step2Fields");

    this.guestKey = null;
    this.guestData = {};

    this.debounceTimeout = null;

    this.initInputs();
    this.renderStep2Fields();
  }

  initInputs() {
    [this.custNameInput, this.custPhoneInput, this.solutionText].forEach(input => {
      if (input) input.addEventListener("input", () => this.saveGuestDebounced());
    });
  }

  renderStep2Fields() {
    if (!this.step2Container) return;
    this.step2Container.innerHTML = "";
    gpQuestions.forEach(q => {
      const label = document.createElement("label");
      label.textContent = q.label + ` (${q.weight} pts)`;

      const input = document.createElement("input");
      input.type = q.type === "number" ? "number" : "text";
      input.id = q.id;
      input.value = "";
      input.addEventListener("input", () => this.saveGuestDebounced());

      label.appendChild(input);
      this.step2Container.appendChild(label);
    });
  }

  saveGuestDebounced() {
    clearTimeout(this.debounceTimeout);
    this.debounceTimeout = setTimeout(() => this.saveGuestNow(), 500);
  }

  calculateProgress(data) {
    const weights = { custName: 8, custPhone: 7, solution: 25 };
    let earned = 0, total = 0;
    if (data.custName && data.custName.trim()) earned += weights.custName;
    total += weights.custName;
    if (data.custPhone && data.custPhone.trim()) earned += weights.custPhone;
    total += weights.custPhone;
    if (data.solution?.text && data.solution.text.trim()) earned += weights.solution;
    total += weights.solution;
    gpQuestions.forEach(q => {
      total += q.weight;
      if (data.evaluate && data.evaluate[q.id] && data.evaluate[q.id].trim()) earned += q.weight;
    });
    return Math.round((earned / total) * 100);
  }

  async saveGuestNow() {
    if (!this.guestKey) return;
    const evaluateData = {};
    gpQuestions.forEach(q => {
      const el = document.getElementById(q.id);
      evaluateData[q.id] = el ? el.value.trim() : "";
    });
    const dataToSave = {
      custName: this.custNameInput?.value.trim() || "",
      custPhone: this.custPhoneInput?.value.trim() || "",
      solution: { text: this.solutionText?.value.trim() || "" },
      evaluate: evaluateData,
      updatedAt: Date.now()
    };
    dataToSave.completionPct = this.calculateProgress(dataToSave);
    if (this.onProgressUpdate) this.onProgressUpdate(dataToSave.completionPct);
    try { await updateGuest(this.guestKey, dataToSave); }
    catch (e) { console.error("Error saving guest:", e); }
  }

  async loadGuest(gid) {
    if (!gid) return;
    try {
      const guest = await getGuest(gid);
      if (!guest) return;
      this.guestKey = gid;
      this.guestData = guest;
      if (this.custNameInput) this.custNameInput.value = guest.custName || "";
      if (this.custPhoneInput) this.custPhoneInput.value = guest.custPhone || "";
      if (this.solutionText) this.solutionText.value = guest.solution?.text || "";
      gpQuestions.forEach(q => {
        const el = document.getElementById(q.id);
        if (el) el.value = guest.evaluate?.[q.id] || "";
      });
      if (this.onLeadChange) this.onLeadChange(this.guestKey);
      const progress = guest.completionPct ?? this.calculateProgress(guest);
      if (this.onProgressUpdate) this.onProgressUpdate(progress);
      attachCompletionListener(this.guestKey, (pct) => {
        if (this.onProgressUpdate) this.onProgressUpdate(pct);
      });
    } catch (e) {
      console.error("Error loading guest:", e);
    }
  }

  async createNewLead() {
    try {
      const uid = getCurrentUserUid();
      const newKey = await createNewLead(uid);
      await this.loadGuest(newKey);
      if (this.onLeadChange) this.onLeadChange(newKey);
      return newKey;
    } catch (e) {
      console.error("Error creating new lead:", e);
      return null;
    }
  }
}

// ---- UI Logic ----

// Reference DOM nodes ONCE
const progressLabel = document.getElementById("progressLabel");
const leadIdText = document.getElementById("leadIdText");
const progressBar = document.getElementById("progressBar");
const dashboardBtn = document.getElementById("dashboardBtn");
const newLeadBtn = document.getElementById("newLeadBtn");

let leadIdTimeout = null;

// % click to reveal lead ID
progressLabel.addEventListener("click", () => {
  if (leadIdText.classList.contains("hidden")) {
    leadIdText.classList.remove("hidden");
    clearTimeout(leadIdTimeout);
    leadIdTimeout = setTimeout(() => leadIdText.classList.add("hidden"), 3000);
  } else {
    leadIdText.classList.add("hidden");
  }
});

// Set lead ID
function setLeadId(leadId) {
  leadIdText.textContent = leadId || "--";
  leadIdText.classList.add("hidden");
}

// Set progress value + %
function setProgress(pct) {
  progressBar.value = pct;
  progressLabel.textContent = pct + "%";
}

// Back to dashboard
dashboardBtn.onclick = () => {
  window.location.href = "../html/admin.html";
};

// New lead (calls your app logic)
newLeadBtn.onclick = async () => {
  if (window.gpApp && typeof window.gpApp.createNewLead === "function") {
    await window.gpApp.createNewLead();
  }
};

// ---- Firebase Auth/App Init ----
firebaseOnAuthStateChanged(async (user) => {
  if (user) {
    document.getElementById("authContainer").style.display = "none";
    document.getElementById("guestApp").style.display = "block";

    const app = new GuestFormApp({
      onLeadChange: (id) => {
        setLeadId(id);
        localStorage.setItem("last_guestinfo_key", id);
      },
      onProgressUpdate: (pct) => {
        setProgress(pct);
      }
    });

    window.gpApp = app;

    let lastLead = localStorage.getItem("last_guestinfo_key");
    if (!lastLead) lastLead = await app.createNewLead();
    await app.loadGuest(lastLead);

  } else {
    document.getElementById("authContainer").style.display = "block";
    document.getElementById("guestApp").style.display = "none";
  }
});