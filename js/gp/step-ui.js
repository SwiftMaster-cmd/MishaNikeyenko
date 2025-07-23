// gp-ui-steps.js
(function(global){
  // ─── QUESTIONS & STATE ───────────────────────────────────────────────────────
  const staticQuestions = [ /* … your 15 questions … */ ];
  global.staticQuestions = staticQuestions;
  global.gpQuestions     = staticQuestions;
  const answers = {};
  global.answers = answers;

  // ─── RENDER STEP SECTIONS WITH CONTROLS ───────────────────────────────────────
  function renderStepSections(container) {
    // inject styles once
    if (!document.getElementById("gp-ui-steps-styles")) {
      const s = document.createElement("style");
      s.id = "gp-ui-steps-styles";
      s.textContent = `
        .gp-step2-controls { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
        #step2Fields { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
        .pts-badge { background:#eef; color:#225; border-radius:4px; padding:2px 6px; font-size:12px; margin-left:6px; }
        .question-item { position:relative; }
      `;
      document.head.appendChild(s);
    }

    container.innerHTML = `
      <section style="flex:1 1 300px;…">
        <h2>Step 1: Customer Info</h2>
        <!-- unchanged Step 1 inputs -->
        <label>Customer Name<span>(8pts)</span><input id="custName" …></label>
        <label>Customer Phone<span>(7pts)</span><input id="custPhone" …></label>
      </section>

      <section style="flex:2 1 600px;…">
        <h2>Step 2: Evaluate Needs</h2>
        <div class="gp-step2-controls">
          <label><input type="checkbox" id="filterUnanswered"> Unanswered only</label>
          <select id="sortQuestions">
            <option value="weight">Sort by weight</option>
            <option value="label">Sort by label</option>
          </select>
        </div>
        <div id="step2Fields"></div>
      </section>

      <section style="flex:1 1 300px;…">
        <h2>Step 3: Proposed Solution<span>(25pts)</span></h2>
        <textarea id="solutionText" …></textarea>
      </section>
    `;

    // bind controls
    document.getElementById("filterUnanswered")
      .addEventListener("change", () => renderQuestions("step2Fields"));
    document.getElementById("sortQuestions")
      .addEventListener("change", () => renderQuestions("step2Fields"));
  }

  // ─── RENDER & BIND QUESTIONS ───────────────────────────────────────────────────
  function renderQuestions(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = "";
    // clone & sort
    let qs = staticQuestions.slice();
    const sortBy = document.getElementById("sortQuestions")?.value;
    if (sortBy === "label") {
      qs.sort((a,b) => a.label.localeCompare(b.label));
    } else {
      qs.sort((a,b) => b.weight - a.weight);
    }
    // filter
    const onlyUnanswered = document.getElementById("filterUnanswered")?.checked;
    qs.forEach(q => {
      if (onlyUnanswered && answers[q.id]?.value) return;
      // wrap each in .question-item
      const html = `
        <div class="question-item">
          <label style="display:block;margin-bottom:14px;font-weight:600;color:#444;">
            ${q.label}<span class="pts-badge">${q.weight}pt</span>
            ${q.type === "text"||q.type==="number"
              ? `<input id="${q.id}" type="${q.type}" style="width:100%;…">`
              : `<select id="${q.id}" style="width:100%;…">
                  <option value="">-- Select --</option>
                  ${q.options.map(o=>`<option value="${o}">${o}</option>`).join("")}
                </select>`
            }
          </label>
        </div>`;
      container.insertAdjacentHTML("beforeend", html);

      // bind save
      const input = document.getElementById(q.id);
      const ev = q.type==="select" ? "change" : "input";
      input.addEventListener(ev, debounce(() => {
        const v = input.value.trim();
        answers[q.id] = { value: v, points: v? q.weight : 0 };
        saveAnswer(q.id, v, answers[q.id].points);
        global.updateTotalPoints();
        global.updatePitchText();
        if (global.gpApp?.saveNow) global.gpApp.saveNow();
      }, 300));
    });
  }

  // ─── HYDRATION & INSTANT SAVE ─────────────────────────────────────────────────
  function hydrateAnswers() {
    Object.entries(answers).forEach(([id,{value}]) => {
      document.getElementById(id)?.value = value;
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

  // ─── PERSISTENCE & HELPERS ────────────────────────────────────────────────────
  function saveAnswer(_, __, ___) {
    const key = global.gpApp?.guestKey;
    if (!key) return;
    const maxPts = staticQuestions.reduce((s,q)=>s+q.weight,0) + 8 + 7 + 25;
    const totPts = Object.values(answers).reduce((s,a)=>s+a.points,0);
    const pct    = Math.min(100, Math.round(totPts/maxPts*100));
    firebase.database().ref(`guestinfo/${key}/completionPct`).set(pct);
  }
  function debounce(fn, d=300){ let t; return(...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),d); }; }

  // ─── EXPOSE ───────────────────────────────────────────────────────────────────
  global.renderStepSections       = renderStepSections;
  global.renderQuestions          = renderQuestions;
  global.hydrateAnswers           = hydrateAnswers;
  global.setupInstantSaveForStep1 = setupInstantSaveForStep1;
  global.setupSolutionSave        = setupSolutionSave;
})(window);