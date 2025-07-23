// gp-ui-render.js -- Each step is its own container
(function(global){
  const firebaseConfig = global.GP_FIREBASE_CONFIG || {/* ... */};
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const DASHBOARD_URL = global.DASHBOARD_URL || "../html/admin.html";
  global.DASHBOARD_URL = DASHBOARD_URL;

  function renderUI() {
    const app = document.getElementById("guestApp");
    if (!app) return;
    app.innerHTML = "";

    // 1. Progress header (sticky/top)
    global.createProgressHeader(app, DASHBOARD_URL);

    // 2. Separate step containers
    // Step 1 container
    const step1Wrap = document.createElement("div");
    step1Wrap.className = "step-container step1-container";
    step1Wrap.innerHTML = `
      <section class="step-card step-card-1 card">
        <h2 class="card-title">Step 1: Customer Info</h2>
        <label class="glabel">
          Customer Name <span class="gp-pts">(8pts)</span>
          <input id="custName" type="text" placeholder="Full name" autocomplete="off">
        </label>
        <label class="glabel">
          Customer Phone <span class="gp-pts">(7pts)</span>
          <input id="custPhone" type="tel" placeholder="Phone number" autocomplete="off">
        </label>
      </section>
    `;

    // Step 2 container
    const step2Wrap = document.createElement("div");
    step2Wrap.className = "step-container step2-container";
    step2Wrap.innerHTML = `
      <section class="step-card step-card-2 card">
        <h2 class="card-title">Step 2: Evaluate Needs</h2>
        <div id="step2Fields"></div>
      </section>
    `;

    // Step 3 container
    const step3Wrap = document.createElement("div");
    step3Wrap.className = "step-container step3-container";
    step3Wrap.innerHTML = `
      <section class="step-card step-card-3 card">
        <h2 class="card-title">
          Step 3: Proposed Solution <span class="gp-pts">(25pts)</span>
        </h2>
        <textarea id="solutionText" rows="8" placeholder="What we’ll offer…" autocomplete="off"></textarea>
      </section>
    `;

    // Attach containers
    app.appendChild(step1Wrap);
    app.appendChild(step2Wrap);
    app.appendChild(step3Wrap);

    // Render dynamic Step 2 fields
    if (typeof global.renderQuestions === "function") {
      global.renderQuestions("step2Fields");
    }
    if (typeof global.hydrateAnswers === "function") {
      global.hydrateAnswers();
    }
    if (typeof global.setupInstantSaveForStep1 === "function") {
      global.setupInstantSaveForStep1();
    }
    if (typeof global.setupSolutionSave === "function") {
      global.setupSolutionSave();
    }
    if (typeof global.updateTotalPoints === "function") {
      global.updateTotalPoints();
    }
    if (typeof global.updatePitchText === "function") {
      global.updatePitchText();
    }
    if (global.gpApp?.saveNow) global.gpApp.saveNow();
  }

  auth.onAuthStateChanged(() => renderUI());

})(window);