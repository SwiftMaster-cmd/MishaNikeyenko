/* gp-handoff-lite.js -------------------------------------------------------
 * Minimal cross-surface handoff for Guest Portal.
 * Stores {gid,entry,name,phone,status,prefilledStep1,ts} in localStorage,
 * appends ?gid=&entry=&uistart=… to dest URL, and lets receiver merge.
 * ------------------------------------------------------------------------ */
(function(global){
  const LS_KEY  = "gp_handoff_payload_v1";
  const MAX_AGE = 15*60*1000; // 15 min

  function safeSet(obj){
    try{localStorage.setItem(LS_KEY,JSON.stringify({ts:Date.now(),payload:obj||{}}));}catch(_){}
  }
  function safeGet(){
    try{
      const raw=localStorage.getItem(LS_KEY);
      if(!raw) return null;
      const wrap=JSON.parse(raw);
      if(!wrap||typeof wrap!=="object")return null;
      if(Date.now()-wrap.ts>MAX_AGE)return null;
      return wrap.payload||null;
    }catch(_){return null;}
  }
  function safeClear(){ try{localStorage.removeItem(LS_KEY);}catch(_){ } }

  function computeUiStart(p){
    if(!p) return "step1";
    const u=(p.uistart||"").toLowerCase();
    if(["step1","step2","step3"].includes(u)) return u;
    const st=(p.status||"").toLowerCase();
    if(st==="proposal"||st==="sold") return "step3";
    if(p.prefilledStep1 || p.name || p.phone) return "step2";
    return "step1";
  }

  /* Sender --------------------------------------------------------------- */
  function open(payload){
    payload=payload||{};
    const dest = payload.dest || global.GUESTINFO_PAGE || "../html/guestinfo.html";
    const store = {
      gid:payload.gid||null,
      entry:payload.entry||null,
      name:payload.name||"",
      phone:payload.phone||"",
      status:(payload.status||"").toLowerCase()||null,
      prefilledStep1: !!payload.prefilledStep1
    };
    if(!store.prefilledStep1 && (store.name||store.phone)) store.prefilledStep1=true;

    safeSet(store);
    if(store.gid){
      try{localStorage.setItem("last_guestinfo_key",store.gid);}catch(_){}
    }

    const q=[];
    if(store.gid)   q.push("gid="+encodeURIComponent(store.gid));
    if(store.entry) q.push("entry="+encodeURIComponent(store.entry));
    q.push("uistart="+encodeURIComponent(computeUiStart(store)));
    const joiner=dest.indexOf("?")>=0?"&":"?";
    const url=q.length?dest+joiner+q.join("&"):dest;
    window.location.href=url;
  }

  /* Receiver -------------------------------------------------------------- */
  function parseParams(){
    const out={};
    const add=(kv)=>{
      if(!kv)return;
      const i=kv.indexOf("="); if(i<0)return;
      out[decodeURIComponent(kv.slice(0,i))]=decodeURIComponent(kv.slice(i+1));
    };
    const grab=str=>{
      if(!str)return;
      str=str.replace(/^[?#]/,""); if(!str)return;
      str.split("&").forEach(add);
    };
    grab(window.location.search);
    grab(window.location.hash);
    return out;
  }

  function receive(){
    const urlP=parseParams();
    const lsP=safeGet();
    const out=Object.assign({},lsP||{});
    if(urlP.gid!=null)out.gid=urlP.gid;
    if(urlP.entry!=null)out.entry=urlP.entry;
    if(urlP.uistart!=null)out.uistart=urlP.uistart;
    // we *don't* overwrite name/phone from URL (keep LS)
    out.prefilledStep1 = out.prefilledStep1 || !!(out.name||out.phone);
    out.uistart = computeUiStart(out);
    out.ts = Date.now();
    global.GP_HANDOFF = out;
    return out;
  }

  function consume(opts){
    opts=opts||{};
    const p=receive();
    if(opts.clearLocal!==false) safeClear();
    return p;
  }

  /* mapped shape for gp-basic (optional) */
  function consumePrefill(opts){
    const raw=consume(opts);
    if(!raw) return null;
    return {
      gid:raw.gid||null,
      entry:raw.entry||null,
      uistart:raw.uistart||null,
      custName:raw.name||"",
      custPhone:raw.phone||"",
      statusHint:raw.status||null,
      prefilledStep1:!!raw.prefilledStep1,
      ts:raw.ts||Date.now()
    };
  }

  global.gpHandoffLite = {
    open,receive,consume,consumePrefill,
    _get:safeGet,_clear:safeClear,_compute:computeUiStart
  };
})(window);