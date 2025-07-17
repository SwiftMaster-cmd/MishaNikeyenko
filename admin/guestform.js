/* =======================================================================
   guestform.js  (Dashboard intake queue w/ celebration empty state)
   ======================================================================= */
(() => {
  const ROLES = { ME:"me", LEAD:"lead", DM:"dm", ADMIN:"admin" };

  /* --------------------------------------------------------------
     Config: path to detailed guest workflow page
     -------------------------------------------------------------- */
  window.GUESTINFO_PAGE = window.GUESTINFO_PAGE || "../employee/guestinfo.html";

  /* --------------------------------------------------------------
     Local realtime caches
     -------------------------------------------------------------- */
  let _bound = false;
  let _rerenderTimer = null;

  let _formsCache      = {};  // guestEntries
  let _guestinfoLive   = {};  // guestinfo
  let _usersCache      = null;

  // counts to detect transitions -> confetti
  let _prevUnclaimedCount = null;

  // Today/All flag
  if (typeof window._guestforms_showAll === "undefined") {
    window._guestforms_showAll = false;
  }

  /* --------------------------------------------------------------
     Role helpers
     -------------------------------------------------------------- */
  const isAdmin = r => r === ROLES.ADMIN;
  const isDM    = r => r === ROLES.DM;
  const isLead  = r => r === ROLES.LEAD;
  const isMe    = r => r === ROLES.ME;

  function canDeleteForm(role){
    return isAdmin(role) || isDM(role) || isLead(role);
  }

  /* --------------------------------------------------------------
     Utils
     -------------------------------------------------------------- */
  const digitsOnly = str => (str||"").replace(/\D+/g,"");
  const startOfTodayMs = () => { const d=new Date(); d.setHours(0,0,0,0); return d.getTime(); };
  const endOfTodayMs   = () => { const d=new Date(); d.setHours(23,59,59,999); return d.getTime(); };
  function esc(str){
    return (str ?? "")
      .toString()
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;")
      .replace(/'/g,"&#39;");
  }

  /* --------------------------------------------------------------
     Advanced statuses hide intake
     -------------------------------------------------------------- */
  function isAdvancedStatus(status){
    if (!status) return false;
    const s = status.toLowerCase();
    return s === "proposal" || s === "sold";
  }

  /* --------------------------------------------------------------
     Users lookup
     -------------------------------------------------------------- */
  function getUsers(){
    if (window._users) return window._users;
    return _usersCache || {};
  }
  function userNameAndRole(uid){
    const u = getUsers()[uid];
    if (!u) return {label:"Unknown", roleCss:"role-guest"};
    const r = (u.role||"").toLowerCase();
    return {label: u.name || u.email || uid, roleCss:`role-${r}`};
  }

  /* --------------------------------------------------------------
     Role visibility filtering
     -------------------------------------------------------------- */
  function visibleFormsForRole(formsObj, currentRole, currentUid){
    if (!formsObj) return {};
    const out = {};

    for (const [id,f] of Object.entries(formsObj)){
      // Filter out ones whose linked guest has advanced status
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

  /* --------------------------------------------------------------
     Partition Unclaimed / Claimed
     -------------------------------------------------------------- */
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
    // newest first
    unclaimed.sort((a,b)=>(b[1].timestamp||0)-(a[1].timestamp||0));
    claimed.sort((a,b)=>(b[1].timestamp||0)-(a[1].timestamp||0));
    return {unclaimed, claimed};
  }

  /* --------------------------------------------------------------
     Apply Today filter (if not showAll)
     -------------------------------------------------------------- */
  function applyTodayFilter(rows){
    if (window._guestforms_showAll) return rows;
    const s = startOfTodayMs();
    const e = endOfTodayMs();
    return rows.filter(([,f])=>{
      const ts = f.timestamp || 0;
      return ts >= s && ts <= e;
    });
  }

  /* --------------------------------------------------------------
     Row HTML
     -------------------------------------------------------------- */
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

  /* --------------------------------------------------------------
     Celebratory Empty State (markup only)
     -------------------------------------------------------------- */
  function emptyCelebrationHtml(kind){
    // kind: 'unclaimed' | 'claimed'
    const emoji = kind === "unclaimed" ? "🎉" : "📁";
    const title = kind === "unclaimed" ? "All Caught Up!" : "No Claimed Forms Yet";
    const sub   = kind === "unclaimed"
      ? "You've worked every intake in this view."
      : "Claim a guest form to begin.";
    const showCta = kind === "unclaimed"; // only show CTA for unclaimed; change if desired
    const ctaHtml = showCta
      ? `<button class="empty-cta" onclick="window.guestforms.startNewGuest()">Add Customer</button>`
      : "";
    return `
      <div class="guestforms-empty">
        <span class="empty-emoji">${emoji}</span>
        <div class="empty-title">${esc(title)}</div>
        <div class="empty-sub">${esc(sub)}</div>
        ${ctaHtml}
      </div>`;
  }

  /* --------------------------------------------------------------
     Table section builder
     -------------------------------------------------------------- */
  function tableSectionHtml(title, rowsHtml, kind){
    const hasRows = !!rowsHtml.trim();
    const body = hasRows
      ? `<tbody>${rowsHtml}</tbody>`
      : `<tbody><tr><td colspan="5">${emptyCelebrationHtml(kind)}</td></tr></tbody>`;

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
            ${body}
          </table>
        </div>
      </div>`;
  }

  /* --------------------------------------------------------------
     Main renderer
     -------------------------------------------------------------- */
  function renderGuestFormsSection(_unused_forms, currentRole, currentUid){
    currentUid  = currentUid  || window.currentUid;
    currentRole = currentRole || window.currentRole;

    const formsObj = Object.keys(_formsCache).length ? _formsCache : (_unused_forms || {});
    const visForms = visibleFormsForRole(formsObj, currentRole, currentUid);
    const {unclaimed, claimed} = partitionForms(visForms);

    // detect confetti trigger *before* filter (we celebrate clearing the raw unclaimed visible set)
    triggerConfettiIfCleared(unclaimed.length);

    const unclaimedFilt = applyTodayFilter(unclaimed);
    const claimedFilt   = applyTodayFilter(claimed);

    const unclaimedRowsHtml = unclaimedFilt.map(([id,f])=>rowHtml(id,f,currentRole,currentUid)).join("");
    const claimedRowsHtml   = claimedFilt.map(([id,f])=>rowHtml(id,f,currentRole,currentUid)).join("");

    // Show toggle if there are any rows filtered out by Today filter
    const anyOlder = (!window._guestforms_showAll) && (
      unclaimed.length !== unclaimedFilt.length ||
      claimed.length   !== claimedFilt.length
    );
    const toggleBtn = anyOlder
      ? `<button class="btn btn-secondary btn-sm" onclick="window.guestforms.toggleShowAll()">
           ${window._guestforms_showAll ? "Show Today" : "Show All"}
         </button>`
      : (window._guestforms_showAll
         ? `<button class="btn btn-secondary btn-sm" onclick="window.guestforms.toggleShowAll()">Show Today</button>`
         : "");

    return `
      <section id="guest-forms-section" class="admin-section guest-forms-section">
        <h2>Guest Form Submissions</h2>
        <div class="review-controls" style="justify-content:flex-end;">${toggleBtn}</div>
        ${tableSectionHtml("Unclaimed", unclaimedRowsHtml, "unclaimed")}
        ${tableSectionHtml("Claimed",   claimedRowsHtml,   "claimed")}
      </section>
    `;
  }

  /* --------------------------------------------------------------
     Confetti trigger logic
     -------------------------------------------------------------- */
  function triggerConfettiIfCleared(currentUnclaimedCount){
    if (_prevUnclaimedCount === null){
      _prevUnclaimedCount = currentUnclaimedCount;
      return;
    }
    if (_prevUnclaimedCount > 0 && currentUnclaimedCount === 0){
      launchConfetti();
    }
    _prevUnclaimedCount = currentUnclaimedCount;
  }

  function launchConfetti(pieces=40){
    // avoid stacking if one already on screen
    if (document.querySelector(".confetti-layer")) return;
    const layer = document.createElement("div");
    layer.className = "confetti-layer";
    const vw = window.innerWidth;
    for (let i=0;i<pieces;i++){
      const span = document.createElement("span");
      span.className = "confetti-piece";
      span.style.left = Math.random()*vw + "px";
      span.style.animationDelay = (Math.random()*0.3)+"s";
      span.style.transform = `translateY(-20vh) rotate(${Math.random()*360}deg)`;
      layer.appendChild(span);
    }
    document.body.appendChild(layer);
    setTimeout(()=>layer.remove(), 2200);
  }

  /* --------------------------------------------------------------
     DOM patcher (for realtime updates)
     -------------------------------------------------------------- */
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

  /* --------------------------------------------------------------
     Realtime listeners
     -------------------------------------------------------------- */
  function ensureRealtime(){
    if (_bound) return;
    const db = window.db;
    if (!db) return;

    _bound = true;

    // guestEntries
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

    // guestinfo (status signals)
    const giRef = db.ref("guestinfo");
    giRef.on("value", snap => {
      _guestinfoLive = snap.val() || {};
      window._guestinfo = _guestinfoLive; // update global
      scheduleRerender();
    });

    // users (fallback load)
    if (!window._users){
      db.ref("users").once("value", snap => {
        _usersCache = snap.val() || {};
        scheduleRerender();
      });
    }
  }

  /* --------------------------------------------------------------
     Toggle filter
     -------------------------------------------------------------- */
  function toggleShowAll(){
    window._guestforms_showAll = !window._guestforms_showAll;
    patchGuestFormsDom();
  }

  /* --------------------------------------------------------------
     Start a NEW guest manually (CTA)
     -------------------------------------------------------------- */
  function startNewGuest(){
    // open the guest portal w/ no gid param -> begins Step 1
    const base = window.GUESTINFO_PAGE || "guest-info.html";
    // no gid -> new
    window.location.href = base;
  }

  /* --------------------------------------------------------------
     Continue / Open
     -------------------------------------------------------------- */
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

    // Already linked? open
    if (entry.guestinfoKey){
      openGuestInfoPage(entry.guestinfoKey);
      return;
    }

    const payload = {
      custName:    entry.guestName || "",
      custPhone:  