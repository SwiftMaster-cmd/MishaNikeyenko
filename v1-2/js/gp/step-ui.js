// step-ui.js -- Modern, class-based Step 2 rendering, no inline styles, always key-safe!
(function(global){
  // Unified static questions for Step 2 (standardized order)
 const staticQuestions = [
  { id: "numLines",       label: "How many lines do you need on your account?", type: "number", weight: 15 },
  { id: "carrier",        label: "What carrier are you with right now?",       type: "select", weight: 14, options: ["Verizon","AT&T","T-Mobile","US Cellular","Cricket","Metro","Boost","Straight Talk","Tracfone","Other"] },
  { id: "monthlySpend",   label: "What do you usually pay each month for phone service?", type: "number", weight: 13 },
  { id: "deviceStatus",   label: "Is your phone paid off, or do you still owe on it?", type: "select", weight: 12, options: ["Paid Off","Still Owe","Lease","Mixed","Not Sure"] },
  { id: "upgradeInterest",label: "Are you looking to upgrade your phone, or keep what you have?", type: "select", weight: 11, options: ["Upgrade","Keep Current","Not Sure"] }
];
  global.staticQuestions = staticQuestions;
  global.gpQuestions     = staticQuestions;
  const answers = {};
  global.answers = answers;

  // Debounce helper
  function debounce(fn, delay=300) {
    let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), delay); };
  }

  // Render all Step 2 questions (uses CSS classes only)
  function renderQuestions(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
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
      if (!input) return;
      const ev = q.type === "select" ? "change" : "input";
      input.addEventListener(ev, debounce(() => {
        const v = input.value.trim();
        const pts = v === "" ? 0 : q.weight;
        answers[q.id] = { value: v, points: pts };
        // Always save to Firebase via gpApp, never create new!
        saveFieldToFirebase(q.id, v, pts);
      }, 300));
    });
  }
  global.renderQuestions = renderQuestions;

  // Hydrate answers from state to UI
  function hydrateAnswers(obj) {
    // Use the guest object from app (passed in)
    staticQuestions.forEach(q => {
      const v = (obj && obj.evaluate && obj.evaluate[q.id]) || "";
      answers[q.id] = { value: v, points: v ? q.weight : 0 };
      const f = document.getElementById(q.id);
      if (f) f.value = v;
    });
  }
  global.hydrateAnswers = hydrateAnswers;

  // Save a single field to Firebase (and recalc completion)
  function saveFieldToFirebase(id, value, pts) {
    const key = global.gpApp?.guestKey;
    if (!key) return;
    // Update only the single field in nested evaluate
    const update = {};
    update[`guestinfo/${key}/evaluate/${id}`] = value;
    firebase.database().ref().update(update);

    // Also update completionPct
    const maxPts = staticQuestions.reduce((s,q)=>s+q.weight,0) + 8 + 7 + 25;
    const totPts = Object.values(answers).reduce((s,a)=>s+a.points,0);
    const pct    = Math.min(100, Math.round(totPts/maxPts*100));
    firebase.database().ref(`guestinfo/${key}/completionPct`).set(pct);
  }

  // Step 1 instant save (name/phone)
  function setupInstantSaveForStep1() {
    [["custName",8],["custPhone",7]].forEach(([id,pts]) => {
      const f = document.getElementById(id);
      if (!f) return;
      f.addEventListener("input", debounce(() => {
        const v = f.value.trim();
        answers[id] = { value: v, points: v ? pts : 0 };
        saveFieldToFirebase(id, v, answers[id].points);
      }, 300));
    });
  }
  global.setupInstantSaveForStep1 = setupInstantSaveForStep1;

  // Step 3 instant save (solution)
  function setupSolutionSave() {
    const f = document.getElementById("solutionText");
    if (!f) return;
    f.addEventListener("input", debounce(() => {
      const v = f.value.trim();
      answers.solutionText = { value: v, points: v ? 25 : 0 };
      saveFieldToFirebase("solutionText", v, answers.solutionText.points);
    }, 300));
  }
  global.setupSolutionSave = setupSolutionSave;

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