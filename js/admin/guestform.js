/* =======================================================================
 * guestform.js  (Dashboard intake queue)
 * -----------------------------------------------------------------------
 * Features
 * - Realtime sync w/ guestEntries + guestinfo
 * - Unclaimed vs Claimed sections (hidden if empty)
 * - Shows claim owner + role + current guest status
 * - Removes from list automatically when linked guest becomes proposal/sold
 * - Today/All toggle (hidden when nothing older)
 * - Empty-state motivational CTA to create a new lead
 * - Robust navigation: always try to include BOTH guestinfo key & entry id
 * - ***Step1 pass fix***: when continuing an intake, we seed guestinfo with
 *   custName/custPhone + prefilledStep1 + status "working" so portal jumps ahead.
 * ======================================================================= */
(() => {
  const ROLES = { ME:"me", LEAD:"lead", DM:"dm", ADMIN:"admin" };

  /* --------------------------------------------------------------
     Config: path to detailed guest workflow page
     -------------------------------------------------------------- */
  window.GUESTINFO_PAGE = window.GUESTINFO_PAGE || "../html/guestinfo.html";

  /* --------------------------------------------------------------
     Local realtime caches (kept in sync)
     -------------------------------------------------------------- */
  let _bound = false;
  let _rerenderTimer = null;

  // These mirror (but do not overwrite) dashboard globals.
  let _formsCache    = {};  // guestEntries
  let _guestinfoLive = {};  // guestinfo
  let _usersCache    = null;

  // Today/All flag
  if (typeof window._guestforms_showAll === "undefined") {
    window._guestforms_showAll = false;
  }

  /* ================================================================
   * Role helpers
   * ================================================================ */
  const isAdmin = r => r === ROLES.ADMIN;
  const isDM    = r => r === ROLES.DM;
  const isLead  = r => r === ROLES.LEAD;

  function canDeleteForm(role){
    return isAdmin(role) || isDM(role) || isLead(role);
  }

  /* ================================================================
   * Utility: digits & escape
   * ================================================================ */
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

  /* ================================================================
   * Date helpers (local browser tz)
   * ================================================================ */
  const startOfTodayMs = () => { const d=new Date(); d.setHours(0,0,0,0); return d.getTime(); };
  const endOfTodayMs   = () => { const d=new Date(); d.setHours(23,59,59,999); return d.getTime(); };

  /* ================================================================
   * Intake hiding rule: hide when linked guest status advanced
   * ================================================================ */
  function isAdvancedStatus(status){
    if (!status) return false;
    const s = status.toLowerCase();
    return s === "proposal" || s === "sold";
  }

  /* ================================================================
   * Lookup helpers
   * ================================================================ */
  function getUsers(){
    if (window._users) return window._users;
    return _usersCache || {};
  }

  function userNameAndRole(uid){
    const u = getUsers()[uid];
    if (!u) return {label: "Unknown", roleCss:"role-guest"};
    const r = (u.role||"").toLowerCase();
    return {
      label: u.name || u.email || uid,
      roleCss: "role-" + r
    };
  }

  /* ================================================================
   * Visibility for forms by role
   * ================================================================ */
  function visibleFormsForRole(formsObj, currentRole, currentUid){
    if (!formsObj) return {};
    const out = {};
    for (const [id,f] of Object.entries(formsObj)){
      // hide if linked guest advanced
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

  /* ================================================================
   * Partition into Unclaimed / Claimed arrays (after role visibility)
   * ================================================================ */
  function partitionForms(visForms){
    const unclaimed = [];
    const claimed   = [];
    for (const [id,f] of Object.entries(visForms)){
      const claimedBy = f.consumedBy || f.claimedBy;
      if (!claimedBy){
        unclaimed.push([id,f]);
      }else{
        claimed.push([id,f]);
      }
    }
    unclaimed.sort((a,b)=>(b[1].timestamp||0)-(a[1].timestamp||0));
    claimed.sort((a,b)=>(b[1].timestamp||0)-(a[1].timestamp||0));
    return {unclaimed, claimed};
  }

  /* ================================================================
   * Today/All filter (applied AFTER partition)
   * ================================================================ */
  function applyTodayFilter(rows){
    if (window._guestforms_showAll) return rows;
    const startToday = startOfTodayMs();
    const endToday   = endOfTodayMs();
    return rows.filter(([,f])=>{
      const ts = f.timestamp || 0;
      return ts >= startToday && ts <= endToday;
    });
  }

  /* ================================================================
   * Render helper: row HTML
   * ================================================================ */
  function rowHtml(id, f, currentRole, currentUid){
    const ts = f.timestamp ? new Date(f.timestamp).toLocaleString() : "-";
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
    }else{
      claimLabel = `<small style="opacity:.7;">unclaimed</small>`;
    }

    const actionLabel = isClaimed ? "Open" : "Continue";
    const delBtn = canDeleteForm(currentRole)
      ? `<button class="btn btn-danger btn-sm" onclick="window.guestforms.deleteGuestFormEntry('${id}')">Delete</button>`
      : "";

    /* We *always* call continueToGuestInfo(id). That helper now handles:
       - if linked: openGuestInfoPage(gid, id)
       - else: create guestinfo, then open
    */
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

  /* ================================================================
   * Subsection builder (returns "" if no rows)
   * ================================================================ */
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

  /* ================================================================
   * Motivational empty-state (no unclaimed & no claimed)
   * ================================================================ */
  function emptyMotivationHtml(){
    return `
      <div class="guestforms-empty-all text-center" style="margin-top:16px;">
        <p><b>All caught up!</b> No guest forms in your queue.</p>
        <p style="opacity:.8;">Go greet a customer and start a new lead.</p>
        <button class="btn btn-primary btn-sm" onclick="window.guestforms.startNewLead()">Start New Lead</button>
      </div>`;
  }

  /* ================================================================
   * Main renderer
   * ================================================================ */
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

    // toggle visible only if there are ANY rows & filter hides some
    const anyRows   = (unclaimed.length + claimed.length) > 0;
    const anyOlder  = anyRows && (
      unclaimed.length !== unclaimedFilt.length ||
      claimed.length   !== claimedFilt.length
    );
    const toggleBtn = anyOlder
      ? `<button class="btn btn-secondary btn-sm" onclick="window.guestforms.toggleShowAll()">
           ${window._guestforms_showAll ? "Show Today" : "Show All"}
         </button>`
      : "";

    // empty-state when both subsections hidden
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

  /* ================================================================
   * DOM patcher (for realtime updates)
   * ================================================================ */
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

  /* ================================================================
   * Realtime listeners
   * ================================================================ */
  function ensureRealtime(){
    if (_bound) return;
    const db = window.db;
    if (!db) return; // wait until dashboard initializes firebase

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

    /* guestinfo realtime (for status updates) */
    const giRef = db.ref("guestinfo");
    giRef.on("value", snap => {
      _guestinfoLive = snap.val() || {};
      window._guestinfo = _guestinfoLive; // keep global fresh
      scheduleRerender();
    });

    /* optional: preload users if missing */
    if (!window._users){
      db.ref("users").once("value", snap => {
        _usersCache = snap.val() || {};
        scheduleRerender();
      });
    }
  }

  /* ================================================================
   * Toggle Today/All & patch
   * ================================================================ */
  function toggleShowAll(){
    window._guestforms_showAll = !window._guestforms_showAll;
    patchGuestFormsDom();
  }

  /* ================================================================
   * Continue / Open flow
   * ================================================================ */
  async function continueToGuestInfo(entryId){
    const uid = window.currentUid;
    if (!window.db){
      alert("Database not ready.");
      return;
    }

    let entrySnap, entry;
    try {
      entrySnap = await window.db.ref(`guestEntries/${entryId}`).get();
      entry = entrySnap.val();
    } catch(err){
      console.error('[guestforms] error loading guestEntries/'+entryId, err);
      alert("Error loading guest intake. See console.");
      return;
    }
    if (!entry){
      alert("Guest form not found.");
      return;
    }

    // Already linked?
    if (entry.guestinfoKey){
      // Ensure consumedBy/claimedBy set (helpful if bypassed earlier)
      try {
        const up = {};
        if (!entry.consumedBy) up[`guestEntries/${entryId}/consumedBy`] = uid || null;
        if (!entry.consumedAt) up[`guestEntries/${entryId}/consumedAt`] = Date.now();
        if (!entry.claimedBy)  up[`guestEntries/${entryId}/claimedBy`]  = uid || null;
        if (Object.keys(up).length) await window.db.ref().update(up);
      } catch(e){ /* ignore */ }
      openGuestInfoPage(entry.guestinfoKey, entryId);
      return;
    }

    /* ---- Create new guestinfo from intake form ---- */
    const name    = entry.guestName  || "";
    const phone   = entry.guestPhone || entry.guestPhoneDigits || "";
    const digits  = digitsOnly(phone);
    const ts      = entry.timestamp || Date.now();
    const step1Done = !!(name || digits);
    const statusInit = step1Done ? "working" : "new";

    const payload = {
      custName:  name,
      custPhone: phone,
      custPhoneDigits: digits || null,
      submittedAt: ts,
      userUid: uid || null,
      status: statusInit,
      prefilledStep1: step1Done,
      evaluate: {},   // seed empty objects for downstream safety
      solution: {},
      source: { type: "guestForm", entryId }
    };

    let guestKey;
    try {
      const gRef = await window.db.ref("guestinfo").push(payload);
      guestKey = gRef.key;
    } catch(err){
      console.error('[guestforms] create guestinfo failed', err);
      alert("Error creating guest record. See console.");
      return;
    }

    /* Link intake -> guestinfo & mark claimed/consumed */
    try {
      await window.db.ref(`guestEntries/${entryId}`).update({
        guestinfoKey: guestKey,
        consumedBy: uid || null,
        consumedAt: Date.now(),
        claimedBy: entry.claimedBy || uid || null
      });
    } catch(err){
      console.warn('[guestforms] link guestEntries->guestinfo failed', err);
    }

    scheduleRerender();

    if (!window.GUESTFORMS_NO_REDIRECT){
      openGuestInfoPage(guestKey, entryId);
    }
  }

  /* ================================================================
   * Delete intake form
   * ================================================================ */
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

    try {
      await window.db.ref(`guestEntries/${entryId}`).remove();
      // realtime update will refresh UI
    } catch (err) {
      alert("Error deleting form: " + err.message);
    }
  }

  /* ================================================================
   * Start new lead (empty workflow page)
   * ================================================================ */
  function startNewLead(){
    openGuestInfoPage(null, null); // no gid, no entry
  }

  /* ================================================================
   * Open guest info page helper (existing lead)
   * guestKey: guestinfo key (if known)
   * entryId:  originating guestEntries id (optional; improves prefill & analytics)
   * ================================================================ */
  /* ================================================================
   * Open guest info page helper (existing lead or new)
   *  - Computes uistart hint so gp-app can jump directly:
   *      proposal|sold        -> step3
   *      else if Step1 data   -> step2
   *      else                 -> step1
   *    Step1 data = prefilledStep1 || custName || custPhone || intake row has guestName/guestPhone.
   * ================================================================ */
  function openGuestInfoPage(guestKey, entryId){
    const base = window.GUESTINFO_PAGE || "../html/guestinfo.html";

    let uistart = "step1";

    if (guestKey){
      const g = _guestinfoLive[guestKey] || (window._guestinfo && window._guestinfo[guestKey]) || null;
      if (g){
        const st = (g.status || "").toLowerCase();
        if (st === "proposal" || st === "sold"){
          uistart = "step3";
        }else if (g.prefilledStep1 || g.custName || g.custPhone){
          uistart = "step2";
        }
      }else if (entryId){
        // fallback: peek at intake row if we can't see guestinfo yet (race after push)
        const f = _formsCache[entryId];
        if (f && (f.guestName || f.guestPhone)) uistart = "step2";
      }
    }else if (entryId){
      // new lead from intake row (no guestKey yet)
      const f = _formsCache[entryId];
      if (f && (f.guestName || f.guestPhone)) uistart = "step2";
    }

    // Build query string robustly.
    const params = [];
    if (guestKey) params.push(`gid=${encodeURIComponent(guestKey)}`);
    if (entryId)  params.push(`entry=${encodeURIComponent(entryId)}`);
    params.push(`uistart=${uistart}`);

    const url = params.length
      ? `${base}${base.includes('?') ? '&' : '?'}${params.join('&')}`
      : base; // pure new-lead, still sends ?uistart=step1 if you prefer (see below)

    try { localStorage.setItem("last_guestinfo_key", guestKey || ""); } catch(_){}

    window.location.href = url;
  }

  /* ================================================================
   * Expose API
   * ================================================================ */
  window.guestforms = {
    renderGuestFormsSection,
    toggleShowAll,
    continueToGuestInfo,
    deleteGuestFormEntry,
    ensureRealtime,
    startNewLead,
    openGuestInfoPage // exposed for debugging / manual links
  };

  /* auto-bind if firebase already loaded */
  if (window.db) ensureRealtime();
})();