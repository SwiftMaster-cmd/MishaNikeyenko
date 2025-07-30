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
    header.style = `
      position: sticky;
      top: 0;
      z-index: 101;
      width: 100vw;
      min-width: 320px;
      background: rgba(26,28,36,0.90);
      box-shadow: 0 2px 18px 0 rgba(30,144,255,.07);
      backdrop-filter: blur(12px) saturate(150%);
      border-bottom: 1.5px solid rgba(255,255,255,.08);
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: center;
      padding: 22px 0 16px 0;
      margin-bottom: 0;
      transition: background 0.2s;
    `;

    // Dashboard button (left)
    const dashBtn = document.createElement("a");
    dashBtn.href = dashUrl;
    dashBtn.id = "backToDash";
    dashBtn.textContent = "← Dashboard";
    dashBtn.setAttribute("tabindex", "0");
    dashBtn.style = `
      position: absolute;
      left: 26px;
      top: 50%;
      transform: translateY(-50%);
      font-weight: 700;
      font-size: 1.18em;
      color: #1e90ff;
      background: none;
      border-radius: 12px;
      padding: 8px 18px;
      opacity: 0.97;
      transition: background .16s, color .16s;
      text-decoration: none;
    `;
    dashBtn.onmouseenter = () => { dashBtn.style.background = "rgba(30,144,255,.09)"; dashBtn.style.color = "#4aa8ff"; };
    dashBtn.onmouseleave = () => { dashBtn.style.background = "none"; dashBtn.style.color = "#1e90ff"; };

    // Center column (label + progress)
    const center = document.createElement("div");
    center.style = `
      display: flex;
      flex-direction: column;
      align-items: center;
      flex: 1 1 0%;
      min-width: 0;
      position: relative;
    `;

    // Progress Label
    const label = document.createElement("label");
    label.htmlFor = "progressBar";
    label.style = `
      color: #e2e8f0;
      font-weight: 700;
      font-size: 1.09rem;
      margin-bottom: 6px;
      letter-spacing: .02em;
      text-align: center;
      width: 100%;
    `;
    label.textContent = "Completion:";

    // Numeric %
    const pctLabel = document.createElement("span");
    pctLabel.id = "progressLabel";
    pctLabel.style = `
      font-variant-numeric: tabular-nums;
      color: #82caff;
      font-weight: 800;
      margin-left: 5px;
      font-size: 1.11rem;
    `;
    pctLabel.textContent = "0%";
    label.appendChild(pctLabel);

    // Beautiful progress bar
    const barWrap = document.createElement("div");
    barWrap.style = `
      width: 100%;
      max-width: 440px;
      margin: 8px auto 0 auto;
      position: relative;
      background: rgba(255,255,255,.07);
      border-radius: 16px;
      height: 28px;
      overflow: hidden;
      box-shadow: 0 2px 20px rgba(30,144,255,0.13);
      display: flex;
      align-items: center;
    `;

    // Actual progress bar input (for accessibility, but hidden)
    const bar = document.createElement("progress");
    bar.id = "progressBar";
    bar.max = 100;
    bar.value = 0;
    bar.style = `
      width: 100%;
      height: 100%;
      opacity: 0; /* visually hidden */
      position: absolute;
      left: 0; top: 0; pointer-events:none;
    `;

    // Pretty visual bar (glass, animated)
    const visBar = document.createElement("div");
    visBar.id = "prettyBar";
    visBar.style = `
      position: absolute;
      left: 0; top: 0; height: 100%;
      width: 0%;
      background: linear-gradient(90deg, #1e90ff 0%, #4aa8ff 100%);
      box-shadow: 0 2px 10px #1e90ff40;
      border-radius: 16px;
      transition: width .38s cubic-bezier(.62,.1,.32,1), background .23s;
    `;

    // Progress percent text (floating)
    const percentText = document.createElement("div");
    percentText.id = "progressText";
    percentText.style = `
      position: absolute;
      right: 22px;
      top: 50%;
      transform: translateY(-50%);
      color: #fff;
      font-weight: 800;
      font-size: 1.01rem;
      letter-spacing: .01em;
      text-shadow: 0 2px 6px #1e90ff44;
      pointer-events: none;
    `;
    percentText.textContent = "0%";

    // Compose bar
    barWrap.appendChild(bar);
    barWrap.appendChild(visBar);
    barWrap.appendChild(percentText);

    // Center col: label + bar
    center.appendChild(label);
    center.appendChild(barWrap);

    // Flex row for full-width centering
    header.appendChild(dashBtn);
    header.appendChild(center);

    // Ensure header fits at the very top, not inside the main form container
    document.body.prepend(header);

    // For mobile: pad left if button visible, pad right always
    function adjustHeaderForMobile() {
      const vw = Math.max(window.innerWidth, document.documentElement.clientWidth);
      header.style.paddingLeft = vw < 700 ? "54px" : "0";
      header.style.paddingRight = vw < 480 ? "18px" : "0";
      center.style.maxWidth = vw < 600 ? "96vw" : "calc(100vw - 110px)";
      barWrap.style.maxWidth = vw < 480 ? "94vw" : "440px";
    }
    window.addEventListener("resize", adjustHeaderForMobile);
    adjustHeaderForMobile();

    // Sync progress on change
    global.updateProgressHeader = (pct) => {
      pct = Math.max(0, Math.min(100, Math.round(pct || 0)));
      bar.value = pct;
      visBar.style.width = `${pct}%`;
      percentText.textContent = pct + "%";
      pctLabel.textContent = pct + "%";
    };

    // Hook up to global progress changes if needed
    setTimeout(()=>{
      // Set the initial value
      let current = Number(document.getElementById("progressBar")?.value || 0);
      global.updateProgressHeader(current);
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
    container.style = `
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
    step1.style = `
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
    step2.style = `
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
    step3.style = `
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