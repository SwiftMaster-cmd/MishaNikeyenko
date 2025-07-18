/* gp-core.js ================================================================
 * Core data + scoring + normalization utilities for the OSL Guest Portal.
 * Pure(ish): no DOM queries, no Firebase calls. Safe to unit-test.
 *
 * Responsibilities
 * ----------------
 * • Canonical field weight map for pitch scoring.
 * • Tier groupings (A/B) used by NBQ coaching chips.
 * • Safe normalization of *guest* objects from many historical shapes:
 *     - guestName/guestPhone  → custName/custPhone
 *     - solutionText          → solution.text
 *     - scattered eval fields → evaluate.{...}
 *     - digits copies         → custPhoneDigits
 *     - prefilledStep1 auto   → true when name/phone exists
 * • Status inference (new/working/proposal/sold).
 * • Scoring helpers (full + stage).
 *
 * LOAD ORDER: gp-core.js → gp-ui.js → gp-app.js
 * ------------------------------------------------------------------------- */

(function(global){

  /* =======================================================================
   * Public constants (caller can override by defining globals *before* load)
   * ===================================================================== */
  const PITCH_WEIGHTS = Object.assign({
    // Step 1
    custName:8,
    custPhone:7,
    // Step 2 core bundle
    currentCarrier:12,
    numLines:8,
    coverageZip:8,
    deviceStatus:8,
    finPath:12,
    // Optional extras
    billPain:4,
    dataNeed:4,
    hotspotNeed:2,
    intlNeed:2,
    // Legacy (0 pts – notes)
    serviceType:0,
    situation:0,
    carrierInfo:0,
    requirements:0,
    // Step 3
    solutionText:25
  }, global.PITCH_WEIGHTS || {});

  const TIER_A_FIELDS = global.TIER_A_FIELDS ||
    ["currentCarrier","numLines","coverageZip","deviceStatus","finPath"];

  const TIER_B_FIELDS = global.TIER_B_FIELDS ||
    ["billPain","dataNeed","hotspotNeed","intlNeed"];

  const FIELD_STEP = Object.assign({
    custName:"step1", custPhone:"step1",
    currentCarrier:"step2", numLines:"step2", coverageZip:"step2",
    deviceStatus:"step2", finPath:"step2", billPain:"step2",
    dataNeed:"step2", hotspotNeed:"step2", intlNeed:"step2",
    serviceType:"step2", situation:"step2", carrierInfo:"step2", requirements:"step2",
    solutionText:"step3"
  }, global.FIELD_STEP || {});

  /* Which steps count toward *stage* completion by coarse status */
  const STATUS_STEPS = Object.assign({
    new:["step1"],
    working:["step1","step2"],
    proposal:["step1","step2","step3"],
    sold:["step1","step2","step3"]
  }, global.STATUS_STEPS || {});

  /* =======================================================================
   * Generic value helpers
   * ===================================================================== */
  function hasVal(v){
    if (v == null) return false;
    if (typeof v === "string")  return v.trim() !== "";
    if (typeof v === "number")  return true;
    if (typeof v === "boolean") return v; // only true counts
    if (Array.isArray(v))       return v.length > 0;
    if (typeof v === "object")  return Object.keys(v).length > 0;
    return false;
  }

  function digitsOnly(str){ return (str||"").replace(/\D+/g,""); }

  function formatDigits10(str){
    const d = digitsOnly(str);
    if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
    return d;
  }

  function hasAnyEvalData(e){
    if (!e) return false;
    return (
      hasVal(e.currentCarrier) ||
      hasVal(e.numLines)       ||
      hasVal(e.coverageZip)    ||
      hasVal(e.deviceStatus)   ||
      hasVal(e.finPath)        ||
      hasVal(e.billPain)       ||
      hasVal(e.dataNeed)       ||
      hasVal(e.hotspotNeed)    ||
      hasVal(e.intlNeed)       ||
      hasVal(e.serviceType)    ||
      hasVal(e.situation)      ||
      hasVal(e.carrierInfo)    ||
      hasVal(e.requirements)
    );
  }

  /* =======================================================================
   * Status inference
   * ===================================================================== */
  function detectStatus(g){
    const s = (g?.status || "").toLowerCase();
    if (s) return s;
    if (g?.sale) return "sold"; // hard override
    if (g?.solution && hasVal(g.solution.text)) return "proposal";
    if (hasAnyEvalData(g?.evaluate)) return "working";
    return "new";
  }

  /* =======================================================================
   * hasPrefilledStep1
   * ===================================================================== */
  function hasPrefilledStep1(g){
    return !!(hasVal(g?.custName) || hasVal(g?.custPhone) ||
              hasVal(g?.guestName) || hasVal(g?.guestPhone) ||
              g?.prefilledStep1);
  }

  /* =======================================================================
   * Safe field accessor across legacy shapes
   * ===================================================================== */
  function getFieldValue(g, key){
    const e = g?.evaluate || {};
    const sol = g?.solution || {};
    switch(key){
      case "custName":       return g?.custName ?? g?.guestName ?? "";
      case "custPhone":      return g?.custPhone ?? g?.guestPhone ?? "";
      case "currentCarrier": return e.currentCarrier ?? e.carrierInfo ?? g?.currentCarrier ?? "";
      case "numLines":       return e.numLines    ?? g?.numLines;
      case "coverageZip":    return e.coverageZip ?? g?.coverageZip;
      case "deviceStatus":   return e.deviceStatus?? g?.deviceStatus;
      case "finPath":        return e.finPath     ?? g?.finPath;
      case "billPain":       return e.billPain    ?? g?.billPain;
      case "dataNeed":       return e.dataNeed    ?? g?.dataNeed;
      case "hotspotNeed":    return e.hotspotNeed ?? g?.hotspotNeed;
      case "intlNeed":       return e.intlNeed    ?? g?.intlNeed;
      case "serviceType":    return e.serviceType ?? g?.serviceType;
      case "situation":      return e.situation   ?? g?.situation;
      case "carrierInfo":    return e.carrierInfo ?? g?.carrierInfo;
      case "requirements":   return e.requirements?? g?.requirements;
      case "solutionText":   return sol.text      ?? g?.solutionText;
      default:               return undefined;
    }
  }

  /* =======================================================================
   * Normalization
   * -----------------------------------------------------------------------
   * Accepts any historical *guest* shape and produces the canonical object
   * used by gp-app / gp-ui:
   *
   * {
   *   custName, custPhone, custPhoneDigits,
   *   status,
   *   evaluate:{...},     // full set (missing keys omitted)
   *   solution:{text,...},
   *   prefilledStep1:bool,
   *   ...all original passthrough keys (shallow) for debugging
   * }
   * ===================================================================== */
  function normGuest(g){
    const src = g || {};

    /* Step 1 ------------------------------------------------------ */
    const custName  = src.custName ?? src.guestName ?? "";
    const custPhone = src.custPhone ?? src.guestPhone ?? src.custPhoneDigits ?? src.guestPhoneDigits ?? "";
    const custPhoneDigits = digitsOnly(custPhone);

    /* Evaluate ---------------------------------------------------- */
    const e = Object.assign({}, src.evaluate);
    // promote legacy top-level fields if evaluate missing them
    if (e.currentCarrier == null && src.currentCarrier != null) e.currentCarrier = src.currentCarrier;
    if (e.numLines       == null && src.numLines       != null) e.numLines       = src.numLines;
    if (e.coverageZip    == null && src.coverageZip    != null) e.coverageZip    = src.coverageZip;
    if (e.deviceStatus   == null && src.deviceStatus   != null) e.deviceStatus   = src.deviceStatus;
    if (e.finPath        == null && src.finPath        != null) e.finPath        = src.finPath;
    if (e.billPain       == null && src.billPain       != null) e.billPain       = src.billPain;
    if (e.dataNeed       == null && src.dataNeed       != null) e.dataNeed       = src.dataNeed;
    if (e.hotspotNeed    == null && src.hotspotNeed    != null) e.hotspotNeed    = src.hotspotNeed;
    if (e.intlNeed       == null && src.intlNeed       != null) e.intlNeed       = src.intlNeed;
    if (e.serviceType    == null && src.serviceType    != null) e.serviceType    = src.serviceType;
    if (e.situation      == null && src.situation      != null) e.situation      = src.situation;
    if (e.carrierInfo    == null && src.carrierInfo    != null) e.carrierInfo    = src.carrierInfo;
    if (e.requirements   == null && src.requirements   != null) e.requirements   = src.requirements;

    /* Solution ---------------------------------------------------- */
    const sol = Object.assign({}, src.solution);
    if (sol.text == null && src.solutionText != null) sol.text = src.solutionText;

    /* prefilledStep1 ---------------------------------------------- */
    const prefilledStep1 = src.prefilledStep1 || hasPrefilledStep1({custName, custPhone});

    /* status ------------------------------------------------------ */
    const status = detectStatus({
      ...src,
      custName,
      custPhone,
      evaluate:e,
      solution:sol
    });

    /* output ------------------------------------------------------ */
    const out = {
      ...src, // keep other downstream keys (sale, etc.)
      custName,
      custPhone,
      custPhoneDigits,
      evaluate:e,
      solution:sol,
      prefilledStep1,
      status // normalized/inferred (src.status may be overwritten but preserved above)
    };

    return out;
  }

  /* =======================================================================
   * Pitch scoring
   * ===================================================================== */
  function computePitchFull(g, weights=PITCH_WEIGHTS){
    const steps = {step1:{earned:0,max:0}, step2:{earned:0,max:0}, step3:{earned:0,max:0}};
    const fields = {};
    let earnedFull = 0;
    let fullMax    = 0;

    for (const [key, wt] of Object.entries(weights)){
      const st = FIELD_STEP[key] || "step1";
      steps[st].max += wt;
      fullMax += wt;
      const v  = getFieldValue(g, key);
      const ok = hasVal(v);
      if (ok){ steps[st].earned += wt; earnedFull += wt; }
      fields[key] = { ok, wt };
    }

    const pctFull = fullMax ? Math.round((earnedFull/fullMax)*100) : 0;
    return {pctFull, earnedFull, fullMax, steps, fields};
  }

  function computePitchStage(g, weights=PITCH_WEIGHTS){
    const s    = detectStatus(g);
    const inc  = STATUS_STEPS[s] || ["step1"];
    const comp = computePitchFull(g, weights);
    let stageMax=0, stageEarn=0;
    inc.forEach(st=>{ stageMax += comp.steps[st].max; stageEarn += comp.steps[st].earned; });
    const pctStage = stageMax ? Math.round((stageEarn/stageMax)*100) : 0;
    return {...comp, status:s, pctStage, stageMax, stageEarn};
  }

  /* =======================================================================
   * Export
   * ===================================================================== */
  global.gpCore = {
    // constants
    PITCH_WEIGHTS,
    TIER_A_FIELDS,
    TIER_B_FIELDS,
    FIELD_STEP,
    STATUS_STEPS,

    // utils
    hasVal,
    digitsOnly,
    formatDigits10,
    hasAnyEvalData,
    hasPrefilledStep1,
    normGuest,
    detectStatus,
    getFieldValue,
    computePitchFull,
    computePitchStage
  };

})(window);