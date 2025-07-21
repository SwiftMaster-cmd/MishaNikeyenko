// gp-ui-render.js -- builds Guest Portal UI without admin panel, with Firebase init
// Load **after** Firebase SDKs, gp-questions.js, and gp-core.js; before gp-app-min.js

(function(global){
  // ───────────────────────────────────────────────────────────────────────────
  // Firebase initialization (in case not already initialized)
  // ───────────────────────────────────────────────────────────────────────────
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

  // ───────────────────────────────────────────────────────────────────────────
  // Constants & helpers
  // ───────────────────────────────────────────────────────────────────────────
  const DASHBOARD_URL = global.DASHBOARD_URL || "../html/admin.html";
  function create(tag, attrs = {}, html = "") {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k,v]) => el.setAttribute(k, v));
    if (html) el.innerHTML = html;
    return el;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 1) Render core UI (forms, nav, progress) on DOMContentLoaded
  // ───────────────────────────────────────────────────────────────────────────
  function renderUI() {
    const app = document.getElementById("guestApp");
    if (!app) return;

    // Header
    const header = create("header", { class: "guest-header" }, `
      <a id="backToDash" class="guest-back-btn" href="${DASHBOARD_URL}">← Dashboard</a>
    `);
    app.appendChild(header);
    header.querySelector("#backToDash").addEventListener("click", e => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
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
          <input class="gfield" type="text" id="custName" placeholder="Full name"/>
        </label>
        <label class="glabel">Customer Phone <span class="gp-pts">(7pts)</span>
          <input class="gfield" type="tel" id="custPhone" placeholder="Phone number"/>
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
          <textarea class="gfield" id="solutionText" rows="3" placeholder="What we’ll offer…"></textarea>
        </label>
        <button class="guest-btn" type="submit">Save Solution</button>
      </form>
    `);

    app.appendChild(box);

    // Render dynamic Step 2 fields
    if (typeof global.renderQuestions === "function") {
      global.renderQuestions("step2Fields");
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 3) On auth change: render UI only, no admin panel
  // ───────────────────────────────────────────────────────────────────────────
  auth.onAuthStateChanged(() => {
    renderUI();
  });

})(window);