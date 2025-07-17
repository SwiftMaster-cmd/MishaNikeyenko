/* gp-handoff.js ==============================================================
 * Cross-page handoff helper: dashboard -> guest portal workflow (gp-app.js).
 * ----------------------------------------------------------------------------
 * Goals
 * - Single canonical function to open the guest workflow page.
 * - Pass gid, entry, and uistart hint via URL params.
 * - Additionally stash transient prefill data (custName/Phone/etc) in
 *   sessionStorage so gp-app can hydrate Step 1 even if the DB record is
 *   missing those values (or we're launching from a guestEntry that hasn't yet
 *   created guestinfo).
 * - TTL-bound (default 30 minutes) so we don't leak stale PII.
 * - Duplicate-click guard (throttle) optional.
 * ----------------------------------------------------------------------------
 * Public API (window.gpHandoff)
 *   gpHandoff.openPortal(opts)  -> redirects to portal page
 *     opts = {
 *       gid?:string|null,
 *       entry?:string|null,
 *       uistart?:'step1'|'step2'|'step3'|null,
 *       prefill?:{custName?:string,custPhone?:string, ...any},
 *       baseUrl?:string   // override (defaults window.GUESTINFO_PAGE or '../html/guestinfo.html')
 *       throttleMs?:number  // default 1200 double-click guard
 *     }
 *
 *   gpHandoff.consumePrefill() -> {gid,entry,uistart,prefill,ts}|null   (one-shot)
 *                                 automatically clears if >TTL or malformed.
 *
 *   gpHandoff.computeUiStartFromGuest(g) -> 'step1'|'step2'|'step3'
 *        (status + basic Step1 presence heuristic; mirrors dashboard logic)
 * -------------------------------------------------------------------------- */

(function(){
  const HANDOFF_KEY  = "gp_handoff_payload";
  const HANDOFF_TTL  = 30 * 60 * 1000;  // 30m
  const DEF_THROTTLE = 1200;            // ms

  const GP_STEPS = ["step1","step2","step3"];
  const stepRank = s => Math.max(0, GP_STEPS.indexOf(s));

  function statusToStep(status){
    switch((status||"").toLowerCase()){
      case "working":  return "step2";
      case "proposal":
      case "sold":     return "step3";
      default:         return "step1";
    }
  }
  function hasStep1(g){
    return !!(g?.prefilledStep1 || g?.custName || g?.custPhone);
  }
  function computeUiStartFromGuest(g){
    const st = statusToStep(g?.status);
    if (st === "step3") return "step3";
    return hasStep1(g) ? "step2" : "step1";
  }

  // ----- sessionStorage helpers ------------------------------------
  function stash(payload){
    try{
      sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(payload));
    }catch(_){}
  }
  function clearStash(){
    try{ sessionStorage.removeItem(HANDOFF_KEY); }catch(_){}
  }
  function consumePrefill(){
    let raw=null;
    try{ raw = sessionStorage.getItem(HANDOFF_KEY); }catch(_){}
    if(!raw) return null;
    let obj=null;
    try{ obj = JSON.parse(raw); }catch(_){}
    clearStash();
    if(!obj) return null;
    const age = Date.now() - (obj.ts||0);
    if(age > HANDOFF_TTL) return null;
    return obj;
  }

  // ----- throttle --------------------------------------------------
  let _lastNav = 0;
  function throttled(throttleMs){
    const now = Date.now();
    if(now - _lastNav < (throttleMs||DEF_THROTTLE)) return false;
    _lastNav = now;
    return true;
  }

  // ----- build URL -------------------------------------------------
  function buildUrl(baseUrl, gid, entry, uistart){
    const base = baseUrl || window.GUESTINFO_PAGE || "../html/guestinfo.html";
    const params = [];
    if (gid)     params.push(`gid=${encodeURIComponent(gid)}`);
    if (entry)   params.push(`entry=${encodeURIComponent(entry)}`);
    if (uistart) params.push(`uistart=${encodeURIComponent(uistart)}`);
    if (!params.length) return base;
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}${params.join("&")}`;
  }

  // ----- openPortal ------------------------------------------------
  function openPortal(opts={}){
    const {
      gid=null,
      entry=null,
      uistart=null,
      prefill=null,
      baseUrl=null,
      throttleMs=DEF_THROTTLE
    } = opts;

    // throttle double-clicks
    if(!throttled(throttleMs)) return;

    // stash payload if we have *any* prefill OR if gid/entry might be needed
    const payload = {
      gid: gid||null,
      entry: entry||null,
      uistart: uistart||null,
      prefill: prefill||null,
      ts: Date.now()
    };
    stash(payload);

    // remember last guest for convenience (non-authoritative; gp-app will also)
    try{ localStorage.setItem("last_guestinfo_key", gid||""); }catch(_){}

    // navigate
    window.location.href = buildUrl(baseUrl, gid, entry, uistart);
  }

  // expose
  window.gpHandoff = {
    openPortal,
    consumePrefill,
    computeUiStartFromGuest,
    _debugClear: clearStash
  };
})();