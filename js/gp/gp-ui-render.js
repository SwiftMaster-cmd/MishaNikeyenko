// gp-ui-render.js -- Guest Portal UI with optional answers + live progress bar + live pitch update, no admin panel
// Load **after** Firebase SDKs, gp-questions.js, and gp-core.js; before gp-app-min.js

(function(global){
  const staticQuestions = [
    { id: "numLines", label: "How many lines do you need on your account?", type: "number", weight: 15 },
    { id: "carrier", label: "What carrier are you with right now?", type: "select", weight: 14, options: ["Verizon","AT&T","T-Mobile","US Cellular","Cricket","Metro","Boost","Straight Talk","Tracfone","Other"] },
    { id: "monthlySpend", label: "What do you usually pay each month for phone service?", type: "number", weight: 13 },
    { id: "deviceStatus", label: "Is your phone paid off, or do you still owe on it?", type: "select", weight: 12, options: ["Paid Off","Still Owe","Lease","Mixed","Not Sure"] },
    { id: "upgradeInterest", label: "Are you looking to upgrade your phone, or keep what you have?", type: "select", weight: 11, options: ["Upgrade","Keep Current","Not Sure"] },
    { id: "otherDevices", label: "Do you have any other devices--tablets, smartwatches, or hotspots?", type: "select", weight: 10, options: ["Tablet","Smartwatch","Hotspot","Multiple","None"] },
    { id: "coverage", label: "How’s your coverage at home and at work?", type: "select", weight: 9, options: ["Great","Good","Average","Poor","Not Sure"] },
    { id: "travel", label: "Do you travel out of state or internationally?", type: "select", weight: 8, options: ["Yes, both","Just out of state","International","Rarely","Never"] },
    { id: "hotspot", label: "Do you use your phone as a hotspot?", type: "select", weight: 7, options: ["Yes, often","Sometimes","Rarely","Never"] },
    { id: "usage", label: "How do you mainly use your phone? (Streaming, gaming, social, work, calls/texts)", type: "text", weight: 6 },
    { id: "discounts", label: "Anyone on your plan get discounts? (Military, student, senior, first responder)", type: "select", weight: 5, options: ["Military","Student","Senior","First Responder","No","Not Sure"] },
    { id: "keepNumber", label: "Do you want to keep your current number(s) if you switch?", type: "select", weight: 5, options: ["Yes","No","Not Sure"] },
    { id: "issues", label: "Have you had any issues with dropped calls or slow data?", type: "select", weight: 4, options: ["Yes","No","Sometimes"] },
    { id: "planPriority", label: "What’s most important to you in a phone plan? (Price, coverage, upgrades, service)", type: "text", weight: 3 },
    { id: "promos", label: "Would you like to see your options for lower monthly cost or free device promos?", type: "select", weight: 2, options: ["Yes","No","Maybe"] }
  ];

  const firebaseConfig = global.GP_FIREBASE_CONFIG || {
    apiKey: "AIzaSyD9fILTNJQ0wsPftUsPkdLrhRGV9dslMzE",
    authDomain: "osls-644fd.firebaseapp.com",
    databaseURL: "https://osls-644fd-default-rtdb.firebaseio.com",
    projectId: "osls-644fd",
    storageBucket: "osls-644fd.appspot.com",
    messagingSenderId: "798578046321",
    appId: "1:798578046321:web:1a2bcd3ef4567gh8i9jkl",
    measurementId: "G-XXXXXXX"
  };
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  const auth = firebase.auth();

  const DASHBOARD_URL = global.DASHBOARD_URL || "../html/admin.html";

  const answers = {}; // { questionId: { value, points } }

  function create(tag, attrs = {}, html = "") {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k,v]) => el.setAttribute(k, v));
    if (html) el.innerHTML = html;
    return el;
  }

  function renderUI() {
    const app = document.getElementById("guestApp");
    if (!app) return;

    app.innerHTML = "";

    // Header
    const header = create("header", { class: "guest-header" }, `
      <a id="backToDash" class="guest-back-btn" href="${DASHBOARD_URL}">← Dashboard</a>
    `);
    app.appendChild(header);
    header.querySelector("#backToDash").addEventListener("click", e => {
      if (e.metaKey||e.ctrlKey||e.shiftKey||e.altKey) return;
      e.preventDefault();
      window.location.href = DASHBOARD_URL;
    });

    // Progress bar container + label (only one here)
    const progressContainer = create("div", { style: "margin:12px 0;" });
    const progressLabel = create("div", { id: "progressLabel", style:"margin-bottom:4px;font-weight:bold;" }, "Progress: 0%");
    const progressBar = create("progress", { id: "progressBar", value: 0, max: 100, style: "width: 100%; height: 20px;" });
    progressContainer.appendChild(progressLabel);
    progressContainer.appendChild(progressBar);
    app.appendChild(progressContainer);

    // Progress & NBQ placeholders (kept if needed for other UI)
    app.appendChild(create("div", { id: "gp-progress-hook" }));
    app.appendChild(create("div", { id: "gp-nbq" }));

    // Main container
    const box = create("div", { class: "guest-box" });

    box.insertAdjacentHTML("beforeend", `
      <form id="step1Form" autocomplete="off" data-step="1">
        <div class="guest-title">Step 1: Customer Info</div>
        <label class="glabel">Customer Name <span class="gp-pts">(8pts)</span>
          <input class="gfield" type="text" id="custName" placeholder="Full name" />
        </label>
        <label class="glabel">Customer Phone <span class="gp-pts">(7pts)</span>
          <input class="gfield" type="tel" id="custPhone" placeholder="Phone number" />
        </label>
        <button class="guest-btn" type="submit">Continue to Step 2</button>
      </form>
    `);

    box.insertAdjacentHTML("beforeend", `
      <form id="step2Form" class="hidden" data-step="2">
        <div class="guest-title">
          Step 2: Evaluate
          <span id="gp-revert-step1" class="gp-revert-link hidden">(Back to Step 1)</span>
        </div>
        <div id="step2Fields"></div>
        <button class="guest-btn" type="submit">Continue to Step 3</button>
      </form>
    `);

    box.insertAdjacentHTML("beforeend", `
      <form id="step3Form" class="hidden" data-step="3">
        <div class="guest-title">
          Step 3: Solution
          <span id="gp-revert-step2" class="gp-revert-link hidden">(Back to Step 2)</span>
        </div>
        <label class="glabel">Proposed Solution <span class="gp-pts">(25pts)</span>
          <textarea class="gfield" id="solutionText" rows="3" placeholder="What we’ll offer…"></textarea>
        </label>
        <button class="guest-btn" type="submit">Finish</button>
      </form>
    `);

    app.appendChild(box);

    renderQuestions("step2Fields");
    setupStepNavigation();
    setupInstantSaveForStep1();
  }

  function renderQuestions(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = "";

    const questions = (global.gpQuestions && global.gpQuestions.length) ? global.gpQuestions : staticQuestions;

    questions.forEach(q => {
      let fieldHTML = "";
      if (q.type === "text" || q.type === "number") {
        fieldHTML = `<label class="glabel">${q.label}
          <input class="gfield" type="${q.type}" id="${q.id}" name="${q.id}" value="" />
        </label>`;
      } else if (q.type === "select" && Array.isArray(q.options)) {
        fieldHTML = `<label class="glabel">${q.label}
          <select class="gfield" id="${q.id}" name="${q.id}">
            <option value="">-- Select --</option>
            ${q.options.map(opt => `<option value="${opt}">${opt}</option>`).join("")}
          </select>
        </label>`;
      }
      container.insertAdjacentHTML("beforeend", fieldHTML);
    });

    questions.forEach(q => {
      const input = document.getElementById(q.id);
      if (!input) return;

      input.addEventListener(q.type === "select" ? "change" : "input", (e) => {
        const val = e.target.value.trim();
        const points = val === "" ? 0 : q.weight;
        answers[q.id] = { value: val, points };
        saveAnswer(q.id, val, points);
        updateTotalPoints();
        updatePitchText();
      });
    });
  }

  function setupInstantSaveForStep1() {
    const custName = document.getElementById("custName");
    const custPhone = document.getElementById("custPhone");

    if (custName) {
      custName.addEventListener("input", e => {
        const val = e.target.value.trim();
        answers["custName"] = { value: val, points: val ? 8 : 0 };
        saveAnswer("custName", val, answers["custName"].points);
        updateTotalPoints();
        updatePitchText();
      });
    }
    if (custPhone) {
      custPhone.addEventListener("input", e => {
        const val = e.target.value.trim();
        answers["custPhone"] = { value: val, points: val ? 7 : 0 };
        saveAnswer("custPhone", val, answers["custPhone"].points);
        updateTotalPoints();
        updatePitchText();
      });
    }
  }

  function saveAnswer(questionId, value, points) {
    console.log(`Saved answer: ${questionId} = "${value}", points: ${points}`);

    // Sync progress to Firebase if possible
    if (!global.gpApp?.guestKey || !global.firebase?.database) return;
    const db = global.firebase.database();

    const maxPoints = staticQuestions.reduce((acc, q) => acc + q.weight, 0) + 8 + 7; // include custName/custPhone points
    const total = Object.values(answers).reduce((sum, a) => sum + a.points, 0);
    const percent = Math.min(100, Math.round((total / maxPoints) * 100));

    db.ref(`guestinfo/${global.gpApp.guestKey}/completionPct`).set(percent).catch(() => {
      console.warn("Failed to update progress in Firebase");
    });
  }

  function updateTotalPoints() {
    const maxPoints = staticQuestions.reduce((acc, q) => acc + q.weight, 0) + 8 + 7; // include customer info points
    const total = Object.values(answers).reduce((sum, a) => sum + a.points, 0);
    const percent = Math.min(100, Math.round((total / maxPoints) * 100));
    const progressLabel = document.getElementById("progressLabel");
    const progressBar = document.getElementById("progressBar");
    if (progressLabel) progressLabel.textContent = `Progress: ${percent}%`;
    if (progressBar) progressBar.value = percent;
  }

  function updatePitchText() {
    const answersArr = Object.entries(answers);
    if (!answersArr.length) return;

    let pitch = "Customer Info Summary:\n";
    answersArr.forEach(([qId, {value}]) => {
      if (value) {
        const label = getQuestionLabelById(qId);
        pitch += `${label}: ${value}\n`;
      }
    });

    const solutionText = document.getElementById("solutionText");
    if (solutionText) {
      solutionText.value = pitch.trim();
    }
  }

  function getQuestionLabelById(id) {
    const allQuestions = (global.gpQuestions && global.gpQuestions.length) ? global.gpQuestions : staticQuestions;
    const q = allQuestions.find(q => q.id === id);
    return q ? q.label : id;
  }

  function setupStepNavigation() {
    const step1Form = document.getElementById("step1Form");
    const step2Form = document.getElementById("step2Form");
    const step3Form = document.getElementById("step3Form");

    const revertToStep1 = document.getElementById("gp-revert-step1");
    const revertToStep2 = document.getElementById("gp-revert-step2");

    step1Form.addEventListener("submit", e => {
      e.preventDefault();
      step1Form.classList.add("hidden");
      step2Form.classList.remove("hidden");
      revertToStep1.classList.remove("hidden");
    });

    revertToStep1.addEventListener("click", () => {
      step2Form.classList.add("hidden");
      step1Form.classList.remove("hidden");
      revertToStep1.classList.add("hidden");
    });

    step2Form.addEventListener("submit", e => {
      e.preventDefault();
      step2Form.classList.add("hidden");
      step3Form.classList.remove("hidden");
      revertToStep2.classList.remove("hidden");
    });

    revertToStep2.addEventListener("click", () => {
      step3Form.classList.add("hidden");
      step2Form.classList.remove("hidden");
      revertToStep2.classList.add("hidden");
    });

    step3Form.addEventListener("submit", e => {
      e.preventDefault();
      alert("Process complete. All answers saved.");
      // TODO: add final save logic
    });
  }

  auth.onAuthStateChanged(() => {
    renderUI();
  });

})(window);