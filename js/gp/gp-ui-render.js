(function(global){
  console.log("gp-ui-render.js loaded");

  function create(tag, attrs = {}, html = "") {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k,v]) => el.setAttribute(k, v));
    if (html) el.innerHTML = html;
    return el;
  }

  async function waitForGpQuestions(timeoutMs = 5000) {
    const start = Date.now();
    console.log("Waiting for gpQuestions...");
    while ((!global.gpQuestions || !global.gpQuestions.length) && (Date.now() - start) < timeoutMs) {
      await new Promise(r => setTimeout(r, 100));
    }
    if (!global.gpQuestions || !global.gpQuestions.length) {
      console.error("gpQuestions failed to load within timeout");
      return false;
    }
    console.log("gpQuestions loaded:", global.gpQuestions.length);
    return true;
  }

  function renderUI() {
    console.log("Rendering UI");
    const app = document.getElementById("guestApp");
    if (!app) {
      console.error("No #guestApp element found");
      return;
    }

    app.innerHTML = "";

    const header = create("header", { class: "guest-header" }, `<a href="#" id="backToDash">← Dashboard</a>`);
    app.appendChild(header);
    header.querySelector("#backToDash").addEventListener("click", e => {
      e.preventDefault();
      alert("Dashboard link clicked"); // placeholder action
    });

    app.appendChild(create("div", { id: "gp-progress-hook" }));
    app.appendChild(create("div", { id: "gp-nbq" }));

    const box = create("div", { class: "guest-box" });

    box.insertAdjacentHTML("beforeend", `
      <form id="step1Form" autocomplete="off" data-step="1">
        <div class="guest-title">Step 1: Customer Info</div>
        <label>Customer Name <input type="text" id="custName" required/></label>
        <label>Customer Phone <input type="tel" id="custPhone" required/></label>
        <button type="submit">Next</button>
      </form>
    `);

    box.insertAdjacentHTML("beforeend", `
      <form id="step2Form" class="hidden" data-step="2">
        <div class="guest-title">Step 2: Evaluate <span id="gp-revert-step1" class="gp-revert-link hidden">(Back)</span></div>
        <div id="step2Fields"></div>
        <button type="submit">Next</button>
      </form>
    `);

    box.insertAdjacentHTML("beforeend", `
      <form id="step3Form" class="hidden" data-step="3">
        <div class="guest-title">Step 3: Solution <span id="gp-revert-step2" class="gp-revert-link hidden">(Back)</span></div>
        <label>Proposed Solution <textarea id="solutionText" required></textarea></label>
        <button type="submit">Finish</button>
      </form>
    `);

    app.appendChild(box);

    renderQuestions("step2Fields");
    setupStepNavigation();
  }

  function renderQuestions(containerId) {
    console.log("Rendering questions");
    const container = document.getElementById(containerId);
    if (!container) {
      console.error("No container for questions:", containerId);
      return;
    }

    container.innerHTML = "";

    const questions = global.gpQuestions || [
      { id: "sample1", label: "Sample Question 1", type: "text" },
      { id: "sample2", label: "Sample Question 2", type: "number" },
      { id: "sample3", label: "Sample Select", type: "select", options: ["Option A", "Option B"] }
    ];

    questions.forEach(q => {
      let html = "";
      if (q.type === "text" || q.type === "number") {
        html = `<label>${q.label} <input type="${q.type}" id="${q.id}" name="${q.id}" required></label>`;
      } else if (q.type === "select" && Array.isArray(q.options)) {
        html = `<label>${q.label} <select id="${q.id}" name="${q.id}" required>${q.options.map(opt => `<option>${opt}</option>`).join("")}</select></label>`;
      }
      container.insertAdjacentHTML("beforeend", html);
    });
  }

  function setupStepNavigation() {
    console.log("Setting up step navigation");
    const step1 = document.getElementById("step1Form");
    const step2 = document.getElementById("step2Form");
    const step3 = document.getElementById("step3Form");

    const revert1 = document.getElementById("gp-revert-step1");
    const revert2 = document.getElementById("gp-revert-step2");

    step1.addEventListener("submit", e => {
      e.preventDefault();
      step1.classList.add("hidden");
      step2.classList.remove("hidden");
      revert1.classList.remove("hidden");
    });

    revert1.addEventListener("click", () => {
      step2.classList.add("hidden");
      step1.classList.remove("hidden");
      revert1.classList.add("hidden");
    });

    step2.addEventListener("submit", e => {
      e.preventDefault();
      step2.classList.add("hidden");
      step3.classList.remove("hidden");
      revert2.classList.remove("hidden");
    });

    revert2.addEventListener("click", () => {
      step3.classList.add("hidden");
      step2.classList.remove("hidden");
      revert2.classList.add("hidden");
    });

    step3.addEventListener("submit", e => {
      e.preventDefault();
      alert("Form completed!");
    });
  }

  async function main() {
    try {
      const loaded = await waitForGpQuestions();
      if (!loaded) {
        console.warn("gpQuestions not found, rendering fallback");
      }
    } catch (err) {
      console.error("Error waiting for gpQuestions", err);
    }
    renderUI();
  }

  async function waitForGpQuestions(timeoutMs = 5000) {
    const start = Date.now();
    while ((!global.gpQuestions || !global.gpQuestions.length) && (Date.now() - start) < timeoutMs) {
      await new Promise(r => setTimeout(r, 100));
    }
    return !!(global.gpQuestions && global.gpQuestions.length);
  }

  window.addEventListener("DOMContentLoaded", () => {
    console.log("DOM ready, starting main");
    main();
  });

})(window);