/* gp-handoff.js ==============================================================
 * Centralized navigation handoff between dashboard surfaces (guestform /
 * guestinfo cards) and the Guest Portal workflow app (gp-app.js).
 *
 * Why this file?
 *   - One place to compute & pass uistart (step1|step2|step3).
 *   - Carry Step1 name/phone safely across page loads.
 *   - Avoid duplicate guestinfo pushes: receiver can seed w/out re-push.
 *   - Make future tweaks once, not in 3+ files.
 *
 * Usage (sender side, e.g. guestform.js):
 *   gpHandoff.open({
 *     gid: <guestinfoKey?>,
 *     entry: <guestEntriesId?>,
 *     name: <custName?>,
 *     phone: <custPhone?>,
 *     status: <"new"|"working"|"proposal"|"sold"?>,
 *     prefilledStep1: <bool?>,
 *     dest: "../html/guestinfo.html"   // optional override; defaults window.GUESTINFO_PAGE
 *   });
 *
 * Receiver (auto on load):
 *   gpHandoff.receive(); // runs once at end of IIFE; populates window.GP_HANDOFF
 *   gp-app.js calls gpHandoff.consume() *after* it has read & merged.
 *
 * Data flow precedence (highest→lowest):
 *   1. URL query/hash params (?gid=...&entry=...&uistart=step2&name=...).
 *   2. Last unconsumed payload in localStorage (same-origin).
 *   3. Nothing → {}.
 *
 * Expiration: payloads >15min old are ignored.
 * -------------------------------------------------------------------------- */

(function(){

  /* ------------------------------------------------------------------------
   * Constants
   * ---------------------------------------------------------------------- */
  const LS_KEY   = "gp_handoff_payload_v2";
  const MAX_AGE  = 15 * 60 * 1000; // 15 min
  const GP_STEPS = ["step1","step2","step3"];

  /* ------------------------------------------------------------------------
   * Safe localStorage helpers
   * ---------------------------------------------------------------------- */
  function lsSet(obj){
    try{
      const wrap = {ts:Date.now(),payload:obj||{}};
      localStorage.setItem(LS_KEY, JSON.stringify(wrap));
    }catch(_){}
  }
  function lsGet(){
    try{
      const raw = localStorage.getItem(LS_KEY);
      if(!raw) return null;
      const wrap = JSON.parse(raw);
      if(!wrap || typeof wrap!=="object") return null;
      if(typeof wrap.ts!=="number") return null;
      if(Date.now() - wrap.ts > MAX_AGE) return null;
      return wrap.payload || null;
    }catch(_){
      return null;
    }
  }
  function lsClear(){
    try{ localStorage.removeItem(LS_KEY); }catch(_){}
  }

  /* ------------------------------------------------------------------------
   * Simple query+hash parser (supports ?..., #..., ?#mix)
   * ---------------------------------------------------------------------- */
  function parseParams(){
    const out = {};
    const add = kv=>{
      if(!kv) return;
      const i = kv.indexOf("=");
      if(i<0) return;
      const k = decodeURIComponent(kv.slice(0,i));
      const v = decodeURIComponent(kv.slice(i+1));
      if(k) out[k]=v;
    };
    const grab = str=>{
      if(!str) return;
      str = str.replace(/^[?#]/,"");
      if(!str) return;
      str.split("&").forEach(add);
    };
    grab(window.location.search);
    grab(window.location.hash);
    return out;
  }

  /* ------------------------------------------------------------------------
   * Normalize phone (digits only)
   * ---------------------------------------------------------------------- */
  function digitsOnly(str){ return (str||"").replace(/\D+/g,""); }

  /* ------------------------------------------------------------------------
   * Compute uiStart from payload
   *   Precedence: explicit uistart > status (proposal|sold->step3) >
   *               prefilledStep1||name||phone -> step2 > step1.
   * ---------------------------------------------------------------------- */
  function computeUiStart(p){
    const u = (p && p.uistart || "").toLowerCase();
    if(GP_STEPS.includes(u)) return u;

    const st = (p && p.status || "").toLowerCase();
    if(st==="proposal" || st==="sold") return "step3";

    const hasStep1 = !!(p && (p.prefilledStep1 || p.name || p.phone));
    return hasStep1 ? "step2" : "step1";
  }

  /* ------------------------------------------------------------------------
   * Build URL to Guest Portal page
   *   Only gid & entry & uistart are serialized to query params.
   *   Name/phone are carried in localStorage payload to avoid long URLs.
   * ---------------------------------------------------------------------- */
  function buildUrl(dest, p){
    const params = [];
    if(p.gid)   params.push("gid="   + encodeURIComponent(p.gid));
    if(p.entry) params.push("entry=" + encodeURIComponent(p.entry));
    params.push("uistart="+ encodeURIComponent(computeUiStart(p)));
    const joiner = dest.includes("?") ? "&" : "?";
    return params.length ? (dest + joiner + params.join("&")) : dest;
  }

  /* ------------------------------------------------------------------------
   * Public: open(payload) → store + navigate
   * ---------------------------------------------------------------------- */
  function open(payload){
    payload = payload || {};
    // Choose dest
    const dest = payload.dest || window.GUESTINFO_PAGE || "../html/guestinfo.html";

    // Clean & shrink payload for storage
    const store = {
      gid:   payload.gid   || null,
      entry: payload.entry || null,
      name:  payload.name  || "",
      phone: payload.phone || "",
      status: (payload.status||"").toLowerCase() || null,
      prefilledStep1: !!payload.prefilledStep1
    };
    if(!store.prefilledStep1 && (store.name || store.phone)) store.prefilledStep1 = true;

    // Save
    lsSet(store);

    // Remember last guest if gid
    if(store.gid){
      try{ localStorage.setItem("last_guestinfo_key", store.gid); }catch(_){}
    }

    // Nav
    const url = buildUrl(dest, store);
    window.location.href = url;
  }

  /* ------------------------------------------------------------------------
   * Internal: merge (URL params > LS payload)
   * ---------------------------------------------------------------------- */
  function mergePayload(urlP, lsP){
    const out = Object.assign({}, lsP||{});
    // URL wins
    if(urlP.gid   != null) out.gid   = urlP.gid;
    if(urlP.entry != null) out.entry = urlP.entry;
    if(urlP.name  != null) out.name  = urlP.name;
    if(urlP.phone != null) out.phone = urlP.phone;
    if(urlP.status!= null) out.status= urlP.status;
    if(urlP.prefilledStep1!=null) out.prefilledStep1 = (urlP.prefilledStep1==="true"||urlP.prefilledStep1===true);
    if(urlP.uistart!=null) out.uistart = urlP.uistart;
    return out;
  }

  /* ------------------------------------------------------------------------
   * Receiver: read URL + LS; attach to window.GP_HANDOFF
   *   Called automatically at end of file, but can be re-called.
   * ---------------------------------------------------------------------- */
  let _received = null;
  function receive(){
    const urlP = parseParams();
    const lsP  = lsGet();
    let merged = mergePayload(urlP, lsP);

    // ensure normalized
    merged.name  = merged.name  || "";
    merged.phone = merged.phone || "";
    merged.gid   = merged.gid   || null;
    merged.entry = merged.entry || null;
    if(!("prefilledStep1" in merged)){
      merged.prefilledStep1 = !!(merged.name || merged.phone);
    }
    // normalized digits copy (not serialized outward; gp-app may use)
    merged.phoneDigits = digitsOnly(merged.phone);

    // final uistart
    merged.uistart = computeUiStart(merged);

    // stash global
    window.GP_HANDOFF = merged;
    _received = merged;
    return merged;
  }

  /* ------------------------------------------------------------------------
   * Consume: gp-app.js should call once it has copied data; clears LS.
   *   Optionally let caller pass {clearLocal:true|false} (default true).
   * ---------------------------------------------------------------------- */
  function consume(opts){
    opts = opts||{};
    if(opts.clearLocal!==false) lsClear();
    return _received || receive();
  }

  /* ------------------------------------------------------------------------
   * Debug helper
   * ---------------------------------------------------------------------- */
  function debugLog(){
    /* eslint-disable no-console */
    console.log("[gp-handoff] window.GP_HANDOFF =", window.GP_HANDOFF);
    console.log("[gp-handoff] raw localStorage =", lsGet());
    /* eslint-enable no-console */
  }

  /* ------------------------------------------------------------------------
   * Expose API
   * ---------------------------------------------------------------------- */
  window.gpHandoff = {
    open,
    receive,
    consume,
    computeUiStart,
    debugLog,
    _lsGet: lsGet,      // exposed for troubleshooting
    _lsClear: lsClear
  };

  // auto-run
  receive();

})();