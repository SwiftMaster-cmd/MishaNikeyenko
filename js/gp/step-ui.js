// gp-ui-steps.js
(function(global){
  // ───────────────────────────────────────────────────────────────────────────
  // QUESTIONS & STATE
  // ───────────────────────────────────────────────────────────────────────────
  const staticQuestions = [ /* … your 15 questions … */ ];
  global.staticQuestions = staticQuestions;
  global.gpQuestions     = staticQuestions;
  const answers = {};
  global.answers = answers;
  let currentStep = 1;

  // ───────────────────────────────────────────────────────────────────────────
  // RENDER / WIZARD CONTROLS
  // ───────────────────────────────────────────────────────────────────────────
  function renderStepSections(container) {
    container.innerHTML = `
      <div class="wizard-step" data-step="1">
        <h2>Step 1: Customer Info</h2>
        <label>Customer Name<span>(8pts)</span><input id="custName" …></label>
        <label>Customer Phone<span>(7pts)</span><input id="custPhone" …></label>
        <div class="wizard-nav">
          <button id="toStep2">Next →</button>
        </div>
      </div>
      <div class="wizard-step" data-step="2">
        <h2>Step 2: Evaluate Needs</h2>
        <div id="step2Fields" class="grid-2col"></div>
        <div class="wizard-nav">
          <button id="backTo1">← Back</button>
          <button id="toStep3">Next →</button>
        </div>
      </div>
      <div class="wizard-step" data-step="3">
        <h2>Step 3: Proposed Solution<span>(25pts)</span></h2>
        <textarea id="solutionText" …></textarea>
        <div class="wizard-nav">
          <button id="backTo2">← Back</button>
        </div>
      </div>
    `;
    showStep(1);
    container.querySelector("#toStep2").onclick = () => showStep(2);
    container.querySelector("#backTo1").onclick = () => showStep(1);
    container.querySelector("#toStep3").onclick = () => showStep(3);
    container.querySelector("#backTo2").onclick = () => showStep(2);
  }

  function showStep(step) {
    currentStep = step;
    document.querySelectorAll(".wizard-step").forEach(el => {
      el.style.display = el.dataset.step == step ? "block" : "none";
    });
    // auto-focus first input
    const first = document.querySelector(`.wizard-step[data-step="${step}"] input, .wizard-step[data-step="${step}"] textarea`);
    if (first) first.focus();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // QUESTION RENDERING & SAVE
  // ───────────────────────────────────────────────────────────────────────────
  function renderQuestions(containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = "";
    staticQuestions.forEach(q => {
      const el = document.createElement("label");
      el.innerHTML = q.type === "text"||q.type==="number"
        ? `${q.label}<input id="${q.id}" type="${q.type}" …>`
        : `${q.label}<select id="${q.id}"><option>-- Select --</option>${q.options.map(o=>`<option>${o}</option>`).join("")}</select>`;
      container.appendChild(el);
      const input = el.querySelector("#"+q.id);
      const ev = q.type==="select"?"change":"input";
      input.addEventListener(ev, debounce(() => {
        const v = input.value.trim();
        answers[q.id] = { value: v, points: v? q.weight: 0 };
        saveAnswer(q.id, v, answers[q.id].points);
        global.updateTotalPoints();
        global.updatePitchText();
        if (global.gpApp?.saveNow) global.gpApp.saveNow();
      }, 300));
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // HYDRATION & INSTANT SAVE
  // ───────────────────────────────────────────────────────────────────────────
  function hydrateAnswers() {
    Object.entries(answers).forEach(([id,{value}]) => {
      const f = document.getElementById(id);
      if (f) f.value = value;
    });
  }
  function setupInstantSaveForStep1() {
    [["custName",8],["custPhone",7]].forEach(([id,pts]) => {
      const f = document.getElementById(id);
      f?.addEventListener("input", debounce(() => {
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
    f?.addEventListener("input", debounce(() => {
      const v = f.value.trim();
      answers.solutionText = { value: v, points: v?25:0 };
      saveAnswer("solutionText", v, answers.solutionText.points);
      global.updateTotalPoints();
      global.updatePitchText();
      if (global.gpApp?.saveNow) global.gpApp.saveNow();
    }, 300));
  }

  // ───────────────────────────────────────────────────────────────────────────
  // PERSIST & HELPERS
  // ───────────────────────────────────────────────────────────────────────────
  function saveAnswer(_, __, ___) {
    const key = global.gpApp?.guestKey;
    if (!key) return;
    const maxPts = staticQuestions.reduce((s,q)=>s+q.weight,0) + 8 + 7 + 25;
    const totPts = Object.values(answers).reduce((s,a)=>s+a.points,0);
    firebase.database().ref(`guestinfo/${key}/completionPct`).set(
      Math.min(100, Math.round(totPts/maxPts*100))
    );
  }
  function debounce(fn, d=300){ let t; return(...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),d); }; }

  // ───────────────────────────────────────────────────────────────────────────
  // EXPOSE & KICK OFF
  // ───────────────────────────────────────────────────────────────────────────
  global.renderStepSections       = renderStepSections;
  global.renderQuestions          = renderQuestions;
  global.hydrateAnswers           = hydrateAnswers;
  global.setupInstantSaveForStep1 = setupInstantSaveForStep1;
  global.setupSolutionSave        = setupSolutionSave;

})(window);