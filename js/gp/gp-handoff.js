/* gp-handoff.js ==============================================================
 * Centralized navigation handoff between dashboard surfaces (guestform /
 * guestinfo cards) and the Guest Portal workflow app (gp-app.js).
 *
 * Goals
 *   - One place to compute & pass uistart (step1|step2|step3).
 *   - Carry Step1 name/phone safely across page loads (localStorage payload).
 *   - Avoid duplicate guestinfo pushes: receiver can seed w/out re-push.
 *   - Make future tweaks once, not scattered across many files.
 *
 * Sender usage (e.g., guestform.js):
 *   gpHandoff.open({
 *     gid: <guestinfoKey?>,
 *     entry: <guestEntriesId?>,
 *     name: <custName?>,
 *     phone: <custPhone?>,
 *     status: <"new"|"working"|"proposal"|"sold"?>,
 *     prefilledStep1: <bool?>,
 *     dest: "../html/guestinfo.html"   // optional; defaults window.GUESTINFO_PAGE
 *   });
 *
 * Receiver usage (gp-app.js):
 *   const p = gpHandoff.consumePrefill(); // safe mapped object; LS cleared (once)
 *
 * Data precedence (highest→lowest):
 *   1. URL query/hash (?gid=...&entry=...&uistart=step2&name=...).
 *   2. Last unexpired payload in localStorage (same-origin).
 *   3. {} (nothing).
 *
 * Expiration: 15 minutes.
 * -------------------------------------------------------------------------- */

(function(){

  /* ---------------------------------------------------------------------- */
  var LS_KEY   = "gp_handoff_payload_v2";
  var MAX_AGE  = 15 * 60 * 1000; // 15 min
  var GP_STEPS = ["step1","step2","step3"];

  /* ---------------------------------------------------------------------- */
  function lsSet(obj){
    try{
      var wrap = {ts:Date.now(),payload:obj||{}};
      localStorage.setItem(LS_KEY, JSON.stringify(wrap));
    }catch(err){}
  }
  function lsGet(){
    try{
      var raw = localStorage.getItem(LS_KEY);
      if(!raw) return null;
      var wrap = JSON.parse(raw);
      if(!wrap || typeof wrap!=="object") return null;
      if(typeof wrap.ts!=="number") return null;
      if(Date.now() - wrap.ts > MAX_AGE) return null;
      return wrap.payload || null;
    }catch(err){
      return null;
    }
  }
  function lsClear(){
    try{ localStorage.removeItem(LS_KEY); }catch(err){}
  }

  /* ---------------------------------------------------------------------- */
  function parseParams(){
    var out = {};
    function add(kv){
      if(!kv) return;
      var i = kv.indexOf("=");
      if(i<0) return;
      var k = decodeURIComponent(kv.slice(0,i));
      var v = decodeURIComponent(kv.slice(i+1));
      if(k) out[k]=v;
    }
    function grab(str){
      if(!str) return;
      str = str.replace(/^[?#]/,"");
      if(!str) return;
      str.split("&").forEach(add);
    }
    grab(window.location.search);
    grab(window.location.hash);
    return out;
  }

  /* ---------------------------------------------------------------------- */
  function digitsOnly(str){ return (str||"").replace(/\D+/g,""); }

  /* ---------------------------------------------------------------------- */
  function computeUiStart(p){
    var u = (p && p.uistart || "").toLowerCase();
    if(GP_STEPS.indexOf(u) >= 0) return u;

    var st = (p && p.status || "").toLowerCase();
    if(st==="proposal" || st==="sold") return "step3";

    var hasStep1 = !!(p && (p.prefilledStep1 || p.name || p.phone));
    return hasStep1 ? "step2" : "step1";
  }

  /* ---------------------------------------------------------------------- */
  function buildUrl(dest, p){
    var params = [];
    if(p.gid)   params.push("gid="   + encodeURIComponent(p.gid));
    if(p.entry) params.push("entry=" + encodeURIComponent(p.entry));
    params.push("uistart="+ encodeURIComponent(computeUiStart(p)));
    var joiner = dest.indexOf("?") >= 0 ? "&" : "?";
    return params.length ? (dest + joiner + params.join("&")) : dest;
  }

  /* ---------------------------------------------------------------------- */
  function open(payload){
    payload = payload || {};
    var dest = payload.dest || window.GUESTINFO_PAGE || "../html/guestinfo.html";

    var store = {
      gid:   payload.gid   || null,
      entry: payload.entry || null,
      name:  payload.name  || "",
      phone: payload.phone || "",
      status: (payload.status||"").toLowerCase() || null,
      prefilledStep1: !!payload.prefilledStep1
    };
    if(!store.prefilledStep1 && (store.name || store.phone)) store.prefilledStep1 = true;

    lsSet(store);

    if(store.gid){
      try{ localStorage.setItem("last_guestinfo_key", store.gid); }catch(err){}
    }

    var url = buildUrl(dest, store);
    window.location.href = url;
  }

  /* ---------------------------------------------------------------------- */
  function mergePayload(urlP, lsP){
    var out = {};
    if(lsP) for(var k in lsP){ if(Object.prototype.hasOwnProperty.call(lsP,k)) out[k]=lsP[k]; }
    if(urlP.gid   != null) out.gid   = urlP.gid;
    if(urlP.entry != null) out.entry = urlP.entry;
    if(urlP.name  != null) out.name  = urlP.name;
    if(urlP.phone != null) out.phone = urlP.phone;
    if(urlP.status!= null) out.status= urlP.status;
    if(urlP.prefilledStep1!=null) out.prefilledStep1 = (urlP.prefilledStep1==="true"||urlP.prefilledStep1===true);
    if(urlP.uistart!=null) out.uistart = urlP.uistart;
    return out;
  }

  /* ---------------------------------------------------------------------- */
  var _received = null;
  function receive(){
    var urlP = parseParams();
    var lsP  = lsGet();
    var merged = mergePayload(urlP, lsP);

    merged.name  = merged.name  || "";
    merged.phone = merged.phone || "";
    merged.gid   = merged.gid   || null;
    merged.entry = merged.entry || null;

    if(typeof merged.prefilledStep1 === "undefined"){
      merged.prefilledStep1 = !!(merged.name || merged.phone);
    }

    merged.phoneDigits = digitsOnly(merged.phone);
    merged.uistart     = computeUiStart(merged);
    merged.timestamp   = Date.now(); // mark when received

    window.GP_HANDOFF = merged;
    _received = merged;
    return merged;
  }

  /* ---------------------------------------------------------------------- */
  function consume(opts){
    opts = opts||{};
    if(opts.clearLocal!==false) lsClear();
    return _received || receive();
  }

  /* ----------------------------------------------------------------------
   * consumePrefill()  → shape gp-app.js expects
   * -------------------------------------------------------------------- */
  function consumePrefill(opts){
    var raw = consume(opts);
    if(!raw) return null;
    return {
      gid:        raw.gid || null,
      entryId:    raw.entry || null,
      uistart:    raw.uistart || null,
      custName:   raw.name || "",
      custPhone:  raw.phone || "",
      statusHint: raw.status || null,
      prefilledStep1: !!raw.prefilledStep1,
      timestamp:  raw.timestamp || Date.now()
    };
  }

  /* ---------------------------------------------------------------------- */
  function debugLog(){
    /* eslint-disable no-console */
    console.log("[gp-handoff] window.GP_HANDOFF =", window.GP_HANDOFF);
    console.log("[gp-handoff] raw localStorage =", lsGet());
    /* eslint-enable no-console */
  }

  /* ---------------------------------------------------------------------- */
  window.gpHandoff = {
    open: open,
    receive: receive,
    consume: consume,
    consumePrefill: consumePrefill,
    computeUiStart: computeUiStart,
    debugLog: debugLog,
    _lsGet: lsGet,
    _lsClear: lsClear
  };

  /* auto-run */
  receive();

})();