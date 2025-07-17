/* =======================================================================
 * guestforms-handoff.js
 * -----------------------------------------------------------------------
 * Dedicated *handoff / navigation* module for the dashboard intake queue.
 *
 * Responsibilities
 * ----------------
 * • Compute correct uiStart hint (step1|step2|step3) when launching the
 *   Guest Portal (gp-app) from the dashboard.
 * • Build robust URL strings (?gid=...&entry=...&uistart=...).
 * • Persist last opened gid in localStorage for resume convenience.
 * • Export lightweight helpers that other guestforms* modules can reuse.
 *
 * Load Order
 * ----------
 *  1. guestforms-core.js
 *  2. guestforms-continue.js
 *  3. guestforms-handoff.js   <-- this file (may safely load earlier; it
 *                                 only *reads* globals and patches later)
 * -------------------------------------------------------------------- */
(() => {
  /* --------------------------------------------------------------
   * Shorthands / safe cache access
   * -------------------------------------------------------------- */
  const db          = () => window.db;
  const currentUid  = () => window.currentUid || null;
  const GIPAGE      = () => window.GUESTINFO_PAGE || "../html/guestinfo.html";

  /* live caches (from core) w/ fallbacks */
  function formsCache() {
    return (window.guestforms && window.guestforms._formsCache) || {};
  }
  function guestinfoCache() {
    return (window.guestforms && window.guestforms._guestinfoLive) ||
           window._guestinfo || {};
  }

  /* --------------------------------------------------------------
   * Step detection helpers
   * -------------------------------------------------------------- */
  const hasStep1DataFromGuest = g =>
    !!(g && (g.prefilledStep1 || g.custName || g.custPhone));
  const hasStep1DataFromForm  = f =>
    !!(f && (f.guestName || f.guestPhone || f.guestPhoneDigits));

  function computeUiStart(g, f) {
    // g = guestinfo record (optional)
    // f = intake form record (optional)
    if (g) {
      const st = (g.status || "").toLowerCase();
      if (st === "proposal" || st === "sold") return "step3";
      if (hasStep1DataFromGuest(g)) return "step2";
      // fall through -> step1
    } else if (hasStep1DataFromForm(f)) {
      // if no guest yet but intake captured step1 data
      return "step2";
    }
    return "step1";
  }

  /* --------------------------------------------------------------
   * URL builder
   * -------------------------------------------------------------- */
  function buildGuestinfoUrl(gid, entryId, uiStart) {
    const base = GIPAGE();
    const params = [];
    if (gid)     params.push("gid="    + encodeURIComponent(gid));
    if (entryId) params.push("entry="  + encodeURIComponent(entryId));
    if (uiStart) params.push("uistart="+ encodeURIComponent(uiStart));
    if (!params.length) return base;
    return `${base}${base.includes("?") ? "&" : "?"}${params.join("&")}`;
  }

  /* --------------------------------------------------------------
   * Remember last gid
   * -------------------------------------------------------------- */
  function rememberLastGuestKey(gid) {
    try { localStorage.setItem("last_guestinfo_key", gid || ""); } catch(_) {}
  }

  /* --------------------------------------------------------------
   * Public open()  (primary entry point)
   * --------------------------------------------------------------
   * guestKey: guestinfo/<gid> (nullable)
   * entryId : guestEntries/<eid> (nullable)
   * uiStartHint: optional override; if absent we compute from records.
   * -------------------------------------------------------------- */
  function open(guestKey, entryId, uiStartHint) {
    const g = guestKey ? guestinfoCache()[guestKey] : null;
    const f = entryId  ? formsCache()[entryId]      : null;
    const uiStart = (uiStartHint && ["step1","step2","step3"].includes(uiStartHint))
      ? uiStartHint
      : computeUiStart(g, f);

    const url = buildGuestinfoUrl(guestKey, entryId, uiStart);
    rememberLastGuestKey(guestKey);
    window.location.href = url;
  }

  /* --------------------------------------------------------------
   * Convenience wrappers (rarely used, but exported)
   * -------------------------------------------------------------- */
  function openFromForm(entryId, uiStartHint) {
    open(null, entryId, uiStartHint); // we'll compute
  }
  function openExisting(gid, entryId, uiStartHint) {
    open(gid, entryId, uiStartHint);
  }

  /* --------------------------------------------------------------
   * Attach to global namespace
   * -------------------------------------------------------------- */
  window.guestformsHandoff = {
    open,
    openFromForm,
    openExisting,
    computeUiStart,       // export for debugging
    buildGuestinfoUrl     // export for debugging
  };

  /* --------------------------------------------------------------
   * OPTIONAL: Patch legacy guestforms.openGuestInfoPage if present
   * -------------------------------------------------------------- */
  if (window.guestforms) {
    window.guestforms.openGuestInfoPage = (gid, eid, hint) => open(gid, eid, hint);
  }

})();