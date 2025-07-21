// gp-questions.js -- dynamic question definitions for Step 2
// Place this file at ../js/gp/gp-questions.js and load it before gp-core.js & gp-ui-render.js

(function(global){
  /**
   * QUESTION BANK
   *
   * Admins can edit this array at runtime or replace it with
   * a fetch() from a backend to add/remove questions dynamically.
   *
   * Each question object must have:
   *  - id:      unique key (used for input id & data storage)
   *  - label:   the question text shown to users
   *  - type:    "text" | "number" | "select"
   *  - weight:  point value for scoring
   *  - options: array of strings (only for type === "select")
   */
  const questions = [
    {
      id:     "deviceStatus",
      label:  "Devices Paid Off?",
      type:   "select",
      weight: 8,
      options: [
        "All Paid Off",
        "Owe Balance",
        "Lease",
        "Mixed",
        "Unknown"
      ]
    },
    {
      id:     "finPath",
      label:  "Financial Path (Postpaid vs Prepaid)",
      type:   "select",
      weight: 12,
      options: [
        "Postpaid OK",
        "Prefer Prepaid/Cash",
        "Credit Concern",
        "Unknown"
      ]
    }
    // ─────────────────────────────────────────────────────────────────────
    // Admins: Add new question objects here to extend Step 2.
    // Example text question:
    // {
    //   id:     "specialOffer",
    //   label:  "Interested in Special Offers?",
    //   type:   "text",
    //   weight: 5
    // }
    // Example number question:
    // {
    //   id:     "numDevices",
    //   label:  "Number of Devices",
    //   type:   "number",
    //   weight: 4
    // }
  ];

  // Expose the questions array
  global.gpQuestions = questions;

  /**
   * renderQuestions(containerId)
   *   - containerId: the id of the element (<div>) where questions should be rendered
   *
   * This function clears the container, iterates over gpQuestions,
   * and injects the appropriate <label> + <input> or <select> for each.
   */
  global.renderQuestions = function(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // clear any existing content
    container.innerHTML = "";

    // iterate and build fields
    questions.forEach(q => {
      // wrapper <label>
      const label = document.createElement("label");
      label.className = "glabel";
      label.innerHTML = `
        ${q.label} <span class="gp-pts">(${q.weight}pts)</span>
      `;

      // input or select
      let field;
      if (q.type === "select") {
        field = document.createElement("select");
        field.className = "gfield";
        field.id = q.id;
        // add placeholder option
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "Select…";
        field.appendChild(placeholder);
        // add each option
        q.options.forEach(opt => {
          const o = document.createElement("option");
          o.value = opt;
          o.textContent = opt;
          field.appendChild(o);
        });
      } else {
        field = document.createElement("input");
        field.className = "gfield";
        field.id = q.id;
        field.type = q.type;               // "text" or "number"
        field.placeholder = "Enter…";
      }

      // append the field into label, then label into container
      label.appendChild(field);
      container.appendChild(label);
    });
  };

})(window);