// gp-ui-render.js -- builds Guest Portal UI + in-place Admin panel
// Load after Firebase SDKs, gp-questions.js, and gp-core.js; before gp-app-min.js

(function(global){
  const auth = firebase.auth();
  const DASHBOARD_URL = global.DASHBOARD_URL || "../html/admin.html";

  // helper: create element
  function create(tag, attrs = {}, html = "") {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k,v]) => el.setAttribute(k, v));
    if (html) el.innerHTML = html;
    return el;
  }

  // 1) Always render the core UI on DOMContentLoaded
  function renderUI() {
    const app = document.getElementById("guestApp");
    if (!app) return;

    // header
    const header = create("header", { class: "guest-header" }, `
      <a id="backToDash" class="guest-back-btn" href="${DASHBOARD_URL}">← Dashboard</a>
    `);
    app.appendChild(header);
    header.querySelector("#backToDash").addEventListener("click", e => {
      if (e.metaKey||e.ctrlKey||e.shiftKey||e.altKey) return;
      e.preventDefault();
      window.location.href = DASHBOARD_URL;
    });

    // progress + NBQ hooks
    app.appendChild(create("div", { id: "gp-progress-hook" }));
    app.appendChild(create("div", { id: "gp-nbq" }));

    // main container
    const box = create("div", { class: "guest-box" });

    // placeholder for admin panel
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
        <button class="guest-btn" type="submit">Save &amp; Continue to Step 2</button>
      </form>
    `);

    // Step 2 form
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

    // inject dynamic Step 2 fields
    if (typeof global.renderQuestions === "function") {
      global.renderQuestions("step2Fields");
    }
  }

  // 2) Render the admin panel if user is admin
  function renderAdminPanel() {
    const placeholder = document.getElementById("adminPanelPlaceholder");
    if (!placeholder) return;

    // already rendered?
    if (document.getElementById("adminPanel")) return;

    // build admin panel
    const panel = create("section", { id: "adminPanel", class: "admin-panel" },
      create("h2", {}, "Admin: Manage Step 2 Questions"),
      create("div", { id: "adminQuestionsList", class: "admin-questions-list" }),
      create("h3", {}, "Add New Question"),
      create("form", { id: "adminAddForm" },
        create("input",  { type:"text",    id:"newQLabel",   placeholder:"Label", required:"" }),
        create("select",{ id:"newQType" },
          create("option",{ value:"text"   },"Text"),
          create("option",{ value:"number" },"Number"),
          create("option",{ value:"select" },"Select")
        ),
        create("input",  { type:"number",  id:"newQWeight",  placeholder:"Weight", required:"", min:"0" }),
        create("input",  { type:"text",    id:"newQOptions", placeholder:"Options (comma-separated)", style:"display:none" }),
        create("button",{ type:"submit"   },"Add Question")
      )
    );
    placeholder.appendChild(panel);

    // toggle options
    panel.querySelector("#newQType").addEventListener("change", e => {
      panel.querySelector("#newQOptions").style.display = e.target.value==="select" ? "" : "none";
    });

    // handle add
    panel.querySelector("#adminAddForm").addEventListener("submit", async e => {
      e.preventDefault();
      const label  = e.target.newQLabel.value.trim();
      const type   = e.target.newQType.value;
      const weight = parseInt(e.target.newQWeight.value, 10);
      const opts   = type==="select"
        ? e.target.newQOptions.value.split(",").map(s=>s.trim()).filter(Boolean)
        : [];
      await global.addQuestion({ label, type, weight, options: opts });
      e.target.reset();
      panel.querySelector("#newQOptions").style.display = "none";
    });

    // subscribe & render list
    global.onQuestionsUpdated(renderQuestionsList);
    renderQuestionsList(global.gpQuestions);
  }

  // render the list of questions for admin
  function renderQuestionsList(list) {
    const elList = document.getElementById("adminQuestionsList");
    if (!elList) return;
    elList.innerHTML = "";
    list.forEach(q => {
      const item = create("div", { class:"admin-question-item", "data-id":q.id },
        create("strong", {}, q.label),
        ` [${q.type}] (${q.weight}pts) `,
        create("button",{ class:"adminDelBtn" },"Delete"),
        create("button",{ class:"adminEditBtn" },"Edit")
      );
      elList.appendChild(item);
    });

    // delete handlers
    elList.querySelectorAll(".adminDelBtn").forEach(btn => {
      btn.addEventListener("click", async e => {
        if (!confirm("Remove this question?")) return;
        await global.deleteQuestion(e.target.parentElement.dataset.id);
      });
    });

    // edit handlers
    elList.querySelectorAll(".adminEditBtn").forEach(btn => {
      btn.addEventListener("click", e => startEdit(e.target.parentElement.dataset.id));
    });
  }

  // inline edit flow
  function startEdit(id) {
    const item = document.querySelector(`.admin-question-item[data-id="${id}"]`);
    if (!item) return;
    const q = global.gpQuestions.find(x=>x.id===id);
    item.innerHTML = "";
    const form = create("form",{ class:"adminEditForm" },
      create("input",{ type:"text",   name:"label",  value:q.label, required:"" }),
      create("select",{ name:"type" },
        ["text","number","select"].map(t=>
          create("option",{ value:t, selected:t===q.type }, t)
        )
      ),
      create("input",{ type:"number", name:"weight", value:q.weight, min:"0", required:"" }),
      create("input",{ type:"text",   name:"options", placeholder:"Comma-separated",
                       value:q.options.join(","), style:q.type==="select"?"":"display:none" }),
      create("button",{ type:"submit" },"Save"),
      create("button",{ type:"button", class:"cancelEdit" },"Cancel")
    );
    item.appendChild(form);
    form.type.addEventListener("change", e => {
      form.options.style.display = e.target.value==="select"?"":"none";
    });
    form.cancelEdit.addEventListener("click", ()=> renderQuestionsList(global.gpQuestions));
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const label  = form.label.value.trim();
      const type   = form.type.value;
      const weight = parseInt(form.weight.value,10);
      const opts   = type==="select"
        ? form.options.value.split(",").map(s=>s.trim()).filter(Boolean)
        : [];
      await global.updateQuestion(id, { label, type, weight, options: opts });
    });
  }

  // 3) Wire auth: first render UI, then if admin render panel
  auth.onAuthStateChanged(async user => {
    renderUI();
    if (user) {
      const token = await user.getIdTokenResult();
      if (token.claims.admin) renderAdminPanel();
    }
  });

})(window);