// gp-ui-render.js -- Pure CSS-driven UI, no inline styles, just classes
(function(global){
  // Ensure Firebase is initialized before proceeding
  const firebaseConfig = global.GP_FIREBASE_CONFIG || {/* ... */};
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const DASHBOARD_URL = global.DASHBOARD_URL || "../html/admin.html";
  global.DASHBOARD_URL = DASHBOARD_URL;

  // Main UI renderer
  function renderUI() {
    const app = document.getElementById("guestApp");
    if (!app) return;
    app.innerHTML = "";

    // 1. Progress header (sticky/top)
    global.createProgressHeader(app, DASHBOARD_URL);

    // 2. Unified 3-section row (Step 1, Step 2, Step 3)
    const container = document.createElement("div");
    container.id = "stepsContainer";
    container.className = "steps-row"; // This class should control flex, gap, wrap, etc.

    // 2.1 Step 1: Customer Info (left card)
    const step1 = document.createElement("section");
    step1.className = "step-card step-card-1 card";
    step1.innerHTML = `
      <h2 class="card-title">Step 1: Customer Info</h2>
      <label class="glabel">
        Customer Name <span class="gp-pts">(8pts)</span>
        <input id="custName" type="text" placeholder="Full name" autocomplete="off">
      </label>
      <label class="glabel">
        Customer Phone <span class="gp-pts">(7pts)</span>
        <input id="custPhone" type="tel" placeholder="Phone number" autocomplete="off">
      </label>
    `;
    container.appendChild(step1);

    // 2.2 Step 2: Evaluate Needs (center card, dynamic)
    const step2 = document.createElement("section");
    step2.className = "step-card step-card-2 card";
    step2.innerHTML = `
      <h2 class="card-title">Step 2: Evaluate Needs</h2>
      <div id="step2Fields"></div>
    `;
    container.appendChild(step2);

    // 2.3 Step 3: Proposed Solution (right card)
    const step3 = document.createElement("section");
    step3.className = "step-card step-card-3 card";
    step3.innerHTML = `
      <h2 class="card-title">
        Step 3: Proposed Solution <span class="gp-pts">(25pts)</span>
      </h2>
      <textarea id="solutionText" rows="8" placeholder="What we’ll offer…" autocomplete="off"></textarea>
    `;
    container.appendChild(step3);

    // Attach the main container
    app.appendChild(container);

    // 3. Render all Step 2 fields (dynamic)
    if (typeof global.renderQuestions === "function") {
      global.renderQuestions("step2Fields");
    }

    // 4. Hydrate existing answers for all steps
    if (typeof global.hydrateAnswers === "function") {
      global.hydrateAnswers();
    }

    // 5. Enable live saving for all fields
    if (typeof global.setupInstantSaveForStep1 === "function") {
      global.setupInstantSaveForStep1();
    }
    if (typeof global.setupSolutionSave === "function") {
      global.setupSolutionSave();
    }

    // 6. Set points/progress display and update pitch text
    if (typeof global.updateTotalPoints === "function") {
      global.updateTotalPoints();
    }
    if (typeof global.updatePitchText === "function") {
      global.updatePitchText();
    }

    // 7. Final save after render if available
    if (global.gpApp?.saveNow) global.gpApp.saveNow();
  }

  // Re-render on auth
  auth.onAuthStateChanged(() => renderUI());

})(window);