/* =======================================================================
 * guestforms-core.js  (Dashboard intake queue core)
 * -----------------------------------------------------------------------
 * Responsibilities
 *   • Config & globals (GUESTINFO_PAGE)
 *   • Realtime caches: guestEntries, guestinfo, users
 *   • Role filters, Today/All toggle
 *   • Table rendering + empty-state CTA
 *   • Delete form
 *   • API shell; heavy actions (continueToGuestInfo, openGuestInfoPage,
 *     startNewLead) are attached by companion modules.
 * ---------------------------------------------------------------------- */
(() => {
  const ROLES = { ME:"me", LEAD:"lead", DM:"dm", ADMIN:"admin" };

  /* ------------------------------------------------------------------ */
  // Config: path to Guest Portal page (overridable before load)
  /* ------------------------------------------------------------------ */
  window.GUESTINFO_PAGE = window.GUESTINFO_PAGE || "../html/guestinfo.html";

  /* ------------------------------------------------------------------ */
  // Shared state (exported so companion modules can read/write)
  /* ------------------------------------------------------------------ */
  const state = {
    bound:false,
    rerenderTimer:null,
    formsCache:{},      // guestEntries
    guestinfoLive:{},   // guestinfo
    usersCache:null,
  };
  window.guestformsState = state; // exposed

  // Today/All flag (persist window-global)
  if (typeof window._guestforms_showAll === "undefined") {
    window._guestforms_showAll = false;
  }

  /* ------------------------------------------------------------------ */
  // Utilities
  /* ------------------------------------------------------------------ */
  function digitsOnly(str){ return (str||"").replace(/\D+/g,""); }
  function esc(str){
    return (str ?? "")
      .toString()
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;")
      .replace(/'/g,"&#39;");
  }
  const startOfTodayMs = () => { const d=new Date(); d.setHours(0,0,0,0); return d.getTime(); };
  const endOfTodayMs   = () => { const d=new Date(); d.setHours(23,59,59,999); return d.getTime(); };
  function isAdvancedStatus(status){
    if (!status) return false;
    const s = status.toLowerCase();
    return s === "proposal" || s === "sold";
  }

  function getUsers(){
    if (window._users) return window._users;
    return state.usersCache || {};
  }
  function userNameAndRole(uid){
    const u = getUsers()[uid];
    if (!u) return {label:"Unknown",roleCss:"role-guest"};
    const r = (u.role||"").toLowerCase();
    return {label:u.name||u.email||uid, roleCss:"role-"+r};
  }

  const isAdmin = r => r === ROLES.ADMIN;
  const isDM    = r => r === ROLES.DM;
  const isLead  = r => r === ROLES.LEAD;
  function canDeleteForm(role){ return isAdmin(role)||isDM(role)||isLead(role); }

  /* ------------------------------------------------------------------ */
  // Visibility for forms by role
  /* ------------------------------------------------------------------ */
  function visibleFormsForRole(formsObj, currentRole, currentUid){
    if (!formsObj) return {};
    const out = {};
    for (const [id,f] of Object.entries(formsObj)){
      // hide if linked guest advanced
      const gid = f.guestinfoKey;
      if (gid){
        const g = state.guestinfoLive[gid] || (window._guestinfo && window._guestinfo[gid]);
        if (g && isAdvancedStatus(g.status)) continue;
      }
      if (isAdmin(currentRole) || isDM(currentRole)){
        out[id]=f; continue;
      }
      const claimedBy = f.consumedBy || f.claimedBy;
      if (!claimedBy || claimedBy === currentUid){
        out[id]=f;
      }
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  // Partition after visibility
  /* ------------------------------------------------------------------ */
  function partitionForms(visForms){
    const unclaimed=[], claimed=[];
    for (const [id,f] of Object.entries(visForms)){
      const claimedBy = f.consumedBy || f.claimedBy;
      if (!claimedBy) unclaimed.push([id,f]); else claimed.push([id,f]);
    }
    unclaimed.sort((a,b)=>(b[1].timestamp||0)-(a[1].timestamp||0));
    claimed.sort((a,b)=>(b[1].timestamp||0)-(a[1].timestamp||0));
    return {unclaimed,claimed};
  }

  /* ------------------------------------------------------------------ */
  // Today filter
  /* ------------------------------------------------------------------ */
  function applyTodayFilter(rows){
    if (window._guestforms_showAll) return rows;
    const startToday = startOfTodayMs();
    const endToday   = endOfTodayMs();
    return rows.filter(([,f])=>{
      const ts = f.timestamp||0;
      return ts>=startToday && ts<=endToday;
    });
  }

  /* ------------------------------------------------------------------ */
  // Row HTML
  /* ------------------------------------------------------------------ */
  function rowHtml(id,f,currentRole,currentUid){
    const ts = f.timestamp ? new Date(f.timestamp).toLocaleString():"-";
    const name  = esc(f.guestName || "-");
    const phone = esc(f.guestPhone||"-");

    const claimedBy = f.consumedBy || f.claimedBy;
    const isClaimed = !!claimedBy;

    // linked guest status
    let status="new";
    if (f.guestinfoKey){
      const g = state.guestinfoLive[f.guestinfoKey] || (window._guestinfo && window._guestinfo[f.guestinfoKey]);
      if (g?.status) status = g.status;
    }
    const statusBadge = `<span class="role-badge role-guest" style="opacity:.8;">${esc(status)}</span>`;

    let claimLabel;
    if (isClaimed){
      const {label,roleCss} = userNameAndRole(claimedBy);
      claimLabel = `<span class="role-badge ${roleCss}" title="${esc(label)}">${esc(label)}</span>`;
    }else{
      claimLabel = `<small style="opacity:.7;">unclaimed</small>`;
    }

    const actionLabel = isClaimed ? "Open":"Continue";
    const delBtn = canDeleteForm(currentRole)
      ? `<button class="btn btn-danger btn-sm" onclick="window.guestforms.deleteGuestFormEntry('${id}')">Delete</button>`
      : "";

    // always call guestforms.continueToGuestInfo
    return `<tr class="${isClaimed?'claimed':''}">
      <td data-label="Name">${name}</td>
      <td data-label="Phone">${phone}</td>
      <td data-label="Submitted">${ts}</td>
      <td data-label="Status">${statusBadge}<br>${claimLabel}</td>
      <td data-label="Action">
        <button class="btn btn-primary btn-sm" onclick="window.guestforms.continueToGuestInfo('${id}')">${actionLabel}</button>
        ${delBtn}
      </td>
    </tr>`;
  }

  /* ------------------------------------------------------------------ */
  // Section builders
  /* ------------------------------------------------------------------ */
  function subsectionHtml(title, rowsHtml){
    const hasRows = rowsHtml && rowsHtml.trim();
    if (!hasRows) return "";
    return `
      <div class="guestforms-subsection">
        <h3 class="guestforms-subheading">${esc(title)}</h3>
        <div class="guest-forms-table-wrap">
          <table class="store-table guest-forms-table table-stackable">
            <thead>
              <tr>
                <th>Name</th><th>Phone</th><th>Submitted</th><th>Status</th><th>Action</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      </div>`;
  }
  function emptyMotivationHtml(){
    return `
      <div class="guestforms-empty-all text-center" style="margin-top:16px;">
        <p><b>All caught up!</b> No guest forms in your queue.</p>
        <p style="opacity:.8;">Go greet a customer and start a new lead.</p>
        <button class="btn btn-primary btn-sm" onclick="window.guestforms.startNewLead()">Start New Lead</button>
      </div>`;
  }

  /* ------------------------------------------------------------------ */
  // Main render
  /* ------------------------------------------------------------------ */
  function renderGuestFormsSection(_unused_forms, pRole, pUid){
    const role = (pRole || window.currentRole || ROLES.ME);
    const uid  = (pUid  || window.currentUid   || null);

    const formsObj = Object.keys(state.formsCache).length ? state.formsCache : (_unused_forms || {});
    const visForms = visibleFormsForRole(formsObj, role, uid);
    const {unclaimed,claimed} = partitionForms(visForms);

    const unFilt = applyTodayFilter(unclaimed);
    const clFilt = applyTodayFilter(claimed);

    const unRows = unFilt.map(([id,f])=>rowHtml(id,f,role,uid)).join("");
    const clRows = clFilt.map(([id,f])=>rowHtml(id,f,role,uid)).join("");

    const unSec = subsectionHtml("Unclaimed",unRows);
    const clSec = subsectionHtml("Claimed",clRows);

    const anyRows  = (unclaimed.length+claimed.length)>0;
    const anyOlder = anyRows && (
      unclaimed.length!==unFilt.length || claimed.length!==clFilt.length
    );
    const toggleBtn = anyOlder
      ? `<button class="btn btn-secondary btn-sm" onclick="window.guestforms.toggleShowAll()">
           ${window._guestforms_showAll?"Show Today":"Show All"}
         </button>` : "";

    const emptyAll = (!unSec && !clSec) ? emptyMotivationHtml() : "";

    return `
      <section id="guest-forms-section" class="admin-section guest-forms-section">
        <h2>Guest Form Submissions</h2>
        <div class="review-controls" style="justify-content:flex-end;">${toggleBtn}</div>
        ${unSec}
        ${clSec}
        ${emptyAll}
      </section>`;
  }

  /* ------------------------------------------------------------------ */
  // DOM patch
  /* ------------------------------------------------------------------ */
  function patchGuestFormsDom(){
    const html = renderGuestFormsSection(null, window.currentRole, window.currentUid);
    const existing = document.getElementById("guest-forms-section");
    if (!existing) return;
    existing.outerHTML = html;
  }
  function scheduleRerender(delay=40){
    if (state.rerenderTimer) return;
    state.rerenderTimer = setTimeout(()=>{
      state.rerenderTimer=null;
      patchGuestFormsDom();
    },delay);
  }

  /* ------------------------------------------------------------------ */
  // Realtime listeners
  /* ------------------------------------------------------------------ */
  function ensureRealtime(){
    if (state.bound) return;
    const db = window.db;
    if (!db) return; // wait for dashboard firebase init
    state.bound = true;

    const formsRef = db.ref("guestEntries");
    formsRef.on("value", snap=>{
      state.formsCache = snap.val() || {};
      scheduleRerender();
    });
    formsRef.on("child_added", snap=>{
      state.formsCache[snap.key]=snap.val();
      scheduleRerender();
    });
    formsRef.on("child_changed", snap=>{
      state.formsCache[snap.key]=snap.val();
      scheduleRerender();
    });
    formsRef.on("child_removed", snap=>{
      delete state.formsCache[snap.key];
      scheduleRerender();
    });

    const giRef = db.ref("guestinfo");
    giRef.on("value", snap=>{
      state.guestinfoLive = snap.val() || {};
      window._guestinfo = state.guestinfoLive; // mirror
      scheduleRerender();
    });

    if (!window._users){
      db.ref("users").once("value", snap=>{
        state.usersCache = snap.val() || {};
        scheduleRerender();
      });
    }
  }

  /* ------------------------------------------------------------------ */
  // Today/All toggle
  /* ------------------------------------------------------------------ */
  function toggleShowAll(){
    window._guestforms_showAll = !window._guestforms_showAll;
    patchGuestFormsDom();
  }

  /* ------------------------------------------------------------------ */
  // Delete intake form
  /* ------------------------------------------------------------------ */
  async function deleteGuestFormEntry(entryId){
    if (!canDeleteForm(window.currentRole)){
      alert("You don't have permission to delete this form.");
      return;
    }
    const entrySnap = await window.db.ref(`guestEntries/${entryId}`).get();
    const entry = entrySnap.val();
    if (!entry) return;
    const linked = !!entry.guestinfoKey;
    const msg = linked
      ? "Delete this guest form submission? (The full guest info record will NOT be deleted.)"
      : "Delete this guest form submission?";
    if (!confirm(msg)) return;
    try{
      await window.db.ref(`guestEntries/${entryId}`).remove();
    }catch(err){
      alert("Error deleting form: "+err.message);
    }
  }

  /* ------------------------------------------------------------------ */
  // API shell (heavy funcs attached later)
  /* ------------------------------------------------------------------ */
  const api = {
    // core
    renderGuestFormsSection,
    toggleShowAll,
    deleteGuestFormEntry,
    ensureRealtime,
    // stubs (replaced by companion modules)
    startNewLead(){
      alert("startNewLead(): guestforms-handoff module not loaded.");
    },
    continueToGuestInfo(entryId){
      alert("continueToGuestInfo(): guestforms-continue module not loaded.");
    },
    openGuestInfoPage(guestKey,entryId){
      alert("openGuestInfoPage(): guestforms-handoff module not loaded.");
    },
    // expose utils/caches for companions
    util:{digitsOnly,esc},
    get caches(){ return state; }
  };

  window.guestforms = api;

  // auto-bind when firebase ready
  if (window.db) ensureRealtime();
})();