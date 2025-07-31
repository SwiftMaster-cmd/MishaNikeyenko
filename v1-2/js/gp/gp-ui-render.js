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

    // Minimal inline styles to avoid conflicts; main styles handled in CSS
    header.style.position = "sticky";
    header.style.top = "0";
    header.style.zIndex = "101";
    header.style.width = "100%";
    header.style.display = "flex";
    header.style.alignItems = "center";
    header.style.justifyContent = "space-between";
    header.style.padding = "0 20px";

    // Dashboard button (left)
    const dashBtn = document.createElement("a");
    dashBtn.href = dashUrl;
    dashBtn.id = "backToDash";
    dashBtn.textContent = "← Dashboard";
    dashBtn.setAttribute("tabindex", "0");

    // Remove absolute positioning, use flex natural layout
    dashBtn.style.position = "static";
    dashBtn.style.fontWeight = "700";
    dashBtn.style.fontSize = "1.1em";
    dashBtn.style.color = "#1e90ff";
    dashBtn.style.background = "none";
    dashBtn.style.borderRadius = "12px";
    dashBtn.style.padding = "8px 18px";
    dashBtn.style.opacity = "0.97";
    dashBtn.style.textDecoration = "none";
    dashBtn.style.transition = "background .16s, color .16s";
    dashBtn.style.cursor = "pointer";

    dashBtn.onmouseenter = () => { dashBtn.style.background = "rgba(30,144,255,.09)"; dashBtn.style.color = "#4aa8ff"; };
    dashBtn.onmouseleave = () => { dashBtn.style.background = "none"; dashBtn.style.color = "#1e90ff"; };

    // New Lead Button (right)
    const newLeadBtn = document.createElement("button");
    newLeadBtn.id = "newLeadBtn";
    newLeadBtn.textContent = "+ New Lead";
    newLeadBtn.style.cssText = `
      background: var(--brand, #1e90ff);
      color: white;
      border: none;
      border-radius: 12px;
      padding: 8px 16px;
      font-weight: 700;
      font-size: 1rem;
      cursor: pointer;
      margin-left: 12px;
      user-select: none;
      transition: background-color 0.2s ease;
    `;
    newLeadBtn.onmouseenter = () => newLeadBtn.style.background = "var(--blue-light, #4aa8ff)";
    newLeadBtn.onmouseleave = () => newLeadBtn.style.background = "var(--brand, #1e90ff)";
    newLeadBtn.onclick = async () => {
      try {
        const userUid = firebase.auth().currentUser?.uid || null;
        const ref = await firebase.database().ref("guestinfo").push({
          createdAt: Date.now(),
          status: "new",
          userUid
        });
        const newKey = ref.key;
        localStorage.setItem("last_guestinfo_key", newKey);
        const baseUrl = window.GUESTINFO_PAGE ? window.GUESTINFO_PAGE.split("?")[0] : "../html/guestinfo.html";
        window.location.href = `${baseUrl}?gid=${encodeURIComponent(newKey)}&uistart=step1`;
      } catch (err) {
        alert("Error creating new lead: " + err.message);
      }
    };

    // Center column (label + progress)
    const center = document.createElement("div");
    center.style.flex = "1";
    center.style.display = "flex";
    center.style.flexDirection = "column";
    center.style.alignItems = "center";
    center.style.justifyContent = "center";
    center.style.minWidth = "0";

    // Progress Label
    const label = document.createElement("label");
    label.htmlFor = "progressBar";
    label.textContent = "Completion:";
    label.style.color = "#e2e8f0";
    label.style.fontWeight = "700";
    label.style.fontSize = "1.1rem";
    label.style.marginBottom = "6px";
    label.style.letterSpacing = ".02em";
    label.style.textAlign = "center";
    label.style.width = "100%";

    // Numeric %
    const pctLabel = document.createElement("span");
    pctLabel.id = "progressLabel";
    pctLabel.style.fontVariantNumeric = "tabular-nums";
    pctLabel.style.color = "#82caff";
    pctLabel.style.fontWeight = "800";
    pctLabel.style.marginLeft = "5px";
    pctLabel.style.fontSize = "1.12rem";
    pctLabel.textContent = "0%";
    label.appendChild(pctLabel);

    // Progress bar container
    const barWrap = document.createElement("div");
    barWrap.style.width = "100%";
    barWrap.style.maxWidth = "440px";
    barWrap.style.margin = "8px auto 0";
    barWrap.style.position = "relative";
    barWrap.style.background = "rgba(255,255,255,.07)";
    barWrap.style.borderRadius = "16px";
    barWrap.style.height = "28px";
    barWrap.style.overflow = "hidden";
    barWrap.style.boxShadow = "0 2px 20px rgba(30,144,255,0.13)";
    barWrap.style.display = "flex";
    barWrap.style.alignItems = "center";

    // Actual progress element (hidden for accessibility)
    const bar = document.createElement("progress");
    bar.id = "progressBar";
    bar.max = 100;
    bar.value = 0;
    bar.style.width = "100%";
    bar.style.height = "100%";
    bar.style.opacity = "0";
    bar.style.position = "absolute";
    bar.style.left = "0";
    bar.style.top = "0";
    bar.style.pointerEvents = "none";

    // Visual progress bar
    const visBar = document.createElement("div");
    visBar.id = "prettyBar";
    visBar.style.position = "absolute";
    visBar.style.left = "0";
    visBar.style.top = "0";
    visBar.style.height = "100%";
    visBar.style.width = "0%";
    visBar.style.background = "linear-gradient(90deg, #1e90ff 0%, #4aa8ff 100%)";
    visBar.style.boxShadow = "0 2px 10px #1e90ff40";
    visBar.style.borderRadius = "16px";
    visBar.style.transition = "width .38s cubic-bezier(.62,.1,.32,1), background .23s";

    // Floating percent text
    const percentText = document.createElement("div");
    percentText.id = "progressText";
    percentText.style.position = "absolute";
    percentText.style.right = "22px";
    percentText.style.top = "50%";
    percentText.style.transform = "translateY(-50%)";
    percentText.style.color = "#fff";
    percentText.style.fontWeight = "800";
    percentText.style.fontSize = "1.01rem";
    percentText.style.letterSpacing = ".01em";
    percentText.style.textShadow = "0 2px 6px #1e90ff44";
    percentText.style.pointerEvents = "none";
    percentText.textContent = "0%";

    // Current Step display
    const stepDisplay = document.createElement("div");
    stepDisplay.id = "currentStepId";
    stepDisplay.style.color = "#82caff";
    stepDisplay.style.fontWeight = "700";
    stepDisplay.style.fontSize = "1rem";
    stepDisplay.style.marginLeft = "20px";
    stepDisplay.style.userSelect = "none";
    stepDisplay.textContent = "Step: Unknown";

    // Compose progress bar
    barWrap.appendChild(bar);
    barWrap.appendChild(visBar);
    barWrap.appendChild(percentText);

    center.appendChild(label);
    center.appendChild(barWrap);

    header.appendChild(dashBtn);
    header.appendChild(center);
    header.appendChild(stepDisplay);
    header.appendChild(newLeadBtn);

    // Insert header at top of body (outside main app container)
    document.body.prepend(header);

    // Adjust header paddings based on viewport width (optional)
    function adjustHeaderForMobile() {
      const vw = Math.max(window.innerWidth, document.documentElement.clientWidth);
      header.style.paddingLeft = vw < 700 ? "54px" : "20px";
      header.style.paddingRight = vw < 480 ? "18px" : "20px";
      center.style.maxWidth = vw < 600 ? "96vw" : "calc(100vw - 170px)"; // account for two buttons
      barWrap.style.maxWidth = vw < 480 ? "94vw" : "440px";
    }
    window.addEventListener("resize", adjustHeaderForMobile);
    adjustHeaderForMobile();

    // Update progress display helper
    global.updateProgressHeader = (pct) => {
      pct = Math.min(100, Math.max(0, Math.round(pct || 0)));
      bar.value = pct;
      visBar.style.width = `${pct}%`;
      percentText.textContent = pct + "%";
      pctLabel.textContent = pct + "%";
    };

    // Update current step text helper
    global.updateCurrentStep = (stepId) => {
      stepDisplay.textContent = `Step: ${stepId || "Unknown"}`;
    };

    // Initial progress update
    setTimeout(() => {
      const initialVal = Number(document.getElementById("progressBar")?.value || 0);
      global.updateProgressHeader(initialVal);
      global.updateCurrentStep("step1");
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