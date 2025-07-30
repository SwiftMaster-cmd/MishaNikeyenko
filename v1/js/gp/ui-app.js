// ui-app.js -- Clean, class-driven, CSS-only Guest Portal UI
(function(global){
  const auth = firebase.auth();
  const db   = firebase.database();
  const answers = {};
  global.answers = answers;

  // Debounce helper
  function debounce(fn, delay = 300) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), delay); };
  }

  // Calculate progress percent
  function computePct() {
    const maxPts = (global.gpQuestions||[]).reduce((s,q)=>s+q.weight,0) + 8 + 7 + 25;
    const totPts = Object.values(answers).reduce((s,a)=>s+a.points,0);
    return Math.min(100, Math.round(totPts/maxPts*100));
  }

  // Handle any field input/change
  function onFieldChange(id, value, points) {
    answers[id] = { value, points };
    const pct = computePct();
    if (window.ProgressBar) {
      ProgressBar.update(pct);
      ProgressBar.updatePitch(answers);
    }
    if (global.gpApp.saveNow) global.gpApp.saveNow();
  }

  // Main UI render
  function initUI() {
    const app = document.getElementById('guestApp');
    if (!app) return;

    app.innerHTML = ''; // Clean start

    // ---- 1. Sticky, glassy header ----
    if (window.ProgressBar && typeof ProgressBar.render === "function") {
      ProgressBar.render(app, global.DASHBOARD_URL || '../html/admin.html');
    } else if (global.createProgressHeader) {
      global.createProgressHeader(app, global.DASHBOARD_URL || '../html/admin.html');
    }

    // ---- 2. Steps row ----
    const container = document.createElement('div');
    container.id = 'stepsContainer';
    container.className = 'steps-row'; // CSS: flex, gap, margin-top
    app.appendChild(container);

    // ---- 3. Render all steps as cards ----
    if (window.StepsUI && typeof StepsUI.renderSteps === "function") {
      StepsUI.renderSteps(container); // If you have a StepsUI modular system
    } else {
      // If not, fallback: render main card structure directly
      // Step 1 Card
      const step1 = document.createElement('section');
      step1.className = 'card step-card step-card-1';
      step1.innerHTML = `
        <h2 class="card-title">Step 1: Customer Info</h2>
        <label class="glabel">Customer Name <span class="gp-pts">(8pts)</span>
          <input id="custName" type="text" autocomplete="off" />
        </label>
        <label class="glabel">Customer Phone <span class="gp-pts">(7pts)</span>
          <input id="custPhone" type="tel" autocomplete="off" />
        </label>
      `;
      container.appendChild(step1);

      // Step 2 Card
      const step2 = document.createElement('section');
      step2.className = 'card step-card step-card-2';
      step2.innerHTML = `
        <h2 class="card-title">Step 2: Evaluate Needs</h2>
        <div id="step2Fields"></div>
      `;
      container.appendChild(step2);

      // Step 3 Card
      const step3 = document.createElement('section');
      step3.className = 'card step-card step-card-3';
      step3.innerHTML = `
        <h2 class="card-title">Step 3: Proposed Solution <span class="gp-pts">(25pts)</span></h2>
        <textarea id="solutionText" rows="8" placeholder="What we’ll offer…"></textarea>
      `;
      container.appendChild(step3);
    }

    // ---- 4. Render dynamic questions in Step 2 ----
    if (window.StepsUI && typeof StepsUI.renderStep2Fields === "function") {
      StepsUI.renderStep2Fields('step2Fields', onFieldChange);
    } else if (global.renderQuestions) {
      global.renderQuestions('step2Fields');
    }

    // ---- 5. Hook up all field changes to onFieldChange ----
    // Step 1 fields
    [["custName",8],["custPhone",7]].forEach(([id, pts]) => {
      const input = document.getElementById(id);
      if (!input) return;
      input.addEventListener("input", debounce(() => {
        onFieldChange(id, input.value.trim(), input.value.trim() ? pts : 0);
      }, 250));
    });

    // Step 2 fields
    (global.gpQuestions||[]).forEach(q => {
      const input = document.getElementById(q.id);
      if (!input) return;
      const ev = q.type === "select" ? "change" : "input";
      input.addEventListener(ev, debounce(() => {
        const v = input.value.trim();
        onFieldChange(q.id, v, v ? q.weight : 0);
      }, 250));
    });

    // Step 3 (solution)
    const sol = document.getElementById('solutionText');
    if (sol) {
      sol.addEventListener("input", debounce(() => {
        onFieldChange("solutionText", sol.value.trim(), sol.value.trim() ? 25 : 0);
      }, 250));
    }

    // ---- 6. Hydrate answers (from preloaded state) ----
    for (const [id, { value }] of Object.entries(global.answers)) {
      const f = document.getElementById(id);
      if (f) f.value = value;
    }

    // ---- 7. Initial progress bar update ----
    if (window.ProgressBar) ProgressBar.update(computePct());

    // ---- 8. Real-time remote sync for progress ----
    const key = global.gpApp && global.gpApp.guestKey;
    if (key) {
      db.ref(`guestinfo/${key}/completionPct`)
        .on('value', snap => {
          if (snap.exists() && window.ProgressBar) ProgressBar.update(snap.val());
        });
    }
  }

  // Auth callback
  auth.onAuthStateChanged(user => {
    if (user) initUI();
  });

})(window);