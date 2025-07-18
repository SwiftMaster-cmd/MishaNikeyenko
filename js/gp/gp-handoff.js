<!-- gp-handoff.js -->

/* gp-handoff.js ==============================================================
 * Centralized navigation handoff between dashboard surfaces (guestform /
 * guestinfo cards) and the Guest Portal workflow app (gp-app.js).
 * -------------------------------------------------------------------------- */
(function(){

  /* ------------------------------------------------------------------------
   * Config
   * ---------------------------------------------------------------------- */
  const LS_KEY   = "gp_handoff_payload_v2";
  const MAX_AGE  = 15 * 60 * 1000; // ms
  const GP_STEPS = ["step1","step2","step3"];
  const DBG = ()=>!!window.GP_DEBUG;
  const dlog = (...a)=>{ if(DBG()) console.log("[gp-handoff]",...a); };

  /* ------------------------------------------------------------------------
   * Utils
   * ---------------------------------------------------------------------- */
  const digitsOnly = str => (str||"").replace(/\D+/g,"");
  const truthy = v => v===true || v==="true" || v==="1" || v===1 || v==="yes";

  function cleanStr(v){ return (v==null?"":String(v)); }

  /* ------------------------------------------------------------------------
   * Safe localStorage
   * ---------------------------------------------------------------------- */
  function lsSet(obj){
    try{ localStorage.setItem(LS_KEY, JSON.stringify({ts:Date.now(),payload:obj||{}})); }catch(_){}
  }
  function lsGet(){
    try{
      const raw = localStorage.getItem(LS_KEY);
      if(!raw) return null;
      const wrap = JSON.parse(raw);
      if(!wrap || typeof wrap!=="object") return null;
      if(typeof wrap.ts!=="number") return null;
      if(Date.now()-wrap.ts>MAX_AGE) return null;
      return wrap.payload||null;
    }catch(_){ return null; }
  }
  function lsClear(){ try{ localStorage.removeItem(LS_KEY); }catch(_{}); }

  /* ------------------------------------------------------------------------
   * Param parsing (?..., #..., mixed)
   * ---------------------------------------------------------------------- */
  function parseParams(){
    const out={};
    const add=kv=>{
      if(!kv) return;
      const i=kv.indexOf("=");
      if(i<0) return;
      const k=decodeURIComponent(kv.slice(0,i));
      const v=decodeURIComponent(kv.slice(i+1));
      if(k) out[k]=v;
    };
    const grab=str=>{
      if(!str) return;
      str=str.replace(/^[?#]/,"");
      if(!str) return;
      str.split("&").forEach(add);
    };
    grab(window.location.search);
    grab(window.location.hash);
    return out;
  }

  /* ------------------------------------------------------------------------
   * Field normalization (accept multiple aliases)
   * ---------------------------------------------------------------------- */
  function normInbound(obj){
    obj=obj||{};
    const out={};

    // keys (aliases)
    out.gid   = obj.gid   ?? obj.guestinfoKey ?? null;
    out.entry = obj.entry ?? obj.entryId      ?? obj.guestEntriesId ?? null;

    const name  = obj.name  ?? obj.custName  ?? obj.guestName  ?? "";
    const phone = obj.phone ?? obj.custPhone ?? obj.guestPhone ?? "";

    out.name  = cleanStr(name);
    out.phone = cleanStr(phone);

    // status aliases
    out.status = (obj.status ?? obj.statusInit ?? obj.guestStatus ?? "").toString().toLowerCase() || null;

    // prefilled
    if("prefilledStep1" in obj) out.prefilledStep1 = truthy(obj.prefilledStep1);
    else if("prefilled" in obj) out.prefilledStep1 = truthy(obj.prefilled);
    else if("prefill" in obj) out.prefilledStep1 = truthy(obj.prefill);

    // fallback: derive from name/phone
    if(out.prefilledStep1==null){
      out.prefilledStep1 = !!(out.name || out.phone);
    }

    // explicit uistart?
    out.uistart = obj.uistart ? String(obj.uistart).toLowerCase() : undefined;

    return out;
  }

  /* ------------------------------------------------------------------------
   * Compute UI start from payload (no guest/entry objects)
   * ---------------------------------------------------------------------- */
  function computeUiStartFromPayload(p){
    const u=(p.uistart||"").toLowerCase();
    if(GP_STEPS.includes(u)) return u;
    const st=(p.status||"").toLowerCase();
    if(st==="proposal"||st==="sold") return "step3";
    const hasStep1=!!(p.prefilledStep1||p.name||p.phone);
    return hasStep1?"step2":"step1";
  }

  /* ------------------------------------------------------------------------
   * Compute UI start when we ALSO have guest + entry data (optional)
   * guestObj, entryObj are raw Firebase rows.
   * ---------------------------------------------------------------------- */
  function computeUiStart(g, entry, hint){
    // explicit hint wins
    if(hint && GP_STEPS.includes(hint)) return hint;

    // Use guest status if present
    const st=(g?.status||"").toLowerCase();
    if(st==="proposal"||st==="sold") return "step3";

    // Step1 coverage?
    const hasStep1 = !!(
      g?.prefilledStep1 || g?.custName || g?.custPhone ||
      entry?.guestName || entry?.guestPhone
    );
    return hasStep1?"step2":"step1";
  }

  /* ------------------------------------------------------------------------
   * URL builder (no PII in URL)
   * ---------------------------------------------------------------------- */
  function buildUrl(dest,p){
    const params=[];
    if(p.gid)   params.push("gid="+encodeURIComponent(p.gid));
    if(p.entry) params.push("entry="+encodeURIComponent(p.entry));
    params.push("uistart="+encodeURIComponent(computeUiStartFromPayload(p)));
    const joiner=dest.includes("?")?"&":"?";
    return params.length?(dest+joiner+params.join("&")):dest;
  }

  /* ------------------------------------------------------------------------
   * PUBLIC: open(payload)  (payload already normalized-ish)
   * ---------------------------------------------------------------------- */
  function open(payload){
    payload = normInbound(payload||{});

    // choose dest
    const dest = payload.dest || window.GUESTINFO_PAGE || "../html/guestinfo.html";

    // store (strip dest/uistart)
    const store = {
      gid: payload.gid||null,
      entry: payload.entry||null,
      name: payload.name||"",
      phone: payload.phone||"",
      status: payload.status||null,
      prefilledStep1: !!payload.prefilledStep1
    };
    if(!store.prefilledStep1 && (store.name||store.phone)) store.prefilledStep1=true;

    dlog("open()",store);

    // remember last guest
    if(store.gid){
      try{ localStorage.setItem("last_guestinfo_key", store.gid); }catch(_){}
    }

    lsSet(store);
    window.location.href = buildUrl(dest,store);
  }

  /* ------------------------------------------------------------------------
   * PUBLIC: openFromSources({guest?,entry?,dest?})
   * Convenience wrapper used by guestform-actions & guestinfo-dashboard.
   * ---------------------------------------------------------------------- */
  function openFromSources(opts){
    opts=opts||{};
    const g=opts.guest||null;
    const e=opts.entry||null;

    const payload = {
      gid:   g ? opts.gid || opts.guestKey || g._key || g.key || g.id || null : (opts.gid||null),
      entry: e ? opts.entryId || e._key || e.key || e.id || null : (opts.entry||null),
      name:  g?.custName || e?.guestName || "",
      phone: g?.custPhone|| e?.guestPhone|| "",
      status: g?.status || null,
      prefilledStep1: !!(g?.prefilledStep1 || g?.custName || g?.custPhone || e?.guestName || e?.guestPhone),
      dest: opts.dest
    };

    // explicit ui hint?
    const hint=opts.uistart;
    payload.uistart = computeUiStart(g,e,hint);

    open(payload);
  }

  /* ------------------------------------------------------------------------
   * Merge URL params > LS payload (receiver side)
   * ---------------------------------------------------------------------- */
  function mergePayload(urlP,lsP){
    const out = Object.assign({}, normInbound(lsP||{}));
    const u   = normInbound(urlP||{});
    for(const k in u){
      if(u[k]!==undefined) out[k]=u[k];
    }
    return out;
  }

  /* ------------------------------------------------------------------------
   * Receive + normalize; sets window.GP_HANDOFF
   * ---------------------------------------------------------------------- */
  let _received=null;
  function receive(){
    const urlP=parseParams();
    const lsP =lsGet();
    let merged=mergePayload(urlP,lsP);

    // derived
    merged.phoneDigits = digitsOnly(merged.phone);
    merged.uistart = computeUiStartFromPayload(merged);

    // stash
    window.GP_HANDOFF = merged;
    _received=merged;
    dlog("receive()",merged);
    return merged;
  }

  /* ------------------------------------------------------------------------
   * Consume (gp-app calls after it has read)
   * ---------------------------------------------------------------------- */
  function consume(opts){
    opts=opts||{};
    if(opts.clearLocal!==false) lsClear();
    return _received||receive();
  }

  /* ------------------------------------------------------------------------
   * Debug
   * ---------------------------------------------------------------------- */
  function debugLog(){
    console.log("[gp-handoff] GP_HANDOFF =",window.GP_HANDOFF);
    console.log("[gp-handoff] LS =",lsGet());
  }

  /* ------------------------------------------------------------------------
   * Expose
   * ---------------------------------------------------------------------- */
  window.gpHandoff = {
    open,
    openFromSources,
    receive,
    consume,
    computeUiStart: computeUiStartFromPayload,
    debugLog,
    _lsGet: lsGet,
    _lsClear: lsClear
  };

  // autorun
  receive();

})();
