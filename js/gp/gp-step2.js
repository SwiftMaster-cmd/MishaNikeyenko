// gp-step2.js -- standalone Step 2 Evaluate module

(function(global){
  const containerId = "step2Fields";

  // Replace or assign your dynamic Step 2 questions here or before calling init()
  let questions = global.gpQuestions || [];

  const el = id => document.getElementById(id);

  function debounce(fn, delay=300) {
    let timer=null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  // Render Step 2 question inputs
  function renderStep2UI() {
    const container = el(containerId);
    if (!container) return;
    container.innerHTML = "";

    questions.forEach(q => {
      let html = "";
      if (q.type === "text" || q.type === "number") {
        html = `<label class="glabel" style="display:block; margin-bottom:14px; font-weight:600; color:#444;">
          ${q.label} <span class="gp-pts">(${q.weight}pts)</span>
          <input
            class="gfield"
            type="${q.type}"
            id="${q.id}"
            name="${q.id}"
            style="width:100%; padding:10px; border-radius:6px; border:1px solid #ccc; font-size:16px; margin-top:6px;"
            autocomplete="off"
          />
        </label>`;
      } else if (q.type === "select" && Array.isArray(q.options)) {
        html = `<label class="glabel" style="display:block; margin-bottom:14px; font-weight:600; color:#444;">
          ${q.label} <span class="gp-pts">(${q.weight}pts)</span>
          <select
            class="gfield"
            id="${q.id}"
            name="${q.id}"
            style="width:100%; padding:10px; border-radius:6px; border:1px solid #ccc; font-size:16px; margin-top:6px;"
          >
            <option value="">-- Select --</option>
            ${q.options.map(opt => `<option value="${opt}">${opt}</option>`).join("")}
          </select>
        </label>`;
      }
      container.insertAdjacentHTML("beforeend", html);
    });
  }

  // Read all Step 2 inputs values into an object
  function readFields() {
    const data = {};
    questions.forEach(q => {
      const field = el(q.id);
      if (!field) return;
      data[q.id] = field.value.trim();
    });
    return data;
  }

  // Write values into Step 2 inputs
  function writeFields(data) {
    questions.forEach(q => {
      const field = el(q.id);
      if (!field) return;
      field.value = data[q.id] || "";
    });
  }

  // Bind event listeners to inputs for live save calls
  function bindSaveEvents(saveCallback) {
    if (typeof saveCallback !== "function") return;
    questions.forEach(q => {
      const field = el(q.id);
      if (!field) return;
      const eventName = q.type === "select" ? "change" : "input";
      const debounced = debounce(() => {
        saveCallback(readFields());
      }, 300);
      field.addEventListener(eventName, debounced);
    });
  }

  // Initialize Step 2 UI and bind save event handlers
  async function init(saveCallback, loadData = {}) {
    renderStep2UI();
    writeFields(loadData);
    bindSaveEvents(saveCallback);
  }

  // Expose module API
  global.gpStep2 = {
    init,
    readFields,
    writeFields
  };

})(window);