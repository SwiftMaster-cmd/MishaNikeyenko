// gp-questions.js -- dynamic Step 2 questions with static fallback & Firebase‐backed CRUD
// Place at ../js/gp/gp-questions.js; load after Firebase SDKs and before gp-core.js & gp-ui-render.js

(function(global){
  // ───────────────────────────────────────────────────────────────────────────
  // Static fallback questions (used if config/questions is empty)
  // ───────────────────────────────────────────────────────────────────────────
  const staticQuestions = [
    {
      id:      "deviceStatus",
      label:   "Devices Paid Off?",
      type:    "select",
      weight:  8,
      options: [
        "All Paid Off",
        "Owe Balance",
        "Lease",
        "Mixed",
        "Unknown"
      ]
    },
    {
      id:      "finPath",
      label:   "Financial Path (Postpaid vs Prepaid)",
      type:    "select",
      weight:  12,
      options: [
        "Postpaid OK",
        "Prefer Prepaid/Cash",
        "Credit Concern",
        "Unknown"
      ]
    }
  ];

  // ───────────────────────────────────────────────────────────────────────────
  // In-memory question list & listeners
  // ───────────────────────────────────────────────────────────────────────────
  let questions = [...staticQuestions];
  const updateListeners = [];

  function notifyUpdate() {
    global.gpQuestions = questions;
    updateListeners.forEach(fn => fn(questions));
  }

  global.gpQuestions = questions;
  global.onQuestionsUpdated = function(fn) {
    if (typeof fn === "function") updateListeners.push(fn);
  };

  global.renderQuestions = function(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = "";
    questions.forEach(q => {
      const labelEl = document.createElement("label");
      labelEl.className = "glabel";
      labelEl.innerHTML = `${q.label} <span class="gp-pts">(${q.weight}pts)</span>`;
      let field;
      if (q.type === "select") {
        field = document.createElement("select");
        field.className = "gfield";
        field.id = q.id;
        const opt0 = document.createElement("option");
        opt0.value = ""; opt0.textContent = "Select…";
        field.appendChild(opt0);
        q.options.forEach(opt => {
          const o = document.createElement("option");
          o.value = opt; o.textContent = opt;
          field.appendChild(o);
        });
      } else {
        field = document.createElement("input");
        field.className = "gfield";
        field.id = q.id;
        field.type = q.type; // "text" or "number"
        field.placeholder = "Enter…";
      }
      labelEl.appendChild(field);
      container.appendChild(labelEl);
    });
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Firebase init & override
  // ───────────────────────────────────────────────────────────────────────────
  if (global.firebase && firebase.database) {
    // ensure default app
    if (!firebase.apps.length) {
      const cfg = global.GP_FIREBASE_CONFIG || {/* your config */};
      firebase.initializeApp(cfg);
    }
    const db  = firebase.database();
    const ref = db.ref("config/questions");

    ref.on("value", snap => {
      const data = snap.val();
      if (data && Object.keys(data).length) {
        // override with real data
        questions = Object.entries(data).map(([id,q]) => ({
          id,
          label:   q.label,
          type:    q.type,
          weight:  q.weight,
          options: Array.isArray(q.options) ? q.options : []
        }));
      } else {
        // no questions in DB → keep static fallback
        questions = [...staticQuestions];
      }
      notifyUpdate();
      if (typeof global.renderQuestions === "function") {
        global.renderQuestions("step2Fields");
      }
    });

    // ADMIN CRUD
    global.addQuestion = async function({ label, type, weight, options=[] }) {
      const q = { label, type, weight };
      if (type === "select") q.options = options;
      const newRef = await ref.push(q);
      return newRef.key;
    };
    global.updateQuestion = async function(id, { label, type, weight, options=[] }) {
      const q = { label, type, weight };
      if (type === "select") q.options = options;
      await ref.child(id).set(q);
    };
    global.deleteQuestion = async function(id) {
      await ref.child(id).remove();
    };
  }

})(window);