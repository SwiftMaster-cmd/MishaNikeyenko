// gp-app.js
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
  { id: "numLines", label: "How many lines do you need?", type: "number", weight: 15 },
  { id: "carrier", label: "Current Carrier", type: "text", weight: 14 },
  { id: "deviceStatus", label: "Device Status", type: "text", weight: 12 },
  { id: "usage", label: "Phone Usage", type: "text", weight: 6 },
  { id: "promos", label: "Interested in promos?", type: "text", weight: 2 }
];

export class GuestFormApp {
  constructor({ onLeadChange, onProgressUpdate }) {
    this.onLeadChange = onLeadChange;
    this.onProgressUpdate = onProgressUpdate;

    this.leadIdDisplay = document.getElementById("leadIdDisplay");
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
      input.addEventListener("input", () => this.saveGuestDebounced());
    });
  }

  renderStep2Fields() {
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

  async saveGuestNow() {
    if (!this.guestKey) return;

    const evaluateData = {};
    gpQuestions.forEach(q => {
      const val = document.getElementById(q.id)?.value.trim() || "";
      evaluateData[q.id] = val;
    });

    const dataToSave = {
      custName: this.custNameInput.value.trim(),
      custPhone: this.custPhoneInput.value.trim(),
      solution: { text: this.solutionText.value.trim() },
      evaluate: evaluateData,
      updatedAt: Date.now()
    };

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

      this.custNameInput.value = guest.custName || "";
      this.custPhoneInput.value = guest.custPhone || "";
      this.solutionText.value = guest.solution?.text || "";

      gpQuestions.forEach(q => {
        const el = document.getElementById(q.id);
        if (el) el.value = guest.evaluate?.[q.id] || "";
      });

      if (this.onLeadChange) this.onLeadChange(this.guestKey);

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
    } catch (e) {
      console.error("Error creating new lead:", e);
    }
  }
}

// ----------- AUTH AND UI LOGIC -------------

const emailInput = document.getElementById("emailInput");
const passwordInput = document.getElementById("passwordInput");
const signInBtn = document.getElementById("signInBtn");
const errorMsg = document.getElementById("errorMsg");

signInBtn.addEventListener("click", async () => {
  errorMsg.textContent = "";
  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();
  if (!email || !password) {
    errorMsg.textContent = "Please enter email and password.";
    return;
  }
  try {
    await signIn(email, password);
    // onAuthStateChanged will handle UI switch
  } catch (error) {
    errorMsg.textContent = "Sign in failed: " + error.message;
  }
});

firebaseOnAuthStateChanged(async (user) => {
  if (user) {
    document.getElementById("authContainer").style.display = "none";
    document.getElementById("guestApp").style.display = "block";

    const app = new GuestFormApp({
      onLeadChange: (id) => {
        document.getElementById("leadIdDisplay").textContent = `Lead ID: ${id}`;
        localStorage.setItem("last_guestinfo_key", id);
      },
      onProgressUpdate: (pct) => {
        document.getElementById("progressBar").value = pct;
        document.getElementById("progressLabel").textContent = pct + "%";
      }
    });

    const lastLead = localStorage.getItem("last_guestinfo_key");
    if (lastLead) await app.loadGuest(lastLead);

    document.getElementById("newLeadBtn").onclick = async () => {
      await app.createNewLead();
    };
  } else {
    document.getElementById("authContainer").style.display = "block";
    document.getElementById("guestApp").style.display = "none";
  }
});