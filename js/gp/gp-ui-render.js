// gp-ui-render.js -- builds Guest Portal UI, step navigation, dynamic Step 2 fields, no admin panel
// Load **after** Firebase SDKs, gp-questions.js, and gp-core.js; before gp-app-min.js

(function(global){
  // Firebase initialization (in case not already initialized)
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
  function create(tag, attrs = {}, html = "") {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k,v]) => el.setAttribute(k, v));
    if (html) el.innerHTML = html;
    return el;
  }

  function renderUI() {
    const app = document.getElementById("guestApp");
    if (!app) return;

    // Clear app content first
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

    // Progress & NBQ placeholders
    app.appendChild(create("div", { id: "gp-progress-hook" }));
    app.appendChild(create("div", { id: "gp-nbq" }));

    // Main container
    const box = create("div", { class: "guest-box" });

    // Step 1 form
    box.insertAdjacentHTML("beforeend", `
      <form id="step1Form" autocomplete="off" data-step="1">
        <div class="guest-title">Step 1: Customer Info</div>
        <label class="glabel">Customer Name <span class="gp-pts">(8pts)</span>
          <input class="gfield" type="text" id="custName" placeholder="Full name" required/>
        </label>
        <label class="glabel">Customer Phone <span class="gp-pts">(7pts)</span>
          <input class="gfield" type="tel" id="custPhone" placeholder="Phone number" required/>
        </label>
        <button class="guest-btn" type="submit">Save &amp; Continue to Step 2</button>
      </form>
    `);

    // Step 2 form (dynamic questions)
    box.insertAdjacentHTML("beforeend", `
      <form id="step2Form" class="hidden" data-step="2">
        <div class="guest-title">
          Step 2: Evaluate
          <span id="gp-revert-step1" class="gp-revert-link hidden">(revert to Step 1)</span>
        </div>
        <div id="step2Fields"></div>
        <button class="guest-btn" type="submit">Save &amp; Continue to Step 3</button>
      </form>
    `);

    // Step 3 form
    box.insertAdjacentHTML("beforeend", `
      <form id="step3Form" class="hidden" data-step="3">
        <div class="guest-title">
          Step 3: Solution
          <span id="gp-revert-step2" class="gp-revert-link hidden">(revert to Step 2)</span>
        </div>
        <label class="glabel">Proposed Solution <span class="gp-pts">(25pts)</span>
          <textarea class="gfield" id="solutionText" rows="3" placeholder="What we’ll offer…" required></textarea>
        </label>
        <button class="guest-btn" type="submit">Save Solution</button>
      </form>
    `);

    app.appendChild(box);

    // Render dynamic Step 2 fields
    renderQuestions("step2Fields");

    // Setup form navigation handlers
    setupStepNavigation();
  }

  // Example dynamic questions renderer (replace or expand with your real questions)
  function renderQuestions(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Clear first
    container.innerHTML = "";

    // Example questions array (replace with your actual questions source)
    const questions = [
      { id: "currentCarrier", label: "Current Carrier", type: "text" },
      { id: "numLines", label: "Number of Lines", type: "number" },
      { id: "coverageZip", label: "Coverage Zip Code", type: "text" }
    ];

    questions.forEach(q => {
      let fieldHTML = "";
      if (q.type === "text" || q.type === "number") {
        fieldHTML = `<label class="glabel">${q.label}
          <input class="gfield" type="${q.type}" id="${q.id}" name="${q.id}" required/>
        </label>`;
      }
      // Add other input types if needed

      container.insertAdjacentHTML("beforeend", fieldHTML);
    });
  }

  // Setup navigation between steps with revert links
  function setupStepNavigation() {
    const step1Form = document.getElementById("step1Form");
    const step2Form = document.getElementById("step2Form");
    const step3Form = document.getElementById("step3Form");

    const revertToStep1 = document.getElementById("gp-revert-step1");
    const revertToStep2 = document.getElementById("gp-revert-step2");

    step1Form.addEventListener("submit", e => {
      e.preventDefault();

      // Basic validation
      if (!step1Form.custName.value.trim() || !step1Form.custPhone.value.trim()) {
        alert("Please fill in all fields in Step 1.");
        return;
      }

      // Hide Step 1, show Step 2
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

      // Validate all Step 2 inputs
      const inputs = step2Form.querySelectorAll("input");
      for (const input of inputs) {
        if (!input.value.trim()) {
          alert("Please fill in all Step 2 fields.");
          return;
        }
      }

      // Hide Step 2, show Step 3
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

      if (!step3Form.solutionText.value.trim()) {
        alert("Please enter a proposed solution.");
        return;
      }

      // Submit data or perform save here
      alert("Solution saved. Process complete.");
      // Optionally reset all forms or redirect here
    });
  }

  auth.onAuthStateChanged(() => {
    renderUI();
  });

})(window);