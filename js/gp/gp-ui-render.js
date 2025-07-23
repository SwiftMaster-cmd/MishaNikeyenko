// gp-ui-render.js -- Guest Portal UI rendering with Step 2 container and full logging

(function(global){
  const DASHBOARD_URL = global.DASHBOARD_URL || "../html/admin.html";

  function create(tag, attrs = {}, html = "") {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k,v]) => el.setAttribute(k, v));
    if (html) el.innerHTML = html;
    return el;
  }

  function renderUI() {
    console.log("[gpUI] renderUI called");
    const app = document.getElementById("guestApp");
    if (!app) {
      console.error("[gpUI] #guestApp container not found!");
      return;
    }

    app.innerHTML = "";
    console.log("[gpUI] Cleared #guestApp container");

    // Header with progress bar and back link
    const header = create("header", { class: "guest-header", style: "display:flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #ccc;" }, `
      <a id="backToDash" class="guest-back-btn" href="${DASHBOARD_URL}" style="font-weight:bold; font-size:18px; color:#333; text-decoration:none;">← Dashboard</a>
      <div style="flex-grow:1; max-width: 360px; margin-left: 20px;">
        <label for="progressBar" style="font-weight:bold; font-size:14px; color:#555;">Progress: <span id="progressLabel">0%</span></label>
        <progress id="progressBar" value="0" max="100" style="width:100%; height: 18px; border-radius: 8px;"></progress>
      </div>
    `);
    app.appendChild(header);
    console.log("[gpUI] Header appended");

    header.querySelector("#backToDash").addEventListener("click", e => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      console.log("[gpUI] Dashboard back link clicked");
      window.location.href = DASHBOARD_URL;
    });

    // Container for steps
    const container = create("div", { class: "guest-steps-container", style: `
      display: flex; 
      gap: 24px; 
      flex-wrap: wrap; 
      margin-top: 20px;
    ` });

    // Step 1: Customer Info
    const step1 = create("section", { class: "guest-step", style: `
      flex: 1 1 300px;
      background: #f7f7f7;
      padding: 20px;
      border-radius: 10px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.1);
      border: 1px solid #ddd;
    ` });
    step1.innerHTML = `
      <h2 style="margin-top:0; font-size: 22px; color: #222;">Step 1: Customer Info</h2>
      <label class="glabel" style="display:block; margin-bottom:16px; font-weight: 600; color:#444;">
        Customer Name <span class="gp-pts">(8pts)</span>
        <input class="gfield" type="text" id="custName" placeholder="Full name" style="width: 100%; padding: 10px; border-radius: 6px; border: 1px solid #ccc; font-size: 16px; margin-top: 6px;"/>
      </label>
      <label class="glabel" style="display:block; margin-bottom:16px; font-weight: 600; color:#444;">
        Customer Phone <span class="gp-pts">(7pts)</span>
        <input class="gfield" type="tel" id="custPhone" placeholder="Phone number" style="width: 100%; padding: 10px; border-radius: 6px; border: 1px solid #ccc; font-size: 16px; margin-top: 6px;"/>
      </label>
    `;
    console.log("[gpUI] Step 1 content created");

    // Step 2: Evaluate Needs container (empty; filled by gp-step2.js)
    const step2 = create("section", { class: "guest-step", style: `
      flex: 2 1 600px;
      background: #fff;
      padding: 20px;
      border-radius: 10px;
      box-shadow: 0 1px 6px rgba(0,0,0,0.12);
      border: 1px solid #ddd;
      max-height: 90vh;
      overflow-y: auto;
    ` });
    step2.innerHTML = `
      <h2 style="margin-top:0; font-size: 22px; color: #222;">Step 2: Evaluate Needs</h2>
      <div id="step2Fields"></div>
    `;
    console.log("[gpUI] Step 2 container created");

    // Step 3: Proposed Solution
    const step3 = create("section", { class: "guest-step", style: `
      flex: 1 1 300px;
      background: #f7f7f7;
      padding: 20px;
      border-radius: 10px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.1);
      border: 1px solid #ddd;
      display: flex;
      flex-direction: column;
    ` });
    step3.innerHTML = `
      <h2 style="margin-top:0; font-size: 22px; color: #222; margin-bottom:12px;">Step 3: Proposed Solution <span class="gp-pts">(25pts)</span></h2>
      <textarea class="gfield" id="solutionText" rows="8" placeholder="What we’ll offer…" style="width: 100%; padding: 12px; border-radius: 6px; border: 1px solid #ccc; font-size: 16px; resize: vertical; flex-grow: 1;"></textarea>
    `;
    console.log("[gpUI] Step 3 content created");

    container.appendChild(step1);
    container.appendChild(step2);
    container.appendChild(step3);

    app.appendChild(container);
    console.log("[gpUI] Steps container appended to #guestApp");

    // Fire any post-render hook (for example, gp-step2 init)
    if (typeof global.onGuestUIReady === "function") {
      console.log("[gpUI] Calling onGuestUIReady hook");
      global.onGuestUIReady();
    }
  }

  global.renderUI = renderUI;

  // Automatically render UI on auth ready or page load if needed
  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", () => {
      console.log("[gpUI] DOMContentLoaded event");
      renderUI();
    });
  } else {
    console.log("[gpUI] Document already loaded, rendering UI immediately");
    renderUI();
  }

})(window);