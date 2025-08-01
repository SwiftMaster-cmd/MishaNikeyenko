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
  { id: "carrier", label: "What carrier are you with right now?", type: "text", weight: 15 },
  { id: "tenure", label: "How long have you been with them?", type: "text", weight: 14 },
  { id: "satisfaction", label: "What do you like most about your current service?", type: "text", weight: 12 },
  { id: "issues", label: "Any issues with coverage, billing, or support?", type: "text", weight: 10 },
  { id: "contract", label: "Are you in a contract or month-to-month?", type: "text", weight: 8 }
];

export class GuestFormApp {
  constructor({ onLeadChange, onProgressUpdate }) {
    this.onLeadChange = onLeadChange;
    this.onProgressUpdate = onProgressUpdate;

    this.progressBar = document.getElementById("progressBar");
    this.progressLabel = document.getElementById("progressLabel");

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
    const weights = {
      custName: 8,
      custPhone: 7,
      solution: 25
    };

    let earned = 0;
    let total = 0;

    if (data.custName && data.custName.trim()) earned += weights.custName;
    total += weights.custName;

    if (data.custPhone && data.custPhone.trim()) earned += weights.custPhone;
    total += weights.custPhone;

    if (data.solution?.text && data.solution.text.trim()) earned += weights.solution;
    total += weights.solution;

    gpQuestions.forEach(q => {
      total += q.weight;
      if (data.evaluate && data.evaluate[q.id] && data.evaluate[q.id].trim()) {
        earned += q.weight;
      }
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

    try {
      await updateGuest(this.guestKey, dataToSave);
    } catch (e) {
      console.error("Error saving guest:", e);
    }
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

/* ==========================================================================
   HEADER / PROGRESS / LEAD ID UI LOGIC
   ========================================================================== */
const progressLabel = document.getElementById("progressLabel");
const leadIdText = document.getElementById("leadIdText");
let leadIdTimeout = null;

progressLabel.addEventListener("click", () => {
  if (leadIdText.classList.contains("hidden")) {
    leadIdText.classList.remove("hidden");
    clearTimeout(leadIdTimeout);
    leadIdTimeout = setTimeout(() => {
      leadIdText.classList.add("hidden");
    }, 3000);
  } else {
    leadIdText.classList.add("hidden");
  }
});

// Update lead ID in UI
function setLeadId(leadId) {
  leadIdText.textContent = leadId || "--";
  leadIdText.classList.add("hidden");
}
// Update progress bar and % in UI
function setProgress(pct) {
  document.getElementById("progressBar").value = pct;
  progressLabel.textContent = pct + "%";
}

// Dashboard/back button handler (customize as needed)
document.getElementById("dashboardBtn").onclick = () => {
  // Implement navigation as you wish
  window.location.href = "/dashboard"; // or custom logic
};

// New lead button handler (calls your app logic)
document.getElementById("newLeadBtn").onclick = async () => {
  if (window.gpApp && typeof window.gpApp.createNewLead === "function") {
    await window.gpApp.createNewLead();
  }
};

/* ==========================================================================
   AUTH AND APP INITIALIZATION
   ========================================================================== */
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

    window.gpApp = app; // expose globally

    let lastLead = localStorage.getItem("last_guestinfo_key");
    if (!lastLead) {
      lastLead = await app.createNewLead();
    }
    await app.loadGuest(lastLead);

    // No need for newLeadBtn.onclick here, handled above
  } else {
    document.getElementById("authContainer").style.display = "block";
    document.getElementById("guestApp").style.display = "none";
  }
});