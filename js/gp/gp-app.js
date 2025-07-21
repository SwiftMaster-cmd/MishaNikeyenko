// gp-questions.js -- dynamic, Firebase-backed Step 2 questions with full admin CRUD
// Place at ../js/gp/gp-questions.js; load **after** Firebase SDKs and **before** gp-core.js & gp-ui-render.js

(function(global){
  // ───────────────────────────────────────────────────────────────────────────
  // Firebase reference to questions config
  // ───────────────────────────────────────────────────────────────────────────
  const db           = firebase.database();
  const questionsRef = db.ref("config/questions");

  // In-memory cache + listeners
  let questions = [];
  const updateListeners = [];

  // ───────────────────────────────────────────────────────────────────────────
  // Listen for changes in Firebase and update local cache + UI
  // ───────────────────────────────────────────────────────────────────────────
  questionsRef.on("value", snapshot => {
    const data = snapshot.val() || {};
    questions = Object.entries(data).map(([id, q]) => ({
      id,
      label:   q.label,
      type:    q.type,
      weight:  q.weight,
      options: Array.isArray(q.options) ? q.options : []
    }));

    // expose array
    global.gpQuestions = questions;

    // re-render Step 2 form fields if available
    if (typeof global.renderQuestions === "function") {
      global.renderQuestions("step2Fields");
    }

    // notify admin UIs
    updateListeners.forEach(fn => fn(questions));
  });

  // ───────────────────────────────────────────────────────────────────────────
  // ADMIN CRUD API (only available to admin role)
  // ───────────────────────────────────────────────────────────────────────────
  /**
   * addQuestion(question) → Promise<id>
   *   question: { label, type, weight, options? }
   */
  global.addQuestion = async function({ label, type, weight, options = [] }) {
    const q = { label, type, weight };
    if (type === "select") q.options = options;
    const newRef = await questionsRef.push(q);
    return newRef.key;
  };

  /**
   * updateQuestion(id, question) → Promise<void>
   *   id:       question key
   *   question: same shape as addQuestion
   */
  global.updateQuestion = async function(id, { label, type, weight, options = [] }) {
    const q = { label, type, weight };
    if (type === "select") q.options = options;
    await questionsRef.child(id).set(q);
  };

  /**
   * deleteQuestion(id) → Promise<void>
   */
  global.deleteQuestion = async function(id) {
    await questionsRef.child(id).remove();
  };

  /**
   * onQuestionsUpdated(fn)
   *   fn: callback(questions[]) invoked whenever list changes
   */
  global.onQuestionsUpdated = function(fn) {
    if (typeof fn === "function") updateListeners.push(fn);
  };

  // ───────────────────────────────────────────────────────────────────────────
  // RENDERER for Step 2 questions (used by gp-ui-render.js)
  // ───────────────────────────────────────────────────────────────────────────
  global.renderQuestions = function(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // clear existing
    container.innerHTML = "";

    // build each question field
    questions.forEach(q => {
      const labelEl = document.createElement("label");
      labelEl.className = "glabel";
      labelEl.innerHTML = `${q.label} <span class="gp-pts">(${q.weight}pts)</span>`;

      let field;
      if (q.type === "select") {
        // dropdown picker
        field = document.createElement("select");
        field.className = "gfield";
        field.id = q.id;
        // placeholder
        const opt0 = document.createElement("option");
        opt0.value = "";
        opt0.textContent = "Select…";
        field.appendChild(opt0);
        // each option
        q.options.forEach(opt => {
          const o = document.createElement("option");
          o.value = opt;
          o.textContent = opt;
          field.appendChild(o);
        });
      } else {
        // text or number input
        field = document.createElement("input");
        field.className = "gfield";
        field.id = q.id;
        field.type = q.type;         // "text" or "number"
        field.placeholder = "Enter…";
      }

      labelEl.appendChild(field);
      container.appendChild(labelEl);
    });
  };

})(window);