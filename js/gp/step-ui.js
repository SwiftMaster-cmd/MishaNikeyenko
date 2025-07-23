// step-ui.js
(function(global){
  // Unified static questions for Step 2 (15 total, standardized order)
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

  // Render all Step 2 questions
  function renderQuestions(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = "";
    staticQuestions.forEach(q => {
      let html;
      if (q.type === "text" || q.type === "number") {
        html = `
          <label style="display:block;margin-bottom:14px;font-weight:600;color:#444;">
            ${q.label} <span style="color:#aaa;font-weight:400;">(${q.weight}pts)</span>
            <input
              id="${q.id}" type="${q.type}"
              style="width:100%;padding:10px;border-radius:6px;border:1px solid #ccc;margin-top:6px;font-size:16px;"
              autocomplete="off"
            >
          </label>
        `;
      } else {
        html = `
          <label style="display:block;margin-bottom:14px;font-weight:600;color:#444;">
            ${q.label} <span style="color:#aaa;font-weight:400;">(${q.weight}pts)</span>
            <select
              id="${q.id}"
              style="width:100%;padding:10px;border-radius:6px;border:1px solid #ccc;margin-top:6px;font-size:16px;"
            >
              <option value="">-- Select --</option>
              ${q.options.map(o => `<option value="${o}">${o}</option>`).join("")}
            </select>
          </label>
        `;
      }
      container.insertAdjacentHTML("beforeend", html);
      const input = document.getElementById(q.id);
      if (!input) return;
      const ev = q.type === "select" ? "change" : "input";
      input.addEventListener(ev, debounce(() => {
        const v = input.value.trim();
        const pts = v === "" ? 0 : q.weight;
        answers[q.id] = { value: v, points: pts };
        if (typeof global.saveAnswer === "function") global.saveAnswer(q.id, v, pts);
        if (typeof global.updateTotalPoints === "function") global.updateTotalPoints();
        if (typeof global.updatePitchText === "function") global.updatePitchText();
        if (global.gpApp?.saveNow) global.gpApp.saveNow();
      }, 300));
    });
  }
  global.renderQuestions = renderQuestions;

  // Hydrate answers from state
  function hydrateAnswers() {
    Object.entries(answers).forEach(([id, { value }]) => {
      const f = document.getElementById(id);
      if (f) f.value = value;
    });
  }
  global.hydrateAnswers = hydrateAnswers;

  // Instant save for Step 1 fields
  function setupInstantSaveForStep1() {
    [["custName",8],["custPhone",7]].forEach(([id,pts]) => {
      const f = document.getElementById(id);
      if (!f) return;
      f.addEventListener("input", debounce(() => {
        const v = f.value.trim();
        answers[id] = { value: v, points: v ? pts : 0 };
        if (typeof global.saveAnswer === "function") global.saveAnswer(id, v, answers[id].points);
        if (typeof global.updateTotalPoints === "function") global.updateTotalPoints();
        if (typeof global.updatePitchText === "function") global.updatePitchText();
        if (global.gpApp?.saveNow) global.gpApp.saveNow();
      }, 300));
    });
  }
  global.setupInstantSaveForStep1 = setupInstantSaveForStep1;

  // Instant save for Step 3 solution
  function setupSolutionSave() {
    const f = document.getElementById("solutionText");
    if (!f) return;
    f.addEventListener("input", debounce(() => {
      const v = f.value.trim();
      answers.solutionText = { value: v, points: v ? 25 : 0 };
      if (typeof global.saveAnswer === "function") global.saveAnswer("solutionText", v, answers.solutionText.points);
      if (typeof global.updateTotalPoints === "function") global.updateTotalPoints();
      if (typeof global.updatePitchText === "function") global.updatePitchText();
      if (global.gpApp?.saveNow) global.gpApp.saveNow();
    }, 300));
  }
  global.setupSolutionSave = setupSolutionSave;

  // Save to Firebase (progress only)
  function saveAnswer(_, __, ___) {
    const key = global.gpApp?.guestKey;
    if (!key) return;
    const maxPts = staticQuestions.reduce((s,q)=>s+q.weight,0) + 8 + 7 + 25;
    const totPts = Object.values(answers).reduce((s,a)=>s+a.points,0);
    const pct    = Math.min(100, Math.round(totPts/maxPts*100));
    firebase.database().ref(`guestinfo/${key}/completionPct`).set(pct);
  }
  global.saveAnswer = saveAnswer;

  // Get label by field id
  function getLabel(id) {
    if (id==="custName") return "Customer Name";
    if (id==="custPhone") return "Customer Phone";
    if (id==="solutionText") return "Proposed Solution";
    const q = staticQuestions.find(x=>x.id===id);
    return q ? q.label : id;
  }
  global.getLabel = getLabel;

})(window);