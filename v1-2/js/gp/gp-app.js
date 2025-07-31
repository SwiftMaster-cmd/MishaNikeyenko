// gp-app.js
import { getGuest, updateGuest, attachCompletionListener } from './gp-firebase.js';

class GuestApp {
  #guestKey = null;
  #guestObj = {};
  #completionUnsub = null;

  constructor() {
    // Bind input events for live saving
    this.initEventListeners();
  }

  get guestKey() {
    return this.#guestKey;
  }

  setGuestKey(key) {
    if (this.#guestKey === key) return;
    this.#guestKey = key;
    this.#guestObj = {};
    if (this.#completionUnsub) {
      this.#completionUnsub(); // detach old listener
      this.#completionUnsub = null;
    }
  }

  async loadContext() {
    if (!this.#guestKey) return;
    try {
      const guest = await getGuest(this.#guestKey);
      if (guest) {
        this.#guestObj = guest;
        this.populateFields(guest);
      } else {
        this.#guestObj = {};
        this.clearFields();
      }
    } catch (e) {
      console.error('Failed to load guest:', e);
    }
  }

  populateFields(guest) {
    const custName = document.getElementById('custName');
    const custPhone = document.getElementById('custPhone');
    const solutionText = document.getElementById('solutionText');

    if (custName) custName.value = guest.custName || '';
    if (custPhone) custPhone.value = guest.custPhone || '';
    if (solutionText) solutionText.value = guest.solution?.text || '';

    // Populate evaluate questions dynamically
    if (guest.evaluate && window.gpQuestions) {
      window.gpQuestions.forEach(q => {
        const el = document.getElementById(q.id);
        if (el) el.value = guest.evaluate[q.id] || '';
      });
    }
  }

  clearFields() {
    ['custName', 'custPhone', 'solutionText'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    if (window.gpQuestions) {
      window.gpQuestions.forEach(q => {
        const el = document.getElementById(q.id);
        if (el) el.value = '';
      });
    }
  }

  readFields() {
    const out = {
      custName: document.getElementById('custName')?.value.trim() || '',
      custPhone: document.getElementById('custPhone')?.value.trim() || '',
      solutionText: document.getElementById('solutionText')?.value.trim() || '',
      evaluate: {}
    };
    if (window.gpQuestions) {
      window.gpQuestions.forEach(q => {
        const el = document.getElementById(q.id);
        out.evaluate[q.id] = el ? el.value.trim() : '';
      });
    }
    return out;
  }

  async saveNow() {
    if (!this.#guestKey) return;
    const data = this.readFields();

    // Compose update payload with timestamps
    const now = Date.now();
    const updates = {
      custName: data.custName,
      custPhone: data.custPhone,
      solution: data.solutionText ? { text: data.solutionText, updatedAt: now } : null,
      evaluate: data.evaluate,
      updatedAt: now,
    };

    try {
      await updateGuest(this.#guestKey, updates);
    } catch (e) {
      console.error('Failed to save guest:', e);
    }
  }

  attachCompletionListener(updateCallback) {
    if (!this.#guestKey) return;
    if (this.#completionUnsub) this.#completionUnsub();

    this.#completionUnsub = attachCompletionListener(this.#guestKey, pct => {
      if (updateCallback && typeof updateCallback === 'function') {
        updateCallback(pct);
      }
    });
  }

  initEventListeners() {
    // Save on input or change in any tracked field
    const saveHandler = this.saveNow.bind(this);

    ['custName', 'custPhone', 'solutionText'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', saveHandler);
        el.addEventListener('change', saveHandler);
      }
    });

    if (window.gpQuestions) {
      window.gpQuestions.forEach(q => {
        const el = document.getElementById(q.id);
        if (el) {
          el.addEventListener('input', saveHandler);
          el.addEventListener('change', saveHandler);
        }
      });
    }
  }
}

// Singleton export
export const gpApp = new GuestApp();