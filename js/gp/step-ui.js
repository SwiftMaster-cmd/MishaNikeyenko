// gp-ui-steps.js
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

  function renderStepSections(container) {
    container.insertAdjacentHTML("beforeend", `
      <section style="flex:1 1 300px;background:#f7f7f7;padding:20px;border-radius:10px;box-shadow:0 1px 4px rgba(0,0,0,0.1);border:1px solid #ddd;">
        <h2 style="margin-top:0;font-size:22px;color:#222;">Step 1: Customer Info</h2>
        <label style="display:block;margin-bottom:16px;font-weight:600;color:#444;">
          Customer Name <span>(8pts)</span>
          <input id="custName" type="text" placeholder="Full name" style="width:100%;padding:10px;border-radius:6px;border:1px solid #ccc;margin-top:6px;font-size:16px;">
        </label>
        <label style="display:block;margin-bottom:16px;font-weight:600;color:#444;">
          Customer Phone <span>(7pts)</span>
          <input id="custPhone" type="tel" placeholder="Phone number" style="width:100%;padding:10px;border-radius:6px;border:1px solid #ccc;margin-top:6px;font-size:16px;">
        </label>
      </section>
      <section style="flex:2 1 600px;background:#fff;padding:20px;border-radius:10px;box-shadow:0 1px 6px rgba(0,0,0,0.12);border:1px solid #ddd;max-height:90vh;overflow-y:auto;">
        <h2 style="margin-top:0;font-size:22px;color:#222;">Step 2: Evaluate Needs</h2>
        <div id="step2Fields"></div>
      </section>
      <section style="flex:1 1 300px;background:#f7f7f7;padding:20px;border-radius:10px;box-shadow:0 1px 4px rgba(0,0,0,0.1);border:1px solid #ddd;display:flex;flex-direction:column;">
        <h2 style="margin-top:0;font-size:22px;color:#222;margin-bottom:12px;">
          Step 3: Proposed Solution <span>(25pts)</span>
        </h2>
        <textarea id="solutionText" rows="8" placeholder="What we’ll offer…" style="width:100%;padding:12px;border-radius:6px;border:1px solid #ccc;font-size:16px;resize:vertical;flex-grow:1;"></textarea>
      </section>
    `);
  }

  function renderQuestions(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = "";
    (global.gpQuestions||staticQuestions).forEach(q => {
      let html;
      if (q.type==="text"||q.type==="number") {
        html = `
          <label style="display:block;margin-bottom:14px;font-weight:600;color:#444;">
            ${q.label}
            <input id="${q.id}" type="${q.type}" style="width:100%;padding:10px;border-radius:6px;border:1px solid #ccc;margin-top:6px;font-size:16px;">
          </label>`;
      } else {
        html = `
          <label style="display:block;margin-bottom:14px;font-weight:600;color:#444;">
            ${q.label}
            <select id="${q.id}" style="width:100%;padding:10px;border-radius:6px;border:1px solid #ccc;margin-top:6px;font-size:16px;">
              <option value="">-- Select --</option>
              ${q.options.map(o=>`<option value="${o}">${o}</option>`).join("")}
            </select>
          </label>`;
      }
      container.insertAdjacentHTML("beforeend", html);
      const input = document.getElementById(q.id);
      if (!input) return;
      const ev = q.type==="select" ? "change" : "input";
      input.addEventListener(ev, debounce(() => {
        const v = input.value.trim();
        const pts = v==="" ? 0 : q.weight;
        answers[q.id] = { value: v, points: pts };
        saveAnswer(q.id, v, pts);
        global.updateTotalPoints();
        global.updatePitchText();
        if (global.gpApp?.saveNow) global.gpApp.saveNow();
      }, 300));
    });
  }

  function hydrateAnswers() {
    Object.entries(answers).forEach(([id,{value}]) => {
      const f = document.getElementById(id);
      if (f) f.value = value;
    });
  }

  function setupInstantSaveForStep1() {
    [["custName",8],["custPhone",7]].forEach(([id,pts]) => {
      const f = document.getElementById(id);
      if (!f) return;
      f.addEventListener("input", debounce(() => {
        const v = f.value.trim();
        answers[id] = { value: v, points: v?pts:0 };
        saveAnswer(id, v, answers[id].points);
        global.updateTotalPoints();
        global.updatePitchText();
        if (global.gpApp?.saveNow) global.gpApp.saveNow();
      }, 300));
    });
  }

  function setupSolutionSave() {
    const f = document.getElementById("solutionText");
    if (!f) return;
    f.addEventListener("input", debounce(() => {
      const v = f.value.trim();
      answers.solutionText = { value: v, points: v?25:0 };
      saveAnswer("solutionText", v, answers.solutionText.points);
      global.updateTotalPoints();
      global.updatePitchText();
      if (global.gpApp?.saveNow) global.gpApp.saveNow();
    }, 300));
  }

  function saveAnswer(_, __, ___) {
    const key = global.gpApp?.guestKey;
    if (!key) return;
    const maxPts = staticQuestions.reduce((s,q)=>s+q.weight,0) + 8 + 7 + 25;
    const totPts = Object.values(answers).reduce((s,a)=>s+a.points,0);
    const pct    = Math.min(100, Math.round(totPts/maxPts*100));
    firebase.database().ref(`guestinfo/${key}/completionPct`).set(pct);
  }

  function debounce(fn, delay=300) {
    let timer=null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  function getLabel(id) {
    if (id==="custName") return "Customer Name";
    if (id==="custPhone") return "Customer Phone";
    if (id==="solutionText") return "Proposed Solution";
    const q = staticQuestions.concat(global.gpQuestions).find(x=>x.id===id);
    return q ? q.label : id;
  }

  global.renderStepSections      = renderStepSections;
  global.renderQuestions         = renderQuestions;
  global.hydrateAnswers          = hydrateAnswers;
  global.setupInstantSaveForStep1 = setupInstantSaveForStep1;
  global.setupSolutionSave       = setupSolutionSave;
  global.saveAnswer              = saveAnswer;
  global.getLabel                = getLabel;
})(window);