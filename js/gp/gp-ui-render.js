// gp-ui-render.js -- builds & injects the entire Guest Portal UI into #guestApp
// Load after gp-core.js & gp-questions.js

(function(global){
  const DASHBOARD_URL = global.DASHBOARD_URL || "../html/admin.html";

  function create(tag, attrs = {}, html = "") {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k,v]) => el.setAttribute(k, v));
    if (html) el.innerHTML = html;
    return el;
  }

  window.addEventListener("DOMContentLoaded", () => {
    const app = document.getElementById("guestApp");
    if (!app) return;

    // Header
    const header = create("header", { class: "guest-header" }, `
      <a id="backToDash" class="guest-back-btn" href="${DASHBOARD_URL}">← Dashboard</a>
      <button id="newLeadBtn" class="guest-btn" type="button">New Lead</button>
    `);
    app.appendChild(header);
    header.querySelector("#backToDash").addEventListener("click", e => {
      if (e.metaKey||e.ctrlKey||e.shiftKey||e.altKey) return;
      e.preventDefault();
      window.location.href = DASHBOARD_URL;
    });
    header.querySelector("#newLeadBtn").addEventListener("click", () => {
      localStorage.removeItem("last_guestinfo_key");
      global.gpApp.open();
    });

    // Progress & NBQ hooks
    app.appendChild(create("div", { id: "gp-progress-hook" }));
    app.appendChild(create("div", { id: "gp-nbq" }));

    // Main box
    const box = create("div", { class: "guest-box" });

    // ** Placeholder for admin panel **
    box.appendChild(create("div", { id: "adminPanelPlaceholder" }));

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
        <button class="guest-btn" type="submit">Save & Continue to Step 2</button>
      </form>
    `);

    // Step 2 form (dynamic fields go in #step2Fields)
    box.insertAdjacentHTML("beforeend", `
      <form id="step2Form" class="hidden" data-step="2">
        <div class="guest-title">
          Step 2: Evaluate
          <span id="gp-revert-step1" class="gp-revert-link hidden">(revert to Step 1)</span>
        </div>
        <div id="step2Fields"></div>
        <button class="guest-btn" type="submit">Save & Continue to Step 3</button>
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

    // Render dynamic questions into #step2Fields
    if (typeof global.renderQuestions === "function") {
      global.renderQuestions("step2Fields");
    }
  });
})(window);