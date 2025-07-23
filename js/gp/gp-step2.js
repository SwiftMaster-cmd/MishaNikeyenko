// gp-step2.js -- standalone Step 2 Evaluate module with full logging

(function(global){
  const containerId = "step2Fields";

  // Step 2 questions defined here directly
  const questions = [
    // ... (your questions array unchanged)
    {
      id: "numLines",
      label: "How many lines do you need on your account?",
      type: "number",
      weight: 15
    },
    {
      id: "carrier",
      label: "What carrier are you with right now?",
      type: "select",
      weight: 14,
      options: ["Verizon","AT&T","T-Mobile","US Cellular","Cricket","Metro","Boost","Straight Talk","Tracfone","Other"]
    },
    // ... rest of questions ...
  ];

  const el = id => {
    const element = document.getElementById(id);
    if (!element) console.warn(`[gpStep2] Element not found: ${id}`);
    return element;
  };

  function debounce(fn, delay=300) {
    let timer=null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        console.log(`[gpStep2] Debounced function executing with args:`, args);
        fn(...args);
      }, delay);
    };
  }

  function renderStep2UI() {
    const container = el(containerId);
    if (!container) {
      console.error(`[gpStep2] Container #${containerId} not found! Cannot render Step 2 UI.`);
      return;
    }
    console.log("[gpStep2] Rendering Step 2 UI...");
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
      console.log(`[gpStep2] Rendered question: ${q.id}`);
    });

    console.log("[gpStep2] Step 2 UI render complete.");
  }

  function readFields() {
    const data = {};
    questions.forEach(q => {
      const field = el(q.id);
      if (!field) {
        console.warn(`[gpStep2] Cannot read value - field missing: ${q.id}`);
        data[q.id] = "";
        return;
      }
      data[q.id] = field.value.trim();
      console.log(`[gpStep2] Read field ${q.id}:`, data[q.id]);
    });
    console.log("[gpStep2] Completed reading all fields:", data);
    return data;
  }

  function writeFields(data) {
    console.log("[gpStep2] Writing data to fields:", data);
    questions.forEach(q => {
      const field = el(q.id);
      if (!field) {
        console.warn(`[gpStep2] Cannot write value - field missing: ${q.id}`);
        return;
      }
      const val = data[q.id] || "";
      field.value = val;
      console.log(`[gpStep2] Wrote field ${q.id}:`, val);
    });
  }

  function bindSaveEvents(saveCallback) {
    if (typeof saveCallback !== "function") {
      console.error("[gpStep2] bindSaveEvents called without valid saveCallback function");
      return;
    }
    console.log("[gpStep2] Binding save events to inputs...");
    questions.forEach(q => {
      const field = el(q.id);
      if (!field) {
        console.warn(`[gpStep2] Cannot bind event - field missing: ${q.id}`);
        return;
      }
      const eventName = q.type === "select" ? "change" : "input";
      const debounced = debounce(() => {
        console.log(`[gpStep2] Event '${eventName}' fired for field: ${q.id}`);
        saveCallback(readFields());
      }, 300);
      field.addEventListener(eventName, debounced);
      console.log(`[gpStep2] Bound '${eventName}' event for field: ${q.id}`);
    });
  }

  async function init(saveCallback, loadData = {}) {
    console.log("[gpStep2] Initializing Step 2 module...");
    renderStep2UI();
    writeFields(loadData);
    bindSaveEvents(saveCallback);
    console.log("[gpStep2] Initialization complete.");
  }

  global.gpStep2 = {
    init,
    readFields,
    writeFields,
    questions
  };

})(window);