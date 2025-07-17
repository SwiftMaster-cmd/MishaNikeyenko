/* =======================================================================
   guestform.js  (Dashboard intake queue)
   -----------------------------------------------------------------------
   Features
   - Realtime sync w/ guestEntries + guestinfo
   - Unclaimed vs Claimed sections
   - Shows claim owner + role + current guest status
   - Removes from list automatically when linked guest becomes proposal/sold
   - Today/All toggle
   - Works with dashboard global caches but also self-updates
   ======================================================================= */
(() => {
  const ROLES = { ME:"me", LEAD:"lead", DM:"dm", ADMIN:"admin" };

  /* --------------------------------------------------------------
     Config: path to detailed guest workflow page
     -------------------------------------------------------------- */
  window.GUESTINFO_PAGE = window.GUESTINFO_PAGE || "../employee/guestinfo.html";

  /* --------------------------------------------------------------
     Local realtime caches (kept in sync)
     -------------------------------------------------------------- */
  let _bound = false;
  let _rerenderTimer = null;

  // These mirror (but do not overwrite) dashboard globals.
  let _formsCache    = {};  // guestEntries
  let _guestinfoLive = {};  // guestinfo subset (we load all; you can scope later)
  // We rely on window._users for names/roles; fallback fetch if missing.
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
  const isMe    = r => r === ROLES.ME;

  // Admin, DM, Lead may delete an intake form.
  function canDeleteForm(role){
    return isAdmin(role) || isDM(role) || isLead(role);
  }

  /* ================================================================
   * Utility: digits
   * ================================================================ */
  const digitsOnly = str => (str||"").replace(/\D+/g,"");

  /* ================================================================
   * Utility: HTML escape
   * ================================================================ */
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
   * Determine if a guestinfo status means the intake should disappear
   * Hide when status is "proposal" OR "sold".
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
    // prefer dashboard global (freshest) fallback to local one-time fetch.
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
   * Visibility for forms
   * - Admin / DM see all (subject to advanced status hiding)
   * - Lead / ME see:
   *      - Unclaimed
   *      - Claimed by them
   * ================================================================ */
  function visibleFormsForRole(formsObj, currentRole, currentUid){
    if (!formsObj) return {};
    const out = {};
    const allUsers = getUsers(); // may need for claim mapping

    for (const [id,f] of Object.entries(formsObj)){
      // Skip if linked guest has advanced to proposal/sold
      const gid = f.guestinfoKey;
      if (gid){
        const g = _guestinfoLive[gid] || (window._guestinfo && window._guestinfo[gid]);
        if (g && isAdvancedStatus(g.status)) {
          continue; // hide from intake queue
        }
      }

      if (isAdmin(currentRole) || isDM(currentRole)){
        out[id] = f;
        continue;
      }

      const claimedBy = f.consumedBy || f.claimedBy;
      if (!claimedBy || claimedBy === currentUid){
        // Unclaimed OR claimed by me
        out[id] = f;
        continue;
      }

      // For Leads, also let them see forms claimed by one of their MEs? (Optional)
      // Keeping simple per your spec: only unclaimed + claimed by self.
    }
    return out;
  }

  /* ================================================================
   * Partition into Unclaimed / Claimed arrays (after role visibility)
   * ================================================================ */
  function partitionForms(visForms, currentUid){
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
    // newest first
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
   * Shows: Name, Phone, Submitted, Status/Claim, Action
   * ================================================================ */
  function rowHtml(id, f, currentRole, currentUid){
    const ts = f.timestamp ? new Date(f.timestamp).toLocaleString() : "-";
    const name  = esc(f.guestName || "-");
    const phone = esc(f.guestPhone || "-");

    const claimedBy = f.consumedBy || f.claimedBy;
    const isClaimed = !!claimedBy;

    // Look up linked guest status
    let status = "new";
    if (f.guestinfoKey){
      const g = _guestinfoLive[f.guestinfoKey] || (window._guestinfo && window._guestinfo[f.guestinfoKey]);
      if (g?.status) status = g.status;
    }

    const statusLabel = esc(status);
    const statusBadge = `<span class="role-badge role-guest" style="opacity:.8;">${statusLabel}</span>`;

    let claimLabel = "";
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
   * Render a table section (title + table html)
   * ================================================================ */
  function tableSectionHtml(title, rowsHtml, emptyMsg){
    if (!rowsHtml){
      rowsHtml = "";
    }
    const hasRows = rowsHtml.trim().length > 0;
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
            <tbody>${hasRows ? rowsHtml : `<tr><td colspan="5" class="text-center"><i>${esc(emptyMsg||'None')}</i></td></tr>`}</tbody>
          </table>
        </div>
      </div>`;
  }

  /* ================================================================
   * Main renderer
   * ================================================================ */
  function renderGuestFormsSection(_unused_forms, currentRole, currentUid){
    currentUid  = currentUid  || window.currentUid;
    currentRole = currentRole || window.currentRole;

    // Use our live cache (best) fallback to passed snapshot.
    const formsObj = Object.keys(_formsCache).length ? _formsCache : (_unused_forms || {});
    const visForms = visibleFormsForRole(formsObj, currentRole, currentUid);
    const {unclaimed, claimed} = partitionForms(visForms, currentUid);

    const unclaimedFilt = applyTodayFilter(unclaimed);
    const claimedFilt   = applyTodayFilter(claimed);

    const unclaimedRowsHtml = unclaimedFilt.map(([id,f])=>rowHtml(id,f,currentRole,currentUid)).join("");
    const claimedRowsHtml   = claimedFilt.map(([id,f])=>rowHtml(id,f,currentRole,currentUid)).join("");

    // Toggle label if older exist
    const anyOlder = (!window._guestforms_showAll) && (
      unclaimed.length !== unclaimedFilt.length ||
      claimed.length   !== claimedFilt.length
    );
    const toggleBtn = (unclaimed.length+claimed.length>0)
      ? `<button class="btn btn-secondary btn-sm" onclick="window.guestforms.toggleShowAll()">
           ${window._guestforms_showAll ? "Show Today" : "Show All"}
         </button>`
      : "";

    return `
      <section id="guest-forms-section" class="admin-section guest-forms-section">
        <h2>Guest Form Submissions</h2>
        <div class="review-controls" style="justify-content:flex-end;">${anyOlder ? toggleBtn : ""}</div>
        ${tableSectionHtml("Unclaimed", unclaimedRowsHtml, "No unclaimed guest forms.")}
        ${tableSectionHtml("Claimed",   claimedRowsHtml,   "No claimed guest forms.")}
      </section>
    `;
  }

  /* ================================================================
   * DOM patcher (for realtime updates)
   * ================================================================ */
  function patchGuestFormsDom(){
    const html = renderGuestFormsSection(null, window.currentRole, window.currentUid);
    const existing = document.getElementById("guest-forms-section");
    if (!existing) return; // not yet in DOM (first paint from dashboard soon)
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

    /* guestEntries full sync then incremental */
    const formsRef = db.ref("guestEntries");
    formsRef.on("value", snap => {
      _formsCache = snap.val() || {};
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
    formsRef.on("child_added", snap => {
      _formsCache[snap.key] = snap.val();
      scheduleRerender();
    });

    /* guestinfo realtime (we need status updates) */
    const giRef = db.ref("guestinfo");
    giRef.on("value", snap => {
      _guestinfoLive = snap.val() || {};
      // Also refresh global to keep others consistent if dashboard hasn't yet.
      window._guestinfo = _guestinfoLive;
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
   * - If already linked, open guestinfo page
   * - Else create guestinfo record, mark claimed, redirect
   * ================================================================ */
  async function continueToGuestInfo(entryId){
    const currentUid = window.currentUid;
    if (!window.db){
      alert("Database not ready.");
      return;
    }

    const entrySnap = await window.db.ref(`guestEntries/${entryId}`).get();
    const entry = entrySnap.val();
    if (!entry){
      alert("Guest form not found.");
      return;
    }

    // Already linked?
    if (entry.guestinfoKey){
      openGuestInfoPage(entry.guestinfoKey);
      return;
    }

    // build guestinfo payload
    const payload = {
      custName:    entry.guestName || "",
      custPhone:   entry.guestPhone || "",
      submittedAt: entry.timestamp || Date.now(),
      userUid:     currentUid || null,
      status:      "new",
      source: { type: "guestForm", entryId }
    };

    // create guestinfo
    const gRef = await window.db.ref("guestinfo").push(payload);
    const guestKey = gRef.key;

    // mark intake claimed / linked
    await window.db.ref(`guestEntries/${entryId}`).update({
      guestinfoKey: guestKey,
      consumedBy: currentUid || null,
      consumedAt: Date.now()
    });

    // caches update via realtime; patch quickly
    scheduleRerender();

    if (!window.GUESTFORMS_NO_REDIRECT){
      openGuestInfoPage(guestKey);
    }
  }

  /* ================================================================
   * Delete intake form
   * NOTE: Does NOT delete linked guestinfo
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
   * Open guest info page helper
   * Include both entry & gid (back-compat)
   * ================================================================ */
  function openGuestInfoPage(guestKey){
    const base = window.GUESTINFO_PAGE || "guest-info.html";
    const sep  = base.includes("?") ? "&" : "?";
    const url  = `${base}${sep}gid=${encodeURIComponent(guestKey)}&entry=${encodeURIComponent(guestKey)}`;
    try { localStorage.setItem("last_guestinfo_key", guestKey); } catch(_){}
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
    ensureRealtime
  };

  /* auto-bind if firebase already loaded */
  if (window.db) ensureRealtime();
})();