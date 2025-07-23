// steps-ui.js
(function(global) {
  // replicate your staticQuestions here and expose
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
    { id: "promos",         label: "Would you like to see options for lower cost or promos?",           type: "select", weight: 2,  options: ["Yes","No","Maybe"] }
  ];
  global.gpQuestions = staticQuestions;

  function renderSteps(parentEl) {
    parentEl.innerHTML = '';
    // Step 1
    parentEl.insertAdjacentHTML('beforeend', `
      <section id="step1Form" class="guest-step" style="flex:1 1 300px;background:#f7f7f7;padding:20px;border:1px solid #ddd;border-radius:10px;">
        <h2>Step 1 – Customer Info</h2>
        <label>Customer Name (8pts)<input id="custName" type="text" placeholder="Full name"></label>
        <label>Customer Phone (7pts)<input id="custPhone" type="tel" placeholder="Phone number"></label>
      </section>
    `);

    // Step 2
    parentEl.insertAdjacentHTML('beforeend', `
      <section id="step2Form" class="guest-step" style="flex:2 1 600px;background:#fff;padding:20px;border:1px solid #ddd;border-radius:10px;overflow-y:auto;max-height:90vh;">
        <h2>Step 2 – Evaluate Needs</h2>
        <div id="step2Fields"></div>
      </section>
    `);

    // Step 3
    parentEl.insertAdjacentHTML('beforeend', `
      <section id="step3Form" class="guest-step" style="flex:1 1 300px;background:#f7f7f7;padding:20px;border:1px solid #ddd;border-radius:10px;display:flex;flex-direction:column;">
        <h2>Step 3 – Proposed Solution (25pts)</h2>
        <textarea id="solutionText" placeholder="What we’ll offer…" rows="6" style="flex:1;"></textarea>
      </section>
    `);
  }

  function renderStep2Fields(containerId, onChange) {
    const c = document.getElementById(containerId);
    if (!c) return;
    c.innerHTML = '';
    global.gpQuestions.forEach(q => {
      let html;
      if (q.type === 'text' || q.type === 'number') {
        html = `<label>${q.label}<input id="${q.id}" type="${q.type}"></label>`;
      } else {
        html = `
          <label>${q.label}
            <select id="${q.id}">
              <option value="">-- Select --</option>
              ${q.options.map(o=>`<option value="${o}">${o}</option>`).join('')}
            </select>
          </label>`;
      }
      c.insertAdjacentHTML('beforeend', html);
      const el = document.getElementById(q.id);
      if (!el) return;
      const ev = q.type==='select'?'change':'input';
      el.addEventListener(ev, () => {
        const v = el.value.trim();
        onChange(q.id, v, v? q.weight : 0);
      });
    });
  }

  function setupStep1(onChange) {
    [['custName',8],['custPhone',7]].forEach(([id,pts]) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => {
        const v = el.value.trim();
        onChange(id, v, v? pts : 0);
      });
    });
  }

  function setupSolution(onChange) {
    const el = document.getElementById('solutionText');
    if (!el) return;
    el.addEventListener('input', () => {
      const v = el.value.trim();
      onChange('solutionText', v, v? 25 : 0);
    });
  }

  global.StepsUI = {
    renderSteps,
    renderStep2Fields,
    setupStep1,
    setupSolution
  };
})(window);