// gp-app.js
import {
  firebaseOnAuthStateChanged,
  createNewLead,
  getGuest,
  updateGuest,
  listenCompletionPct,
  getCurrentUserUid
} from './gp-firebase.js';

export class GuestFormApp {
  constructor({ onLeadChange, onProgressUpdate }) {
    this.guestKey = null;
    this.guestData = {};
    this.onLeadChange = onLeadChange;
    this.onProgressUpdate = onProgressUpdate;
    this.uiStep = "step1";

    // Bind UI Elements
    this.inputs = {
      custName: document.getElementById("custName"),
      custPhone: document.getElementById("custPhone"),
      solutionText: document.getElementById("solutionText"),
    };

    // Assume gpQuestions is globally available or importable
    this.questions = window.gpQuestions || [];

    this.attachEvents();
  }

  attachEvents() {
    // Live save for customer info
    ['custName', 'custPhone'].forEach(id => {
      const input = this.inputs[id];
      if (!input) return;
      input.addEventListener('input', this.debounce(() => this.saveCurrentGuest(), 300));
    });

    // Live save for solution text
    if (this.inputs.solutionText) {
      this.inputs.solutionText.addEventListener('input', this.debounce(() => this.saveCurrentGuest(), 300));
    }

    // Live save for Step 2 (evaluate questions)
    this.questions.forEach(q => {
      const el = document.getElementById(q.id);
      if (!el) return;
      const ev = q.type === 'select' ? 'change' : 'input';
      el.addEventListener(ev, this.debounce(() => this.saveCurrentGuest(), 300));
    });
  }

  debounce(fn, delay = 300) {
    let timeoutId;
    return (...args) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  async createNewLead() {
    const uid = getCurrentUserUid();
    const newKey = await createNewLead(uid);
    this.guestKey = newKey;
    this.guestData = {};
    if (this.onLeadChange) this.onLeadChange(newKey);
    await this.loadGuest(newKey);
  }

  async loadGuest(gid) {
    const guest = await getGuest(gid);
    if (!guest) {
      this.guestKey = null;
      this.guestData = {};
      this.resetForm();
      return;
    }
    this.guestKey = gid;
    this.guestData = guest;

    this.writeFields(guest);
    if (this.onLeadChange) this.onLeadChange(gid);

    // Listen for completionPct changes
    if (this.unsubCompletion) this.unsubCompletion(); // unsubscribe previous
    this.unsubCompletion = listenCompletionPct(gid, pct => {
      if (this.onProgressUpdate) this.onProgressUpdate(pct);
    });
  }

  writeFields(g) {
    if (this.inputs.custName) this.inputs.custName.value = g.custName || "";
    if (this.inputs.custPhone) this.inputs.custPhone.value = g.custPhone || "";
    if (this.inputs.solutionText) this.inputs.solutionText.value = g.solution?.text || "";

    this.questions.forEach(q => {
      const el = document.getElementById(q.id);
      if (!el) return;
      el.value = g.evaluate?.[q.id] ?? "";
    });
  }

  readFields() {
    const out = {
      custName: this.inputs.custName?.value.trim() || "",
      custPhone: this.inputs.custPhone?.value.trim() || "",
      solutionText: this.inputs.solutionText?.value.trim() || "",
      evaluate: {}
    };
    this.questions.forEach(q => {
      const el = document.getElementById(q.id);
      out.evaluate[q.id] = el ? el.value.trim() : "";
    });
    return out;
  }

  async saveCurrentGuest() {
    if (!this.guestKey) return; // no guest to update

    const fields = this.readFields();
    const now = Date.now();

    // Determine status (can be replaced with your own logic)
    const status = (fields.solutionText && fields.solutionText.length > 0) ? "proposal" : "working";

    const updates = {
      custName: fields.custName,
      custPhone: fields.custPhone,
      evaluate: fields.evaluate,
      solution: { text: fields.solutionText, completedAt: now },
      updatedAt: now,
      status
    };

    try {
      await updateGuest(this.guestKey, updates);
    } catch (err) {
      console.error("Error saving guest:", err);
    }
  }

  resetForm() {
    Object.values(this.inputs).forEach(input => {
      if (input) input.value = "";
    });
    this.questions.forEach(q => {
      const el = document.getElementById(q.id);
      if (el) el.value = "";
    });
  }
}