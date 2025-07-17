/* gp-core.js ================================================================
 * Core data + scoring utilities for the OSL Guest Portal.
 * Pure(ish): no DOM queries, no Firebase calls. Safe to unit-test.
 *
 * LOAD ORDER: gp-core.js → gp-ui.js → gp-app.js
 * ------------------------------------------------------------------------- */

(function(global){

  /* -----------------------------------------------------------------------
   * Public constants (can be overridden by defining on window *before* load)
   * --------------------------------------------------------------------- */
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

  const TIER_A_FIELDS = global.TIER_A_FIELDS || ["currentCarrier","numLines","coverageZip","deviceStatus","finPath"];
  const TIER_B_FIELDS = global.TIER_B_FIELDS || ["billPain","dataNeed","hotspotNeed","intlNeed"];

  const FIELD_STEP = Object.assign({
    custName:"step1", custPhone:"step1",
    currentCarrier:"step2", numLines:"step2", coverageZip:"step2",
    deviceStatus:"step2", finPath:"step2", billPain:"step2",
    dataNeed:"step2", hotspotNeed:"step2", intlNeed:"step2",
    serviceType:"step2", situation:"step2", carrierInfo:"step2", requirements:"step2",
    solutionText:"step3"
  }, global.FIELD_STEP || {});

  /* Which steps count toward *stage* completion by high-level status */
  const STATUS_STEPS = Object.assign({
    new:["step1"],
    working:["step1","step2"],
    proposal:["step1","step2","step3"],
    sold:["step1","step2","step3"]
  }, global.STATUS_STEPS || {});

  /* -----------------------------------------------------------------------
   * Generic value helpers
   * --------------------------------------------------------------------- */
  function hasVal(v){
    if (v == null) return false;
    if (typeof v === "string")  return v.trim() !== "";
    if (typeof v === "number")  return true;
    if (typeof v === "boolean") return v; // only true counts
    if (Array.isArray(v))       return v.length > 0;
    if (typeof v === "object")  return Object.keys(v).length > 0;
    return false;
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

  /* Defensive deep-clone + normalize shape */
  function normGuest(g){
    const out = g ? JSON.parse(JSON.stringify(g)) : {};
    out.evaluate = out.evaluate || {};
    out.solution = out.solution || {};
    return out;
  }

  /* Status inference */
  function detectStatus(g){
    const s = (g?.status || "").toLowerCase();
    if (s) return s;
    if (g?.sale) return "sold";
    if (g?.solution && g.solution.text) return "proposal";
    if (g?.evaluate && hasAnyEvalData(g.evaluate)) return "working";
    return "new";
  }

  /* Safe field accessor across legacy shapes */
  function getFieldValue(g, key){
    const e = g?.evaluate || {};
    const sol = g?.solution || {};
    switch(key){
      case "custName":      return g?.custName ?? g?.guestName ?? "";
      case "custPhone":     return g?.custPhone ?? g?.guestPhone ?? "";
      case "currentCarrier":return e.currentCarrier ?? e.carrierInfo ?? "";
      case "numLines":      return e.numLines;
      case "coverageZip":   return e.coverageZip;
      case "deviceStatus":  return e.deviceStatus;
      case "finPath":       return e.finPath;
      case "billPain":      return e.billPain;
      case "dataNeed":      return e.dataNeed;
      case "hotspotNeed":   return e.hotspotNeed;
      case "intlNeed":      return e.intlNeed;
      case "serviceType":   return e.serviceType;
      case "situation":     return e.situation;
      case "carrierInfo":   return e.carrierInfo;
      case "requirements":  return e.requirements;
      case "solutionText":  return sol.text;
      default:              return undefined;
    }
  }

  /* -----------------------------------------------------------------------
   * Pitch scoring
   * --------------------------------------------------------------------- */
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

  /* -----------------------------------------------------------------------
   * Export
   * --------------------------------------------------------------------- */
  global.gpCore = {
    PITCH_WEIGHTS,
    TIER_A_FIELDS,
    TIER_B_FIELDS,
    FIELD_STEP,
    STATUS_STEPS,

    hasVal,
    hasAnyEvalData,
    normGuest,
    detectStatus,
    getFieldValue,
    computePitchFull,
    computePitchStage
  };

})(window);