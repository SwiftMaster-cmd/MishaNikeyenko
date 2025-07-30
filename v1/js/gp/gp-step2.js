// step-ui.js -- Modern, class-based, no inline styles, CSS-driven
(function(global){
  // All Step 2 questions (dynamic, but static here unless you use admin to edit)
  const questions = global.gpQuestions || global.staticQuestions || [];
  global.gpQuestions = questions; // for legacy support

  // Debounce helper
  function debounce(fn, delay=300) {
    let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), delay); };
  }

  // Render Step 2 questions in the container
  function renderQuestions(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = "";
    questions.forEach(q => {
      let html;
      if (q.type === "text" || q.type === "number") {
        html = `
          <label class="glabel" for="${q.id}">
            ${q.label} <span class="gp-pts">(${q.weight}pts)</span>
            <input id="${q.id}" type="${q.type}" autocomplete="off">
          </label>
        `;
      } else {
        html = `
          <label class="glabel" for="${q.id}">
            ${q.label} <span class="gp-pts">(${q.weight}pts)</span>
            <select id="${q.id}">
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
        global.answers[q.id] = { value: v, points: pts };
        if (typeof global.saveAnswer === "function") global.saveAnswer(q.id, v, pts);
        if (typeof global.updateTotalPoints === "function") global.updateTotalPoints();
        if (typeof global.updatePitchText === "function") global.updatePitchText();
        if (global.gpApp?.saveNow) global.gpApp.saveNow();
      }, 300));
    });
  }
  global.renderQuestions = renderQuestions;

  // Hydrate (fill) values from answers
  function hydrateAnswers() {
    if (!global.answers) return;
    Object.entries(global.answers).forEach(([id, { value }]) => {
      const f = document.getElementById(id);
      if (f) f.value = value;
    });
  }
  global.hydrateAnswers = hydrateAnswers;

  // Step 1 instant save for Customer fields
  function setupInstantSaveForStep1() {
    [["custName", 8], ["custPhone", 7]].forEach(([id, pts]) => {
      const f = document.getElementById(id);
      if (!f) return;
      f.addEventListener("input", debounce(() => {
        const v = f.value.trim();
        global.answers[id] = { value: v, points: v ? pts : 0 };
        if (typeof global.saveAnswer === "function") global.saveAnswer(id, v, global.answers[id].points);
        if (typeof global.updateTotalPoints === "function") global.updateTotalPoints();
        if (typeof global.updatePitchText === "function") global.updatePitchText();
        if (global.gpApp?.saveNow) global.gpApp.saveNow();
      }, 300));
    });
  }
  global.setupInstantSaveForStep1 = setupInstantSaveForStep1;

  // Step 3 instant save for solution
  function setupSolutionSave() {
    const f = document.getElementById("solutionText");
    if (!f) return;
    f.addEventListener("input", debounce(() => {
      const v = f.value.trim();
      global.answers.solutionText = { value: v, points: v ? 25 : 0 };
      if (typeof global.saveAnswer === "function") global.saveAnswer("solutionText", v, global.answers.solutionText.points);
      if (typeof global.updateTotalPoints === "function") global.updateTotalPoints();
      if (typeof global.updatePitchText === "function") global.updatePitchText();
      if (global.gpApp?.saveNow) global.gpApp.saveNow();
    }, 300));
  }
  global.setupSolutionSave = setupSolutionSave;

  // Save points to Firebase (if available)
  function saveAnswer(_, __, ___) {
    const key = global.gpApp?.guestKey;
    if (!key) return;
    const maxPts = questions.reduce((s, q) => s + q.weight, 0) + 8 + 7 + 25;
    const totPts = Object.values(global.answers).reduce((s, a) => s + a.points, 0);
    const pct = Math.min(100, Math.round(totPts / maxPts * 100));
    firebase.database().ref(`guestinfo/${key}/completionPct`).set(pct);
  }
  global.saveAnswer = saveAnswer;

  // Label helper
  function getLabel(id) {
    if (id === "custName") return "Customer Name";
    if (id === "custPhone") return "Customer Phone";
    if (id === "solutionText") return "Proposed Solution";
    const q = questions.find(x => x.id === id);
    return q ? q.label : id;
  }
  global.getLabel = getLabel;
})(window);