// step-ui.js -- Full Step 2 rendering with 2-mode support, save logic, and debug logs
(function(global){
  const staticQuestions = [
    { id: "numLines",       label: "How many lines do you need on your account?",                        type: "number", weight: 15 },
    { id: "carrier",        label: "What carrier are you with right now?",                              type: "select", weight: 14, options: ["Verizon","AT&T","T-Mobile","US Cellular","Cricket","Metro","Boost","Straight Talk","Tracfone","Other"] },
    { id: "monthlySpend",   label: "What do you usually pay each month for phone service?",             type: "number", weight: 13 },
    { id: "deviceStatus",   label: "Is your phone paid off, or do you still owe on it?",               type: "select", weight: 12, options: ["Paid Off","Still Owe","Lease","Mixed","Not Sure"] },
    { id: "upgradeInterest",label: "Are you looking to upgrade your phone, or keep what you have?",    type: "select", weight: 11, options: ["Upgrade","Keep Current","Not Sure"] },
    { id: "otherDevices",   label: "Do you have any other devices--tablets, smartwatches, or hotspots?", type: "select", weight: 10, options: ["Tablet","Smartwatch","Hotspot","Multiple","None"] },
    { id: "coverage",       label: "How’s your coverage at home and at work?",                           type: "select", weight: 9,  options: ["Great","Good","Average","Poor","Not Sure"] },
    { id: "travel",         label: "Do you travel out of state or internationally?",                    type: "select", weight: 8,  options: ["Yes, both","Just out of state","International","Rarely","Never"] },
    { id: "hotspot",        label: "Do you use your phone as a hotspot?",                                type: "select", weight: 7,  options: ["Yes, often","Sometimes","Rarely","Never"] },
    { id: "usage",          label: "How do you mainly use your phone? (Streaming, gaming, social…)",    type: "text",   weight: 6 },
    { id: "discounts",      label: "Anyone on your plan get discounts? (Military, student…)",          type: "select", weight: 5,  options: ["Military","Student","Senior","First Responder","No","Not Sure"] },
    { id: "keepNumber",     label: "Do you want to keep your current number(s) if you switch?",          type: "select", weight: 5,  options: ["Yes","No","Not Sure"] },
    { id: "issues",         label: "Have you had any issues with dropped calls or slow data?",          type: "select", weight: 4,  options: ["Yes","No","Sometimes"] },
    { id: "planPriority",   label: "What’s most important to you in a phone plan? (Price, coverage…)", type: "text",   weight: 3 },
    { id: "promos",         label: "Would you like to see your options for lower cost or promos?",      type: "select", weight: 2,  options: ["Yes","No","Maybe"] }
  ];
  global.staticQuestions = staticQuestions;
  global.gpQuestions     = staticQuestions;

  const answers = {};
  global.answers = answers;

  // Debounce helper
  function debounce(fn, delay=300) {
    let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), delay); };
  }

  // Save a single field to Firebase (and update completion)
  function saveFieldToFirebase(id, value, pts) {
    const key = global.gpApp?.guestKey;
    if (!key) {
      console.warn("No guestKey found, skipping save");
      return;
    }
    const update = {};
    update[`guestinfo/${key}/evaluate/${id}`] = value;
    firebase.database().ref().update(update);

    const maxPts = staticQuestions.reduce((s,q)=>s+q.weight,0) + 8 + 7 + 25;
    const totPts = Object.values(answers).reduce((s,a)=>s+a.points,0);
    const pct    = Math.min(100, Math.round(totPts/maxPts*100));
    firebase.database().ref(`guestinfo/${key}/completionPct`).set(pct);
  }

  // ==== Render Fast Questions (Experienced) ====
  function renderFastQuestions(containerId) {
    console.log("[Step2] renderFastQuestions triggered");
    const container = document.getElementById(containerId);
    if (!container) {
      console.error(`[Step2] Container '${containerId}' not found`);
      return;
    }
    container.innerHTML = "";
    staticQuestions.forEach(q => {
      let html;
      if (q.type === "text" || q.type === "number") {
        html = `
          <label class="glabel" for="${q.id}">
            ${q.label} <span class="gp-pts">(${q.weight}pts)</span>
            <input id="${q.id}" type="${q.type}" autocomplete="off" class="ginput">
          </label>
        `;
      } else {
        html = `
          <label class="glabel" for="${q.id}">
            ${q.label} <span class="gp-pts">(${q.weight}pts)</span>
            <select id="${q.id}" class="ginput">
              <option value="">-- Select --</option>
              ${q.options.map(o => `<option value="${o}">${o}</option>`).join("")}
            </select>
          </label>
        `;
      }
      container.insertAdjacentHTML("beforeend", html);
      const input = document.getElementById(q.id);
      if (!input) {
        console.warn(`[Step2] Input ${q.id} not found after insert`);
        return;
      }
      const ev = q.type === "select" ? "change" : "input";
      input.addEventListener(ev, debounce(() => {
        const v = input.value.trim();
        const pts = v === "" ? 0 : q.weight;
        answers[q.id] = { value: v, points: pts };
        saveFieldToFirebase(q.id, v, pts);
      }, 300));
    });
  }
  global.renderFastQuestions = renderFastQuestions;

  // ==== Render Guided Questions (Newbies) ====
  function renderGuidedQuestions(containerId) {
    console.log("[Step2] renderGuidedQuestions triggered");
    const container = document.getElementById(containerId);
    if (!container) {
      console.error(`[Step2] Container '${containerId}' not found`);
      return;
    }
    container.innerHTML = "";

    let currentStep = 0;

    // Create UI elements
    const label = document.createElement("label");
    label.className = "glabel";
    const ptsSpan = document.createElement("span");
    ptsSpan.className = "gp-pts";

    const inputText = document.createElement("input");
    inputText.className = "ginput";
    inputText.style.width = "100%";

    const selectInput = document.createElement("select");
    selectInput.className = "ginput";
    selectInput.style.width = "100%";

    const nextBtn = document.createElement("button");
    nextBtn.textContent = "Next";
    nextBtn.className = "btn";
    nextBtn.style.marginTop = "16px";

    container.appendChild(label);
    container.appendChild(inputText);
    container.appendChild(selectInput);
    container.appendChild(nextBtn);

    // Hide select initially
    selectInput.style.display = "none";

    function showStep(index) {
      if (index >= staticQuestions.length) {
        container.innerHTML = "<p>All done! Thank you.</p>";
        return;
      }
      const q = staticQuestions[index];
      label.textContent = q.label + " ";
      ptsSpan.textContent = `(${q.weight}pts)`;
      label.appendChild(ptsSpan);

      if (q.type === "select") {
        inputText.style.display = "none";
        selectInput.style.display = "block";
        selectInput.innerHTML = `<option value="">-- Select --</option>` + q.options.map(o => `<option value="${o}">${o}</option>`).join("");
        selectInput.value = answers[q.id]?.value || "";
      } else {
        selectInput.style.display = "none";
        inputText.style.display = "block";
        inputText.type = q.type;
        inputText.value = answers[q.id]?.value || "";
      }
    }

    function saveAnswer() {
      const q = staticQuestions[currentStep];
      const val = q.type === "select" ? selectInput.value.trim() : inputText.value.trim();
      answers[q.id] = { value: val, points: val ? q.weight : 0 };
      saveFieldToFirebase(q.id, val, answers[q.id].points);
    }

    const debouncedSave = debounce(() => saveAnswer(), 300);

    inputText.oninput = debouncedSave;
    selectInput.onchange = debouncedSave;

    nextBtn.onclick = () => {
      saveAnswer();
      currentStep++;
      showStep(currentStep);
    };

    showStep(currentStep);
  }
  global.renderGuidedQuestions = renderGuidedQuestions;

  // ==== Fallback render (classic) ====
  function renderQuestions(containerId) {
    console.log("[Step2] fallback renderQuestions triggered");
    const container = document.getElementById(containerId);
    if (!container) {
      console.error(`[Step2] Container '${containerId}' not found`);
      return;
    }
    container.innerHTML = "";
    staticQuestions.forEach(q => {
      let html;
      if (q.type === "text" || q.type === "number") {
        html = `
          <label class="glabel" for="${q.id}">
            ${q.label} <span class="gp-pts">(${q.weight}pts)</span>
            <input id="${q.id}" type="${q.type}" autocomplete="off" class="ginput">
          </label>
        `;
      } else {
        html = `
          <label class="glabel" for="${q.id}">
            ${q.label} <span class="gp-pts">(${q.weight}pts)</span>
            <select id="${q.id}" class="ginput">
              <option value="">-- Select --</option>
              ${q.options.map(o => `<option value="${o}">${o}</option>`).join("")}
            </select>
          </label>
        `;
      }
      container.insertAdjacentHTML("beforeend", html);
      const input = document.getElementById(q.id);
      if (!input) {
        console.warn(`[Step2] Input ${q.id} not found after insert`);
        return;
      }
      const ev = q.type === "select" ? "change" : "input";
      input.addEventListener(ev, debounce(() => {
        const v = input.value.trim();
        const pts = v === "" ? 0 : q.weight;
        answers[q.id] = { value: v, points: pts };
        saveFieldToFirebase(q.id, v, pts);
      }, 300));
    });
  }
  global.renderQuestions = renderQuestions;

  // Utility: Get label by field id
  function getLabel(id) {
    if (id==="custName") return "Customer Name";
    if (id==="custPhone") return "Customer Phone";
    if (id==="solutionText") return "Proposed Solution";
    const q = staticQuestions.find(x=>x.id===id);
    return q ? q.label : id;
  }
  global.getLabel = getLabel;

})(window);