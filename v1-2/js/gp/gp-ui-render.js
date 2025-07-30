// gp-ui-render.js
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
    container.style = `
      display: flex;
      gap: 28px;
      flex-wrap: wrap;
      margin-top: 26px;
      align-items: flex-start;
      width: 100%;
      box-sizing: border-box;
    `; 

    // 2.1 Step 1: Customer Info (left card)
    const step1 = document.createElement("section");
    step1.style = `
      flex: 1 1 300px;
      background: #f9f9fb;
      padding: 28px 22px 20px 22px;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.09);
      border: 1px solid #e3e6eb;
      min-width: 270px;
      max-width: 350px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    `;
    step1.innerHTML = `
      <h2 style="margin-top:0;font-size:22px;color:#222;">Step 1: Customer Info</h2>
      <label style="font-weight:600;color:#444;">
        Customer Name <span style="color:#aaa;font-weight:400;">(8pts)</span>
        <input id="custName" type="text" placeholder="Full name" style="width:100%;padding:10px;border-radius:6px;border:1px solid #ccc;margin-top:6px;font-size:16px;">
      </label>
      <label style="font-weight:600;color:#444;">
        Customer Phone <span style="color:#aaa;font-weight:400;">(7pts)</span>
        <input id="custPhone" type="tel" placeholder="Phone number" style="width:100%;padding:10px;border-radius:6px;border:1px solid #ccc;margin-top:6px;font-size:16px;">
      </label>
    `;
    container.appendChild(step1);

    // 2.2 Step 2: Evaluate Needs (center card, dynamic)
    const step2 = document.createElement("section");
    step2.style = `
      flex: 2 1 650px;
      background: #fff;
      padding: 28px 22px 20px 22px;
      border-radius: 12px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.11);
      border: 1px solid #e3e6eb;
      max-width: 780px;
      min-width: 420px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 8px;
    `;
    step2.innerHTML = `
      <h2 style="margin-top:0;font-size:22px;color:#222;">Step 2: Evaluate Needs</h2>
      <div id="step2Fields"></div>
    `;
    container.appendChild(step2);

    // 2.3 Step 3: Proposed Solution (right card)
    const step3 = document.createElement("section");
    step3.style = `
      flex: 1 1 300px;
      background: #f9f9fb;
      padding: 28px 22px 20px 22px;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.09);
      border: 1px solid #e3e6eb;
      min-width: 270px;
      max-width: 350px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    `;
    step3.innerHTML = `
      <h2 style="margin-top:0;font-size:22px;color:#222;margin-bottom:12px;">
        Step 3: Proposed Solution <span style="color:#aaa;font-weight:400;">(25pts)</span>
      </h2>
      <textarea id="solutionText" rows="8" placeholder="What we’ll offer…" style="width:100%;padding:12px;border-radius:6px;border:1px solid #ccc;font-size:16px;resize:vertical;flex-grow:1;"></textarea>
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