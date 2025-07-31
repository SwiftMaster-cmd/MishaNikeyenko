// gp-core.js - pure functions, constants, no UI or Firebase

export const PITCH_WEIGHTS = {
  custName:8, custPhone:7,
  currentCarrier:12, numLines:8, coverageZip:8,
  deviceStatus:8, finPath:12,
  billPain:4, dataNeed:4, hotspotNeed:2, intlNeed:2,
  solutionText:25
};

export const FIELD_STEP = {
  custName:"step1", custPhone:"step1",
  currentCarrier:"step2", numLines:"step2", coverageZip:"step2",
  deviceStatus:"step2", finPath:"step2",
  billPain:"step2", dataNeed:"step2", hotspotNeed:"step2", intlNeed:"step2",
  solutionText:"step3"
};

export function hasVal(v) {
  if (v == null) return false;
  if (typeof v === "string")  return v.trim() !== "";
  if (typeof v === "number")  return true;
  if (typeof v === "boolean") return v;
  if (Array.isArray(v))       return v.length>0;
  if (typeof v === "object")  return Object.keys(v).length>0;
  return false;
}

export function digitsOnly(s){
  return (s||"").replace(/\D+/g,"");
}

export function detectStatus(g){
  const s=(g?.status||"").toLowerCase();
  if (s) return s;
  if (g?.solution && hasVal(g.solution.text)) return "proposal";
  if (g.evaluate && Object.values(g.evaluate).some(hasVal)) return "working";
  return "new";
}

export function normGuest(src = {}) {
  const custName  = src.custName  ?? src.guestName  ?? "";
  const custPhone = src.custPhone ?? src.guestPhone ?? "";
  const e = {...src.evaluate || {}};
  if (e.currentCarrier==null && src.currentCarrier!=null) e.currentCarrier=src.currentCarrier;
  if (e.numLines==null && src.numLines!=null) e.numLines=src.numLines;
  if (e.coverageZip==null && src.coverageZip!=null) e.coverageZip=src.coverageZip;
  if (e.deviceStatus==null && src.deviceStatus!=null) e.deviceStatus=src.deviceStatus;
  if (e.finPath==null && src.finPath!=null) e.finPath=src.finPath;
  const sol = {...src.solution||{}};
  if (sol.text==null && src.solutionText!=null) sol.text=src.solutionText;
  const out = {
    ...src,
    custName,
    custPhone,
    custPhoneDigits: digitsOnly(custPhone),
    evaluate: e,
    solution: sol,
    prefilledStep1: src.prefilledStep1 || hasVal(custName) || hasVal(custPhone)
  };
  out.status = detectStatus(out);
  return out;
}

export function computeGuestPitchQuality(g, weights = PITCH_WEIGHTS) {
  const steps = { step1: {earned:0,max:0}, step2: {earned:0,max:0}, step3: {earned:0,max:0} };
  let earned = 0, max = 0;
  for (const [k, wt] of Object.entries(weights)) {
    const st = FIELD_STEP[k] || "step1";
    steps[st].max += wt; max += wt;
    const ok = hasVal(g[k]) || hasVal(g.evaluate?.[k]);
    if (ok) {
      steps[st].earned += wt;
      earned += wt;
    }
  }
  const pct = max ? Math.round((earned / max) * 100) : 0;
  return { pct, steps };
}