// gp-ui-render.js -- Robust step 2 save/load always
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
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();

  const DASHBOARD_URL = global.DASHBOARD_URL || "../html/admin.html";
  const answers = {};

  function debounce(fn, delay = 250) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

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

    // Header + progress
    const header = create("header", { class: "guest-header" }, `
      <a id="backToDash" class="guest-back-btn" href="${DASHBOARD_URL}">← Dashboard</a>
      <div style="flex-grow:1; max-width: 360px; margin-left: 20px;">
        <label for="progressBar" style="font-weight:bold; font-size:14px; color:#555;">Progress: <span id="progressLabel">0%</span></label>
        <progress id="progressBar" value="0" max="100" style="width:100%; height: 18px; border-radius: 8px;"></progress>
      </div>
    `);
    app.appendChild(header);

    // Steps container
    const container = create("div", { class: "guest-steps-container", style: `display: flex; gap: 24px; flex-wrap: wrap; margin-top: 20px;` });

    // Step 1
    const step1 = create("section", { class: "guest-step" }, `
      <h2>Step 1: Customer Info</h2>
      <label class="glabel">
        Customer Name <span class="gp-pts">(8pts)</span>
        <input class="gfield" type="text" id="custName" placeholder="Full name" />
      </label>
      <label class="glabel">
        Customer Phone <span class="gp-pts">(7pts)</span>
        <input class="gfield" type="tel" id="custPhone" placeholder="Phone number" />
      </label>
    `);

    // Step 2
    const step2 = create("section", { class: "guest-step" }, `
      <h2>Step 2: Evaluate Needs</h2>
      <div id="step2Fields"></div>
    `);

    // Step 3
    const step3 = create("section", { class: "guest-step" }, `
      <h2>Step 3: Proposed Solution <span class="gp-pts">(25pts)</span></h2>
      <textarea class="gfield" id="solutionText" rows="8" placeholder="What we’ll offer…"></textarea>
    `);

    container.appendChild(step1);
    container.appendChild(step2);
    container.appendChild(step3);
    app.appendChild(container);

    renderQuestions("step2Fields");
    setupStep2Save();
    setupInstantSaveForStep1();
    setupSolutionSave();

    if (typeof global.onGuestUIReady === "function") {
      global.onGuestUIReady();
    }
  }

  function renderQuestions(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = "";
    const questions = (global.gpQuestions && global.gpQuestions.length) ? global.gpQuestions : staticQuestions;
    questions.forEach(q => {
      let fieldHTML = "";
      if (q.type === "text" || q.type === "number") {
        fieldHTML = `<label class="glabel">${q.label}<input class="gfield" type="${q.type}" id="${q.id}" name="${q.id}" /></label>`;
      } else if (q.type === "select" && Array.isArray(q.options)) {
        fieldHTML = `<label class="glabel">${q.label}<select class="gfield" id="${q.id}" name="${q.id}"><option value="">-- Select --</option>${q.options.map(opt => `<option value="${opt}">${opt}</option>`).join("")}</select></label>`;
      }
      container.insertAdjacentHTML("beforeend", fieldHTML);
    });
  }

  function setupStep2Save() {
    // Triggers save on any step 2 input change (debounced)
    const fields = document.querySelectorAll("#step2Fields .gfield");
    fields.forEach(f => {
      f.addEventListener(f.tagName === "SELECT" ? "change" : "input", debounce(() => {
        if (global.gpApp && typeof global.gpApp.saveNow === "function") global.gpApp.saveNow();
      }, 250));
    });
  }

  function setupInstantSaveForStep1() {
    const custName = document.getElementById("custName");
    const custPhone = document.getElementById("custPhone");
    if (custName) {
      custName.addEventListener("input", debounce(() => {
        if (global.gpApp && typeof global.gpApp.saveNow === "function") global.gpApp.saveNow();
      }, 250));
    }
    if (custPhone) {
      custPhone.addEventListener("input", debounce(() => {
        if (global.gpApp && typeof global.gpApp.saveNow === "function") global.gpApp.saveNow();
      }, 250));
    }
  }

  function setupSolutionSave() {
    const solutionText = document.getElementById("solutionText");
    if (solutionText) {
      solutionText.addEventListener("input", debounce(() => {
        if (global.gpApp && typeof global.gpApp.saveNow === "function") global.gpApp.saveNow();
      }, 250));
    }
  }

  // Allows programmatically setting Step 2 values
  global.setStep2Fields = function(evaluateObj = {}) {
    const fields = document.querySelectorAll("#step2Fields .gfield");
    fields.forEach(f => {
      if (evaluateObj && typeof evaluateObj[f.id] !== "undefined") {
        f.value = evaluateObj[f.id];
      }
    });
  };

  auth.onAuthStateChanged(() => renderUI());
})(window);