/* guestform-core.js ==========================================================
 * Dashboard Intake Queue (lightweight core)
 *
 * Responsibilities
 *   ✓ Maintain local realtime caches of guestEntries + guestinfo + users.
 *   ✓ Role-based visibility & Today/All filtering.
 *   ✓ Render Unclaimed / Claimed tables + empty state.
 *   ✓ Provide small navigation helpers (calls gpHandoff.open()).
 *   ✓ Expose caches & hooks used by guestform-actions.js (heavy ops).
 *
 * Deferred to guestform-actions.js (optional extension)
 *   ✗ Creating guestinfo from an intake form when "Continue" clicked.
 *   ✗ Ensuring claimed/consumed metadata.
 *   ✗ Deleting intake rows (with permission checks).
 *
 * If guestform-actions.js is *not* loaded, Continue/Open will simply
 * hand off to gpHandoff with whatever data we currently know (no create).
 * ------------------------------------------------------------------------ */

(function(){

  /* ----------------------------------------------------------------------
   * CONFIG
   * -------------------------------------------------------------------- */
  const ROLES = { ME:"me", LEAD:"lead", DM:"dm", ADMIN:"admin" };
  const DEFAULT_DEST = "../html/guestinfo.html";  // fallback; can override via window.GUESTINFO_PAGE

  // Ensure a global path override exists (let other modules override before load)
  window.GUESTINFO_PAGE = window.GUESTINFO_PAGE || DEFAULT_DEST;

  /* ----------------------------------------------------------------------
   * LOCAL STATE / CACHES (live)
   * -------------------------------------------------------------------- */
  let _bound          = false;   // realtime bound?
  let _rerenderTimer  = null;

  // Mirror DB nodes
  let _formsCache     = {};      // guestEntries
  let _guestinfoLive  = {};      // guestinfo
  let _usersCache     = null;    // users (optional preload)

  // Today/All UI flag (persist window so re-renders survive hot rebuild)
  if (typeof window._guestforms_showAll === "undefined") window._guestforms_showAll = false;

  /* ----------------------------------------------------------------------
   * Cache accessors (for guestform-actions.js)
   * -------------------------------------------------------------------- */
  function getFormsCache(){ return _formsCache; }
  function getGuestinfoCache(){ return _guestinfoLive; }
  function getUsersCache(){ return window._users || _usersCache || {}; }
  function setGuestinfoCache(obj){ _guestinfoLive = obj||{}; window._guestinfo = _guestinfoLive; }
  function setFormsCache(obj){ _formsCache = obj||{}; }

  /* ----------------------------------------------------------------------
   * Role helpers
   * -------------------------------------------------------------------- */
  const isAdmin = r => r === ROLES.ADMIN;
  const isDM    = r => r === ROLES.DM;
  const isLead  = r => r === ROLES.LEAD;
  function canDeleteForm(role){ return isAdmin(role) || isDM(role) || isLead(role); }

  /* ----------------------------------------------------------------------
   * Utilities
   * -------------------------------------------------------------------- */
  const digitsOnly = str => (str||"").replace(/\D+/g,"");
  function esc(str){
    return (str ?? "")
      .toString()
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;")
      .replace(/'/g,"&#39;");
  }

  /* ----------------------------------------------------------------------
   * Dates (local tz)
   * -------------------------------------------------------------------- */
  const startOfTodayMs = () => { const d=new Date(); d.setHours(0,0,0,0); return d.getTime(); };
  const endOfTodayMs   = () => { const d=new Date(); d.setHours(23,59,59,999); return d.getTime(); };

  /* ----------------------------------------------------------------------
   * Hide intake when linked guest advanced past queue relevance
   * -------------------------------------------------------------------- */
  function isAdvancedStatus(status){
    if (!status) return false;
    const s = status.toLowerCase();
    return s === "proposal" || s === "sold";
  }

  /* ----------------------------------------------------------------------
   * Lookup helper (users)
   * -------------------------------------------------------------------- */
  function userNameAndRole(uid){
    const u = getUsersCache()[uid];
    if (!u) return {label: "Unknown", roleCss:"role-guest"};
    const r = (u.role||"").toLowerCase();
    return {
      label: u.name || u.email || uid,
      roleCss: "role-" + r
    };
  }

  /* ----------------------------------------------------------------------
   * Role-based visibility (forms)
   * -------------------------------------------------------------------- */
  function visibleFormsForRole(formsObj, currentRole, currentUid){
    if (!formsObj) return {};
    const out = {};
    for (const [id,f] of Object.entries(formsObj)){
      // Hide if linked guest advanced
      const gid = f.guestinfoKey;
      if (gid){
        const g = _guestinfoLive[gid] || (window._guestinfo && window._guestinfo[gid]);
        if (g && isAdvancedStatus(g.status)) continue;
      }

      if (isAdmin(currentRole) || isDM(currentRole)){
        out[id] = f;
        continue;
      }

      const claimedBy = f.consumedBy || f.claimedBy;
      if (!claimedBy || claimedBy === currentUid){
        out[id] = f;
      }
    }
    return out;
  }

  /* ----------------------------------------------------------------------
   * Partition + sort (newest first)
   * -------------------------------------------------------------------- */
  function partitionForms(visForms){
    const unclaimed = [];
    const claimed   = [];
    for (const [id,f] of Object.entries(visForms)){
      const claimedBy = f.consumedBy || f.claimedBy;
      if (!claimedBy){
        unclaimed.push([id,f]);
      } else {
        claimed.push([id,f]);
      }
    }
    unclaimed.sort((a,b)=>(b[1].timestamp||0)-(a[1].timestamp||0));
    claimed.sort((a,b)=>(b[1].timestamp||0)-(a[1].timestamp||0));
    return {unclaimed, claimed};
  }

  /* ----------------------------------------------------------------------
   * Today/All filter (after partition)
   * -------------------------------------------------------------------- */
  function applyTodayFilter(rows){
    if (window._guestforms_showAll) return rows;
    const startToday = startOfTodayMs();
    const endToday   = endOfTodayMs();
    return rows.filter(([,f])=>{
      const ts = f.timestamp || 0;
      return ts >= startToday && ts <= endToday;
    });
  }

  /* ----------------------------------------------------------------------
   * Row renderer
   * -------------------------------------------------------------------- */
  function rowHtml(id, f, currentRole, currentUid){
    const ts    = f.timestamp ? new Date(f.timestamp).toLocaleString() : "-";
    const name  = esc(f.guestName || "-");
    const phone = esc(f.guestPhone || "-");

    const claimedBy = f.consumedBy || f.claimedBy;
    const isClaimed = !!claimedBy;

    // linked guest status
    let status = "new";
    if (f.guestinfoKey){
      const g = _guestinfoLive[f.guestinfoKey] || (window._guestinfo && window._guestinfo[f.guestinfoKey]);
      if (g?.status) status = g.status;
    }
    const statusBadge = `<span class="role-badge role-guest" style="opacity:.8;">${esc(status)}</span>`;

    let claimLabel;
    if (isClaimed){
      const {label, roleCss} = userNameAndRole(claimedBy);
      claimLabel = `<span class="role-badge ${roleCss}" title="${esc(label)}">${esc(label)}</span>`;
    } else {
      claimLabel = `<small style="opacity:.7;">unclaimed</small>`;
    }

    const actionLabel = isClaimed ? "Open" : "Continue";
    const delBtn = canDeleteForm(currentRole)
      ? `<button class="btn btn-danger btn-sm" onclick="window.guestforms.deleteGuestFormEntry('${id}')">Delete</button>`
      : "";

    // Always call guestforms.continueToGuestInfo(id) – actions module may intercept.
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

  /* ----------------------------------------------------------------------
   * Subsection builder
   * -------------------------------------------------------------------- */
  function subsectionHtml(title, rowsHtml){
    const hasRows = rowsHtml && rowsHtml.trim().length;
    if (!hasRows) return "";
    return `
      <div class="guestforms-subsection">
        <h3 class="guestforms-subheading">${esc(title)}</h3>
        <div class="guest-forms-table-wrap">
          <table class="store-table guest-forms-table table-stackable">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Submitted</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      </div>`;
  }

  /* ----------------------------------------------------------------------
   * Empty-state CTA
   * -------------------------------------------------------------------- */
  function emptyMotivationHtml(){
    return `
      <div class="guestforms-empty-all text-center" style="margin-top:16px;">
        <p><b>All caught up!</b> No guest forms in your queue.</p>
        <p style="opacity:.8;">Go greet a customer and start a new lead.</p>
        <button class="btn btn-primary btn-sm" onclick="window.guestforms.startNewLead()">Start New Lead</button>
      </div>`;
  }

  /* ----------------------------------------------------------------------
   * Main renderer
   * -------------------------------------------------------------------- */
  function renderGuestFormsSection(_unused_forms, pRole, pUid){
    const role = (pRole || window.currentRole || ROLES.ME);
    const uid  = (pUid  || window.currentUid   || null);

    const formsObj = Object.keys(_formsCache).length ? _formsCache : (_unused_forms || {});
    const visForms = visibleFormsForRole(formsObj, role, uid);
    const {unclaimed, claimed} = partitionForms(visForms);

    const unclaimedFilt = applyTodayFilter(unclaimed);
    const claimedFilt   = applyTodayFilter(claimed);

    const unclaimedRowsHtml = unclaimedFilt.map(([id,f])=>rowHtml(id,f,role,uid)).join("");
    const claimedRowsHtml   = claimedFilt.map(([id,f])=>rowHtml(id,f,role,uid)).join("");

    const unclaimedSec = subsectionHtml("Unclaimed", unclaimedRowsHtml);
    const claimedSec   = subsectionHtml("Claimed",   claimedRowsHtml);

    // Show Today/All toggle only when older rows exist
    const anyRows  = (unclaimed.length + claimed.length) > 0;
    const anyOlder = anyRows && (
      unclaimed.length !== unclaimedFilt.length ||
      claimed.length   !== claimedFilt.length
    );
    const toggleBtn = anyOlder
      ? `<button class="btn btn-secondary btn-sm" onclick="window.guestforms.toggleShowAll()">
           ${window._guestforms_showAll ? "Show Today" : "Show All"}
         </button>`
      : "";

    const emptyAll = (!unclaimedSec && !claimedSec) ? emptyMotivationHtml() : "";

    return `
      <section id="guest-forms-section" class="admin-section guest-forms-section">
        <h2>Guest Form Submissions</h2>
        <div class="review-controls" style="justify-content:flex-end;">${toggleBtn}</div>
        ${unclaimedSec}
        ${claimedSec}
        ${emptyAll}
      </section>
    `;
  }

  /* ----------------------------------------------------------------------
   * DOM patcher (light rerender)
   * -------------------------------------------------------------------- */
  function patchGuestFormsDom(){
    const html = renderGuestFormsSection(null, window.currentRole, window.currentUid);
    const existing = document.getElementById("guest-forms-section");
    if (!existing) return;
    existing.outerHTML = html;
  }
  function scheduleRerender(delay=40){
    if (_rerenderTimer) return;
    _rerenderTimer = setTimeout(()=>{
      _rerenderTimer = null;
      patchGuestFormsDom();
    }, delay);
  }

  /* ----------------------------------------------------------------------
   * Realtime wiring (dashboard supplies window.db)
   * -------------------------------------------------------------------- */
  function ensureRealtime(){
    if (_bound) return;
    const db = window.db;
    if (!db) return; // wait until dashboard firebase ready

    _bound = true;

    /* guestEntries realtime */
    const formsRef = db.ref("guestEntries");
    formsRef.on("value", snap => {
      _formsCache = snap.val() || {};
      scheduleRerender();
    });
    formsRef.on("child_added", snap => {
      _formsCache[snap.key] = snap.val();
      scheduleRerender();
    });
    formsRef.on("child_changed", snap => {
      _formsCache[snap.key] = snap.val();
      scheduleRerender();
    });
    formsRef.on("child_removed", snap => {
      delete _formsCache[snap.key];
      scheduleRerender();
    });

    /* guestinfo realtime (for status updates / hide advanced) */
    const giRef = db.ref("guestinfo");
    giRef.on("value", snap => {
      setGuestinfoCache(snap.val() || {});
      scheduleRerender();
    });

    /* preload users if missing */
    if (!window._users){
      db.ref("users").once("value", snap => {
        _usersCache = snap.val() || {};
        scheduleRerender();
      });
    }
  }

  /* ----------------------------------------------------------------------
   * Toggle Today/All
   * -------------------------------------------------------------------- */
  function toggleShowAll(){
    window._guestforms_showAll = !window._guestforms_showAll;
    patchGuestFormsDom();
  }

  /* ----------------------------------------------------------------------
   * Simple navigation helpers (no side-effects)
   * -------------------------------------------------------------------- */
  function startNewLead(){
    // direct to portal blank; gp-app will create on save
    gpHandoff.open({
      dest: window.GUESTINFO_PAGE,
      prefilledStep1:false
    });
  }

  /**
   * continueToGuestInfo(entryId)
   * Lightweight wrapper: if guestform-actions.js loaded, delegate to it.
   * Otherwise, best-effort handoff: if linked gid exists -> open; else
   * just send name/phone (Step1) and entry param; gp-app will seed as new.
   */
  function continueToGuestInfo(entryId){
    if (window.guestformsActions && typeof window.guestformsActions.continueFromEntry === "function"){
      window.guestformsActions.continueFromEntry(entryId);
      return;
    }
    // fallback lightweight path (no create)
    const f = _formsCache[entryId];
    if (!f){
      alert("Guest form not found.");
      return;
    }
    gpHandoff.open({
      gid:   f.guestinfoKey || null,
      entry: entryId,
      name:  f.guestName  || "",
      phone: f.guestPhone || f.guestPhoneDigits || "",
      status: f.status || "new",
      prefilledStep1: !!(f.guestName || f.guestPhone)
    });
  }

  /**
   * openGuestInfoPage(gid, entryId?)
   * Used by other dashboard components (guestinfo cards, etc.).
   * We simply package what we know & call gpHandoff.open().
   */
  function openGuestInfoPage(gid, entryId){
    let g = null;
    if (gid){
      g = _guestinfoLive[gid] || (window._guestinfo && window._guestinfo[gid]) || null;
    }
    gpHandoff.open({
      gid,
      entry: entryId || null,
      name:  g?.custName || "",
      phone: g?.custPhone || "",
      status: g?.status || "new",
      prefilledStep1: !!(g?.prefilledStep1 || g?.custName || g?.custPhone)
    });
  }

  /**
   * deleteGuestFormEntry(entryId)
   * Delegated to actions module if present; else no-op warn.
   */
  function deleteGuestFormEntry(entryId){
    if (window.guestformsActions && typeof window.guestformsActions.deleteEntry === "function"){
      window.guestformsActions.deleteEntry(entryId);
      return;
    }
    alert("Delete not available (actions module not loaded).");
  }

  /* ----------------------------------------------------------------------
   * Public API
   * -------------------------------------------------------------------- */
  window.guestforms = {
    // rendering
    renderGuestFormsSection,
    toggleShowAll,
    // navigation / actions
    continueToGuestInfo,
    deleteGuestFormEntry,
    ensureRealtime,
    startNewLead,
    openGuestInfoPage,
    // caches (exposed for actions file)
    _getFormsCache: getFormsCache,
    _getGuestinfoCache: getGuestinfoCache,
    _getUsersCache: getUsersCache,
    _setGuestinfoCache: setGuestinfoCache,
    _setFormsCache: setFormsCache,
    _scheduleRerender: scheduleRerender,
    _patchDom: patchGuestFormsDom,
    _isAdvancedStatus: isAdvancedStatus,
    _digitsOnly: digitsOnly
  };

  /* auto-bind if firebase already loaded */
  if (window.db) ensureRealtime();

})();