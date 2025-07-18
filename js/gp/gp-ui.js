/* gp-core-lite.js  -----------------------------------------------------------
 * Minimal, dependency-free core helpers for Guest Portal.
 * Safe to load anywhere; no DOM, no Firebase.
 * -------------------------------------------------------------------------- */
(function(g){

  /* ---------------- Configurable weights / mapping ----------------------- */
  const WEIGHTS = Object.assign({
    custName:5,
    custPhone:5,
    currentCarrier:10,
    numLines:5,
    coverageZip:5,
    solutionText:25
  }, g.GP_CORE_WEIGHTS || {});

  const FIELD_STEP = Object.assign({
    custName:"step1",
    custPhone:"step1",
    currentCarrier:"step2",
    numLines:"step2",
    coverageZip:"step2",
    solutionText:"step3"
  }, g.GP_FIELD_STEP || {});

  /* ---------------- Generic helpers ------------------------------------- */
  function hasVal(v){
    if (v == null) return false;
    if (typeof v === "string") return v.trim() !== "";
    if (typeof v === "number") return true;
    if (typeof v === "boolean") return v;
    if (Array.isArray(v)) return v.length>0;
    if (typeof v === "object") return Object.keys(v).length>0;
    return false;
  }
  function digitsOnly(s){ return (s||"").replace(/\D+/g,""); }
  function formatDigits10(s){
    const d = digitsOnly(s);
    if (d.length===10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
    return d;
  }

  /* ---------------- Status inference ------------------------------------ */
  function detectStatus(g){
    if (g?.solution?.text) return "proposal";
    if (hasVal(g?.currentCarrier) || hasVal(g?.numLines) || hasVal(g?.coverageZip)) return "working";
    if (hasVal(g?.custName) || hasVal(g?.custPhone)) return "new";
    return "new";
  }

  /* ---------------- Normalization --------------------------------------- */
  function normGuest(raw){
    const src = raw || {};
    const custName  = src.custName  ?? src.guestName  ?? "";
    const custPhone = src.custPhone ?? src.guestPhone ?? "";
    const solution  = src.solution
      ? {...src.solution}
      : (src.solutionText ? {text:src.solutionText} : {});
    const out = {
      ...src,
      custName,
      custPhone,
      custPhoneDigits: digitsOnly(custPhone),
      currentCarrier: src.currentCarrier ?? src.evaluate?.currentCarrier ?? "",
      numLines:       src.numLines       ?? src.evaluate?.numLines       ?? "",
      coverageZip:    src.coverageZip    ?? src.evaluate?.coverageZip    ?? "",
      solution,
      status: detectStatus({
        ...src,
        custName,
        custPhone,
        currentCarrier: src.currentCarrier ?? src.evaluate?.currentCarrier,
        numLines:       src.numLines       ?? src.evaluate?.numLines,
        coverageZip:    src.coverageZip    ?? src.evaluate?.coverageZip,
        solution
      })
    };
    return out;
  }

  /* ---------------- Pitch scoring --------------------------------------- */
  function _getField(g,k){
    switch(k){
      case "custName": return g.custName;
      case "custPhone": return g.custPhone;
      case "currentCarrier": return g.currentCarrier;
      case "numLines": return g.numLines;
      case "coverageZip": return g.coverageZip;
      case "solutionText": return g.solution?.text;
      default: return undefined;
    }
  }
  function computePitchFull(g){
    const steps = {step1:{earned:0,max:0},step2:{earned:0,max:0},step3:{earned:0,max:0}};
    let earned=0,max=0;
    const fields={};
    for (const [k,wt] of Object.entries(WEIGHTS)){
      const st = FIELD_STEP[k] || "step1";
      const v  = _getField(g,k);
      const ok = hasVal(v);
      if (ok){ earned+=wt; steps[st].earned+=wt; }
      steps[st].max += wt; max+=wt;
      fields[k]={ok,wt};
    }
    const pct = max?Math.round(earned/max*100):0;
    return {pctFull:pct,steps,fields};
  }

  /* ---------------- Export ---------------------------------------------- */
  g.gpCore = {
    WEIGHTS,
    FIELD_STEP,
    hasVal,
    digitsOnly,
    formatDigits10,
    detectStatus,
    normGuest,
    computePitchFull
  };

})(window);