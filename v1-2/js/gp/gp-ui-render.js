// gp-ui-render.js
(function(global){
  // Ensure Firebase is initialized before proceeding
  const firebaseConfig = global.GP_FIREBASE_CONFIG || {/* ... */};
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const DASHBOARD_URL = global.DASHBOARD_URL || "../html/admin.html";
  global.DASHBOARD_URL = DASHBOARD_URL;

  // --- PROGRESS HEADER (all logic in this file) ---
  global.createProgressHeader = function(app, dashUrl) {
    // Remove any old header
    document.getElementById('gpProgressHeader')?.remove();

    // Create sticky/glassy header wrapper
    const header = document.createElement("header");
    header.id = "gpProgressHeader";
    header.style.cssText = `
      position: sticky;
      top: 0;
      z-index: 101;
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      padding: 12px 24px;
      background: rgba(25,30,40,0.85);
      backdrop-filter: blur(10px);
      border-bottom: 1px solid #2a2f3e;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen,
        Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif;
    `;

    // Dashboard button (left)
    const dashBtn = document.createElement("a");
    dashBtn.href = dashUrl;
    dashBtn.id = "backToDash";
    dashBtn.textContent = "← Dashboard";
    dashBtn.setAttribute("tabindex", "0");
    dashBtn.style.cssText = `
      font-weight: 600;
      font-size: 1.1rem;
      color: #5aa8ff;
      text-decoration: none;
      padding: 6px 14px;
      border-radius: 12px;
      transition: background-color 0.2s ease, color 0.2s ease;
      user-select: none;
      cursor: pointer;
      white-space: nowrap;
    `;
    dashBtn.addEventListener("mouseenter", () => {
      dashBtn.style.backgroundColor = "rgba(90,168,255,0.15)";
      dashBtn.style.color = "#9ccaff";
    });
    dashBtn.addEventListener("mouseleave", () => {
      dashBtn.style.backgroundColor = "transparent";
      dashBtn.style.color = "#5aa8ff";
    });

    // Center container (label + progress bar)
    const center = document.createElement("div");
    center.style.cssText = `
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-width: 0;
      max-width: 440px;
      margin: 0 auto;
      user-select: none;
    `;

    // Progress Label
    const label = document.createElement("label");
    label.htmlFor = "progressBar";
    label.textContent = "Completion:";
    label.style.cssText = `
      color: #cfd8ff;
      font-weight: 700;
      font-size: 1rem;
      margin-bottom: 6px;
      letter-spacing: 0.03em;
      text-align: center;
      width: 100%;
    `;

    // Numeric % inside label
    const pctLabel = document.createElement("span");
    pctLabel.id = "progressLabel";
    pctLabel.style.cssText = `
      font-variant-numeric: tabular-nums;
      color: #7db4ff;
      font-weight: 800;
      margin-left: 8px;
      font-size: 1.05rem;
    `;
    pctLabel.textContent = "0%";
    label.appendChild(pctLabel);

    // Progress bar container
    const barWrap = document.createElement("div");
    barWrap.style.cssText = `
      width: 100%;
      height: 20px;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.08);
      box-shadow: inset 0 1px 5px rgba(30,144,255,0.25);
      overflow: hidden;
      position: relative;
    `;

    // Actual progress element (hidden for accessibility)
    const bar = document.createElement("progress");
    bar.id = "progressBar";
    bar.max = 100;
    bar.value = 0;
    bar.style.cssText = `
      position: absolute;
      left: 0;
      top: 0;
      width: 100%;
      height: 100%;
      opacity: 0;
      pointer-events: none;
    `;

    // Visual progress bar
    const visBar = document.createElement("div");
    visBar.id = "prettyBar";
    visBar.style.cssText = `
      height: 100%;
      width: 0%;
      background: linear-gradient(90deg, #3a94ff 0%, #72b7ff 100%);
      box-shadow: 0 0 12px #3a94ffaa;
      border-radius: 12px 0 0 12px;
      transition: width 0.35s ease;
    `;

    // Floating percent text on the right
    const percentText = document.createElement("div");
    percentText.id = "progressText";
    percentText.style.cssText = `
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      color: #e0ebff;
      font-weight: 700;
      font-size: 0.95rem;
      text-shadow: 0 0 8px #3a94ff99;
      pointer-events: none;
      user-select: none;
    `;
    percentText.textContent = "0%";

    // Assemble progress bar
    barWrap.appendChild(bar);
    barWrap.appendChild(visBar);
    barWrap.appendChild(percentText);

    center.appendChild(label);
    center.appendChild(barWrap);

    header.appendChild(dashBtn);
    header.appendChild(center);

    // Insert header at top of body (outside main app container)
    document.body.prepend(header);

    // Responsive padding adjustment
    function adjustHeaderForMobile() {
      const vw = Math.max(window.innerWidth, document.documentElement.clientWidth);
      header.style.paddingLeft = vw < 700 ? "54px" : "24px";
      header.style.paddingRight = vw < 480 ? "18px" : "24px";
      center.style.maxWidth = vw < 600 ? "96vw" : "440px";
      barWrap.style.maxWidth = "100%";
    }
    window.addEventListener("resize", adjustHeaderForMobile);
    adjustHeaderForMobile();

    // Progress update helper
    global.updateProgressHeader = (pct) => {
      pct = Math.min(100, Math.max(0, Math.round(pct || 0)));
      bar.value = pct;
      visBar.style.width = pct + "%";
      percentText.textContent = pct + "%";
      pctLabel.textContent = pct + "%";
    };

    // Initial progress update after small delay
    setTimeout(() => {
      const initialVal = Number(document.getElementById("progressBar")?.value || 0);
      global.updateProgressHeader(initialVal);
    }, 200);
  };

  // --- Main UI renderer ---
  function renderUI() {
    const app = document.getElementById("guestApp");
    if (!app) return;
    app.innerHTML = "";

    // 1. Progress header (sticky/top, always visible)
    global.createProgressHeader(app, DASHBOARD_URL);

    // 2. Unified 3-section row (Step 1, Step 2, Step 3)
    const container = document.createElement("div");
    container.style.cssText = `
      display: flex;
      gap: 28px;
      flex-wrap: wrap;
      margin-top: 32px;
      align-items: flex-start;
      width: 100%;
      box-sizing: border-box;
      justify-content: center;
    `;

    // Step 1: Customer Info
    const step1 = document.createElement("section");
    step1.style.cssText = `
      flex: 1 1 300px;
      background: #252733;
      padding: 30px 24px 22px 24px;
      border-radius: 16px;
      box-shadow: 0 2px 12px rgba(30,144,255,0.09);
      border: 1px solid #262e3e;
      min-width: 260px;
      max-width: 370px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    `;
    step1.innerHTML = `
      <h2 style="margin-top:0;font-size:22px;color:#82caff;">Step 1: Customer Info</h2>
      <label style="font-weight:700;color:#e2e8f0;">
        Customer Name <span style="color:#82caff;font-weight:400;">(8pts)</span>
        <input id="custName" type="text" placeholder="Full name" style="width:100%;padding:12px;border-radius:8px;border:1px solid #3b4663;margin-top:7px;font-size:16px;background:#181925;color:#fff;">
      </label>
      <label style="font-weight:700;color:#e2e8f0;">
        Customer Phone <span style="color:#82caff;font-weight:400;">(7pts)</span>
        <input id="custPhone" type="tel" placeholder="Phone number" style="width:100%;padding:12px;border-radius:8px;border:1px solid #3b4663;margin-top:7px;font-size:16px;background:#181925;color:#fff;">
      </label>
    `;
    container.appendChild(step1);

    // Step 2: Evaluate Needs (center card)
    const step2 = document.createElement("section");
    step2.style.cssText = `
      flex: 2 1 650px;
      background: #22273c;
      padding: 34px 28px 24px 28px;
      border-radius: 16px;
      box-shadow: 0 2px 18px rgba(30,144,255,0.13);
      border: 1px solid #253a59;
      max-width: 800px;
      min-width: 360px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 9px;
    `;
    step2.innerHTML = `
      <h2 style="margin-top:0;font-size:22px;color:#4aa8ff;">Step 2: Evaluate Needs</h2>
      <div id="step2Fields"></div>
    `;
    container.appendChild(step2);

    // Step 3: Proposed Solution (right card)
    const step3 = document.createElement("section");
    step3.style.cssText = `
      flex: 1 1 300px;
      background: #252733;
      padding: 30px 24px 22px 24px;
      border-radius: 16px;
      box-shadow: 0 2px 12px rgba(30,144,255,0.09);
      border: 1px solid #262e3e;
      min-width: 260px;
      max-width: 370px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    `;
    step3.innerHTML = `
      <h2 style="margin-top:0;font-size:22px;color:#ffb300;margin-bottom:12px;">
        Step 3: Proposed Solution <span style="color:#fff;font-weight:400;">(25pts)</span>
      </h2>
      <textarea id="solutionText" rows="8" placeholder="What we’ll offer…" style="width:100%;padding:14px;border-radius:8px;border:1px solid #3b4663;font-size:16px;resize:vertical;flex-grow:1;background:#181925;color:#fff;"></textarea>
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

    // Responsive fix: ensure containers use all available width, up to max
    function adjustCardWidths() {
      const vw = Math.max(window.innerWidth, document.documentElement.clientWidth);
      container.style.flexDirection = vw < 900 ? "column" : "row";
      step1.style.maxWidth = vw < 650 ? "99vw" : "370px";
      step2.style.maxWidth = vw < 650 ? "99vw" : "800px";
      step3.style.maxWidth = vw < 650 ? "99vw" : "370px";
      step1.style.margin = step3.style.margin = vw < 900 ? "0 auto 20px auto" : "0";
      step2.style.margin = vw < 900 ? "0 auto 20px auto" : "0";
    }
    window.addEventListener("resize", adjustCardWidths);
    adjustCardWidths();
  }

  // Re-render on auth
  auth.onAuthStateChanged(() => renderUI());

})(window);