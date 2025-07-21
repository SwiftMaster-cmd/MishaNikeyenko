// gi-container.js
(function(global){
  const { groupByStatus, statusSectionHtml, detectStatus } = global.giRender;
  const {
    toggleEdit, cancelEdit, saveEdit, deleteGuestInfo,
    markSold, deleteSale, openGuestInfoPage,
    recomputePitch, toggleActionButtons
  } = global.giAction;

  // ── Time & date helpers ────────────────────────────────────────────────────
  function msNDaysAgo(n) { return Date.now() - n * 864e5; }
  function latestActivityTs(g) {
    return Math.max(
      g.updatedAt || 0,
      g.submittedAt || 0,
      g.sale  ?.soldAt       || 0,
      g.solution?.completedAt || 0
    );
  }
  function inCurrentWeek(g) { return latestActivityTs(g) >= msNDaysAgo(7); }
  function dateToISO(ts) { return ts ? new Date(ts).toISOString().slice(0,10) : ''; }

  // ── Role-based filtering ───────────────────────────────────────────────────
  function getUsersUnderDM(users, dmUid) {
    const leads = Object.entries(users)
      .filter(([,u]) => u.role==="lead" && u.assignedDM===dmUid)
      .map(([uid])=>uid);
    const mes = Object.entries(users)
      .filter(([,u]) => u.role==="me" && leads.includes(u.assignedLead))
      .map(([uid])=>uid);
    return new Set([...leads, ...mes]);
  }
  function filterByRole(guestinfo, users, uid, role) {
    if(!guestinfo||!users||!uid||!role) return {};
    if(role==="admin") return guestinfo;
    if(role==="dm"){
      const under = getUsersUnderDM(users,uid);
      under.add(uid);
      return Object.fromEntries(
        Object.entries(guestinfo)
          .filter(([,g])=>under.has(g.userUid))
      );
    }
    if(role==="lead"){
      const mes = Object.entries(users)
        .filter(([,u])=>u.role==="me" && u.assignedLead===uid)
        .map(([uid])=>uid);
      const vis = new Set([...mes,uid]);
      return Object.fromEntries(
        Object.entries(guestinfo)
          .filter(([,g])=>vis.has(g.userUid))
      );
    }
    // role==="me"
    return Object.fromEntries(
      Object.entries(guestinfo)
        .filter(([,g])=>g.userUid===uid)
    );
  }

  // ── Filter state ───────────────────────────────────────────────────────────
  function ensureFilters(){
    if(!global._gf){
      global._gf = {
        name: "",
        employee: "",
        date: "",
        filterMode: "week",
        showProposals: false,
        soldOnly: false
      };
    }
  }

  // ── Build filter panel (only once) ────────────────────────────────────────
  function renderControls(){
    ensureFilters();
    if(document.getElementById("filter-panel-inner")) return; // already rendered

    const container = document.getElementById("guestinfo-container");
    container.innerHTML = `
      <div id="guestinfo-controls-wrapper" style="margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <button id="filter-toggle-btn" class="btn btn-primary btn-sm">Filters ▾</button>
          <button class="btn btn-success btn-sm" onclick="window.guestinfo.createNewLead()">+ New Lead</button>
        </div>
        <div id="filter-panel" style="display:none;margin-top:8px;">
          <div id="filter-panel-inner" style="display:flex;flex-wrap:wrap;gap:8px;"></div>
        </div>
      </div>
      <div id="guestinfo-results"></div>
    `;

    const inner = document.getElementById("filter-panel-inner");
    inner.innerHTML = `
      <div class="search-wrapper">
        <input id="filter-name" type="text" placeholder="🔍 Customer name…" class="form-control form-control-sm" />
        <button class="clear-btn" onclick="window.guestinfo.clearSearchName()">×</button>
      </div>
      <div class="search-wrapper">
        <input id="filter-emp" type="text" placeholder="🔍 Employee…" class="form-control form-control-sm" />
        <button class="clear-btn" onclick="window.guestinfo.clearSearchEmployee()">×</button>
      </div>
      <div class="search-wrapper">
        <input id="filter-date" type="date" class="form-control form-control-sm" />
        <button class="clear-btn" onclick="window.guestinfo.clearSearchDate()">×</button>
      </div>
      <button id="filter-weekall-btn" class="btn btn-secondary btn-sm">This Week</button>
      <button id="filter-prop-btn" class="btn btn-warning btn-sm">Follow-Ups</button>
      <button id="filter-sold-btn" class="btn btn-secondary btn-sm">Sales</button>
      <button id="filter-clearall-btn" class="btn btn-sm">Clear All</button>
    `;

    // toggle panel
    document.getElementById("filter-toggle-btn")
      .addEventListener("click",()=>{
        const p = document.getElementById("filter-panel");
        const open = p.style.display==="flex";
        p.style.display = open ? "none" : "flex";
        document.getElementById("filter-toggle-btn").textContent = open ? "Filters ▾" : "Filters ▴";
      });

    // wire inputs
    document.getElementById("filter-name")
      .addEventListener("input", e=> window.guestinfo.setSearchName(e.target.value));
    document.getElementById("filter-emp")
      .addEventListener("input", e=> window.guestinfo.setSearchEmployee(e.target.value));
    document.getElementById("filter-date")
      .addEventListener("change", e=> window.guestinfo.setSearchDate(e.target.value));
    document.getElementById("filter-weekall-btn")
      .addEventListener("click",()=> window.guestinfo.toggleFilterMode());
    document.getElementById("filter-prop-btn")
      .addEventListener("click",()=> window.guestinfo.toggleShowProposals());
    document.getElementById("filter-sold-btn")
      .addEventListener("click",()=> window.guestinfo.toggleSoldOnly());
    document.getElementById("filter-clearall-btn")
      .addEventListener("click",()=> window.guestinfo.clearAllFilters());
  }

  // ── Render results only ───────────────────────────────────────────────────
  function renderResults(){
    ensureFilters();
    const f = global._gf;
    const data = global._guestinfoData;
    if(!data) return;
    let items = filterByRole(data.guestinfo, data.users, data.uid, data.role);

    if(f.name)     items = Object.fromEntries(Object.entries(items)
                      .filter(([,g])=>g.custName.toLowerCase().includes(f.name.toLowerCase())));
    if(f.employee) items = Object.fromEntries(Object.entries(items)
                      .filter(([,g])=>{
                        const sub = data.users[g.userUid]||{};
                        const n = (sub.name||sub.email||"").toLowerCase();
                        return n.includes(f.employee.toLowerCase());
                      }));
    if(f.date)     items = Object.fromEntries(Object.entries(items)
                      .filter(([,g])=>dateToISO(g.submittedAt)===f.date));

    if(!f.showProposals && !f.soldOnly && f.filterMode==="week" && data.role!=="me"){
      items = Object.fromEntries(Object.entries(items)
                .filter(([,g])=>inCurrentWeek(g)));
    }

    const groups = groupByStatus(items);
    let html = "";

    if(f.soldOnly){
      html = statusSectionHtml("Sales", groups.sold, data.users, data.uid, data.role)
           || `<div class="guestinfo-subsection-empty"><i>None.</i></div>`;
    }
    else if(f.showProposals){
      html = statusSectionHtml("Follow-Ups", groups.proposal, data.users, data.uid, data.role, true)
           || `<div class="guestinfo-subsection-empty"><i>None.</i></div>`;
    }
    else {
      html += statusSectionHtml("New",     groups.new,     data.users, data.uid, data.role);
      html += statusSectionHtml("Working", groups.working, data.users, data.uid, data.role);
      html += statusSectionHtml("Proposal",groups.proposal,data.users, data.uid, data.role);
      html += statusSectionHtml("Sold",    groups.sold,    data.users, data.uid, data.role);
    }

    document.getElementById("guestinfo-results").innerHTML = html;
  }

  // ── Public render entry ───────────────────────────────────────────────────
  function renderGuestinfoSection(guestinfo, users, uid, role){
    global._guestinfoData = { guestinfo, users, uid, role };
    renderControls();
    renderResults();
  }

  // ── Filter setters & clears ───────────────────────────────────────────────
  function setSearchName(val){
    ensureFilters(); global._gf.name = val; renderResults();
  }
  function clearSearchName(){
    ensureFilters(); global._gf.name = ""; renderResults();
  }
  function setSearchEmployee(val){
    ensureFilters(); global._gf.employee = val; renderResults();
  }
  function clearSearchEmployee(){
    ensureFilters(); global._gf.employee = ""; renderResults();
  }
  function setSearchDate(val){
    ensureFilters(); global._gf.date = val; renderResults();
  }
  function clearSearchDate(){
    ensureFilters(); global._gf.date = ""; renderResults();
  }
  function toggleFilterMode(){
    ensureFilters();
    const f = global._gf;
    f.filterMode = f.filterMode==="week" ? "all" : "week";
    f.showProposals = false;
    f.soldOnly = false;
    renderResults();
  }
  function toggleShowProposals(){
    ensureFilters();
    const f = global._gf;
    f.showProposals = !f.showProposals;
    f.soldOnly = false;
    renderResults();
  }
  function toggleSoldOnly(){
    ensureFilters();
    const f = global._gf;
    f.soldOnly = !f.soldOnly;
    f.showProposals = false;
    renderResults();
  }
  function clearAllFilters(){
    global._gf = { name:"",employee:"",date:"",filterMode:"week",showProposals:false,soldOnly:false };
    renderResults();
  }

  function createNewLead(){
    try{ localStorage.removeItem("last_guestinfo_key"); }catch{}
    window.location.href = (window.GUESTINFO_PAGE||"../guestinfo.html").split("?")[0];
  }

  // ── Expose API ────────────────────────────────────────────────────────────
  global.guestinfo = {
    renderGuestinfoSection,
    setSearchName, clearSearchName,
    setSearchEmployee, clearSearchEmployee,
    setSearchDate, clearSearchDate,
    toggleFilterMode,
    toggleShowProposals,
    toggleSoldOnly,
    clearAllFilters,
    toggleActionButtons,
    toggleEdit,
    cancelEdit,
    saveEdit,
    deleteGuestInfo,
    markSold,
    deleteSale,
    openGuestInfoPage,
    createNewLead,
    recomputePitch
  };

})(window);