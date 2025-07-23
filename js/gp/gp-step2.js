// gp-step2.js -- standalone Step 2 Evaluate module with embedded questions

(function(global){
  const containerId = "step2Fields";

  // Step 2 questions defined here directly
  const questions = [
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
    {
      id: "monthlySpend",
      label: "What do you usually pay each month for phone service?",
      type: "number",
      weight: 13
    },
    {
      id: "deviceStatus",
      label: "Is your phone paid off, or do you still owe on it?",
      type: "select",
      weight: 12,
      options: ["Paid Off","Still Owe","Lease","Mixed","Not Sure"]
    },
    {
      id: "upgradeInterest",
      label: "Are you looking to upgrade your phone, or keep what you have?",
      type: "select",
      weight: 11,
      options: ["Upgrade","Keep Current","Not Sure"]
    },
    {
      id: "otherDevices",
      label: "Do you have any other devices--tablets, smartwatches, or hotspots?",
      type: "select",
      weight: 10,
      options: ["Tablet","Smartwatch","Hotspot","Multiple","None"]
    },
    {
      id: "coverage",
      label: "How’s your coverage at home and at work?",
      type: "select",
      weight: 9,
      options: ["Great","Good","Average","Poor","Not Sure"]
    },
    {
      id: "travel",
      label: "Do you travel out of state or internationally?",
      type: "select",
      weight: 8,
      options: ["Yes, both","Just out of state","International","Rarely","Never"]
    },
    {
      id: "hotspot",
      label: "Do you use your phone as a hotspot?",
      type: "select",
      weight: 7,
      options: ["Yes, often","Sometimes","Rarely","Never"]
    },
    {
      id: "usage",
      label: "How do you mainly use your phone? (Streaming, gaming, social, work, calls/texts)",
      type: "text",
      weight: 6
    },
    {
      id: "discounts",
      label: "Anyone on your plan get discounts? (Military, student, senior, first responder)",
      type: "select",
      weight: 5,
      options: ["Military","Student","Senior","First Responder","No","Not Sure"]
    },
    {
      id: "keepNumber",
      label: "Do you want to keep your current number(s) if you switch?",
      type: "select",
      weight: 5,
      options: ["Yes","No","Not Sure"]
    },
    {
      id: "issues",
      label: "Have you had any issues with dropped calls or slow data?",
      type: "select",
      weight: 4,
      options: ["Yes","No","Sometimes"]
    },
    {
      id: "planPriority",
      label: "What’s most important to you in a phone plan? (Price, coverage, upgrades, service)",
      type: "text",
      weight: 3
    },
    {
      id: "promos",
      label: "Would you like to see your options for lower monthly cost or free device promos?",
      type: "select",
      weight: 2,
      options: ["Yes","No","Maybe"]
    }
  ];

  const el = id => document.getElementById(id);

  function debounce(fn, delay=300) {
    let timer=null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

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

  function readFields() {
    const data = {};
    questions.forEach(q => {
      const field = el(q.id);
      if (!field) return;
      data[q.id] = field.value.trim();
    });
    return data;
  }

  function writeFields(data) {
    questions.forEach(q => {
      const field = el(q.id);
      if (!field) return;
      field.value = data[q.id] || "";
    });
  }

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

  async function init(saveCallback, loadData = {}) {
    renderStep2UI();
    writeFields(loadData);
    bindSaveEvents(saveCallback);
  }

  global.gpStep2 = {
    init,
    readFields,
    writeFields,
    questions // expose questions if needed externally
  };

})(window);