// gp-ui-render.js
(function(global){
  global.createProgressHeader = function(app, dashUrl) {
    // Remove old header if present
    document.getElementById('gpProgressHeader')?.remove();

    const header = document.createElement("header");
    header.id = "gpProgressHeader";

    header.classList.add("gp-progress-header");

    // Left: Dashboard link
    const dashBtn = document.createElement("a");
    dashBtn.href = dashUrl;
    dashBtn.id = "backToDash";
    dashBtn.textContent = "← Dashboard";
    dashBtn.setAttribute("tabindex", "0");

    // Middle: progress label + bar + lead ID + new lead button container
    const center = document.createElement("div");
    center.classList.add("gp-progress-main");

    // Completion label with numeric percent span
    const label = document.createElement("label");
    label.htmlFor = "progressBar";
    label.textContent = "Completion: ";

    const pctLabel = document.createElement("span");
    pctLabel.id = "progressLabel";
    pctLabel.textContent = "0%";
    label.appendChild(pctLabel);

    // Progress bar element
    const bar = document.createElement("progress");
    bar.id = "progressBar";
    bar.max = 100;
    bar.value = 0;

    // Lead ID display
    const leadIdDisplay = document.createElement("div");
    leadIdDisplay.id = "leadIdDisplay";
    leadIdDisplay.classList.add("lead-id-display");
    leadIdDisplay.textContent = "Lead ID: --";

    // New Lead button
    const newLeadBtn = document.createElement("button");
    newLeadBtn.id = "newLeadBtn";
    newLeadBtn.textContent = "+ New Lead";
    newLeadBtn.classList.add("btn", "btn-success", "btn-sm");
    newLeadBtn.style.marginTop = "8px";
    newLeadBtn.addEventListener("click", async () => {
      if (typeof global.gpApp.createNewLead === "function") {
        await global.gpApp.createNewLead();
      } else {
        console.warn("createNewLead() not implemented");
      }
    });

    center.appendChild(label);
    center.appendChild(bar);
    center.appendChild(leadIdDisplay);
    center.appendChild(newLeadBtn);

    header.appendChild(dashBtn);
    header.appendChild(center);

    document.body.prepend(header);
  };

  global.updateProgressHeader = function(pct) {
    pct = Math.min(100, Math.max(0, Math.round(pct || 0)));
    const bar = document.getElementById("progressBar");
    const pctLabel = document.getElementById("progressLabel");
    if (bar) bar.value = pct;
    if (pctLabel) pctLabel.textContent = pct + "%";
  };

  global.updateLeadId = function(id) {
    const leadIdDisplay = document.getElementById("leadIdDisplay");
    if (!leadIdDisplay) return;
    leadIdDisplay.textContent = id ? `Lead ID: ${id}` : "Lead ID: --";
  };

  function renderUI() {
    const app = document.getElementById("guestApp");
    if (!app) return;
    app.innerHTML = "";

    global.createProgressHeader(app, global.DASHBOARD_URL || "../html/admin.html");

    // Container for steps
    const container = document.createElement("div");
    container.classList.add("steps-container");

    // Step 1: Customer Info
    const step1 = document.createElement("section");
    step1.id = "step1Form";
    step1.classList.add("step-container");
    step1.innerHTML = `
      <h2>Step 1: Customer Info</h2>
      <label for="custName" class="glabel">Customer Name <span class="gp-pts">(8pts)</span></label>
      <input id="custName" type="text" placeholder="Full name" class="ginput" autocomplete="off" />

      <label for="custPhone" class="glabel">Customer Phone <span class="gp-pts">(7pts)</span></label>
      <input id="custPhone" type="tel" placeholder="Phone number" class="ginput" autocomplete="off" />
    `;

    // Step 2: Evaluate Needs
    const step2 = document.createElement("section");
    step2.id = "step2Form";
    step2.classList.add("step-container");
    step2.innerHTML = `
      <h2>Step 2: Evaluate Needs</h2>
      <div id="step2Fields"></div>
    `;

    // Step 3: Proposed Solution
    const step3 = document.createElement("section");
    step3.id = "step3Form";
    step3.classList.add("step-container");
    step3.innerHTML = `
      <h2>Step 3: Proposed Solution <span class="gp-pts">(25pts)</span></h2>
      <textarea id="solutionText" placeholder="What we'll offer…" class="ginput" rows="8"></textarea>
    `;

    container.appendChild(step1);
    container.appendChild(step2);
    container.appendChild(step3);

    app.appendChild(container);

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
    if (global.gpApp?.saveNow) {
      global.gpApp.saveNow();
    }
  }

  global.renderUI = renderUI;

  // On auth state change, re-render UI
  if (typeof global.onAuthStateChanged === "function") {
    global.onAuthStateChanged(() => {
      renderUI();
    });
  }
})(window);