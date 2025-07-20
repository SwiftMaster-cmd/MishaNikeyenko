(() => {
  const ROLES = { ME: "me", LEAD: "lead", DM: "dm", ADMIN: "admin" };
  const PITCH_WEIGHTS = {
    custName:8, custPhone:7,
    currentCarrier:12, numLines:8, coverageZip:8,
    deviceStatus:8, finPath:12,
    billPain:4, dataNeed:4, hotspotNeed:2, intlNeed:2,
    solutionText:25
  };

  const FIELD_STEP = {
    custName:"step1", custPhone:"step1",
    currentCarrier:"step2", numLines:"step2", coverageZip:"step2",
    deviceStatus:"step2", finPath:"step2",
    billPain:"step2", dataNeed:"step2", hotspotNeed:"step2", intlNeed:"step2",
    solutionText:"step3"
  };

  function hasVal(v){
    if (v == null) return false;
    if (typeof v === "string")  return v.trim() !== "";
    if (typeof v === "number")  return true;
    if (typeof v === "boolean") return v;
    if (Array.isArray(v))       return v.length>0;
    if (typeof v === "object")  return Object.keys(v).length>0;
    return false;
  }

  function digitsOnly(s){
    return (s||"").replace(/\D+/g,"");
  }

  function hasAnyEvalData(e){
    if(!e) return false;
    return ["currentCarrier","numLines","coverageZip","deviceStatus","finPath",
            "billPain","dataNeed","hotspotNeed","intlNeed"].some(k=>hasVal(e[k]));
  }

  function detectStatus(g){
    const s=(g?.status||"").toLowerCase();
    if (s) return s;
    if (g?.solution && hasVal(g.solution.text)) return "proposal";
    if (hasAnyEvalData(g?.evaluate)) return "working";
    return "new";
  }

  function hasPrefilledStep1(g){
    return hasVal(g?.custName)||hasVal(g?.custPhone);
  }

  function normGuest(src){
    src = src||{};
    const custName  = src.custName  ?? src.guestName  ?? "";
    const custPhone = src.custPhone ?? src.guestPhone ?? "";
    const e = Object.assign({}, src.evaluate||{});
    if (e.currentCarrier==null && src.currentCarrier!=null) e.currentCarrier=src.currentCarrier;
    if (e.numLines      ==null && src.numLines     !=null) e.numLines=src.numLines;
    if (e.coverageZip   ==null && src.coverageZip  !=null) e.coverageZip=src.coverageZip;
    if (e.deviceStatus  ==null && src.deviceStatus !=null) e.deviceStatus=src.deviceStatus;
    if (e.finPath       ==null && src.finPath      !=null) e.finPath=src.finPath;

    const sol = Object.assign({}, src.solution||{});
    if (sol.text==null && src.solutionText!=null) sol.text=src.solutionText;

    const out = {
      ...src,
      custName,
      custPhone,
      custPhoneDigits:digitsOnly(custPhone),
      evaluate:e,
      solution:sol,
      prefilledStep1: src.prefilledStep1 || hasPrefilledStep1({custName,custPhone})
    };
    out.status = detectStatus(out);
    return out;
  }

  function getField(g,k){
    const e=g?.evaluate||{}, sol=g?.solution||{};
    switch(k){
      case "custName":return g?.custName;
      case "custPhone":return g?.custPhone;
      case "currentCarrier":return e.currentCarrier;
      case "numLines":return e.numLines;
      case "coverageZip":return e.coverageZip;
      case "deviceStatus":return e.deviceStatus;
      case "finPath":return e.finPath;
      case "billPain":return e.billPain;
      case "dataNeed":return e.dataNeed;
      case "hotspotNeed":return e.hotspotNeed;
      case "intlNeed":return e.intlNeed;
      case "solutionText":return sol.text;
      default:return undefined;
    }
  }

  function computeGuestPitchQuality(g, weights=PITCH_WEIGHTS){
    const steps={step1:{earned:0,max:0},step2:{earned:0,max:0},step3:{earned:0,max:0}};
    const fields={};
    let earned=0,max=0;
    for(const [k,wt] of Object.entries(weights)){
      const st=FIELD_STEP[k]||"step1";
      steps[st].max += wt; max += wt;
      const ok=hasVal(getField(g,k));
      if(ok){ steps[st].earned += wt; earned += wt; }
      fields[k]={ok,wt};
    }
    const pctFull = max?Math.round((earned/max)*100):0;
    return {pct: pctFull, steps, fields};
  }

  // Role helpers
  const isAdmin = r => r === ROLES.ADMIN;
  const isDM = r => r === ROLES.DM;
  const isLead = r => r === ROLES.LEAD;
  const isMe = r => r === ROLES.ME;

  const canDelete = r => isAdmin(r) || isDM(r) || isLead(r);
  const canEditEntry = (r, ownerUid, currentUid) =>
    r && (isAdmin(r) || isDM(r) || isLead(r) || ownerUid === currentUid);
  const canMarkSold = canEditEntry;

  const getUsersUnderDM = (users, dmUid) => {
    const leads = Object.entries(users)
      .filter(([, u]) => u.role === ROLES.LEAD && u.assignedDM === dmUid)
      .map(([uid]) => uid);
    const mes = Object.entries(users)
      .filter(([, u]) => u.role === ROLES.ME && leads.includes(u.assignedLead))
      .map(([uid]) => uid);
    return new Set([...leads, ...mes]);
  };

  function filterGuestinfo(guestinfo, users, currentUid, currentRole) {
    if (!guestinfo || !users || !currentUid || !currentRole) return {};

    if (isAdmin(currentRole)) return guestinfo;

    if (isDM(currentRole)) {
      const under = getUsersUnderDM(users, currentUid);
      under.add(currentUid);
      return Object.fromEntries(
        Object.entries(guestinfo).filter(([, g]) => under.has(g.userUid))
      );
    }

    if (isLead(currentRole)) {
      const mesUnderLead = Object.entries(users)
        .filter(([, u]) => u.role === ROLES.ME && u.assignedLead === currentUid)
        .map(([uid]) => uid);
      const visible = new Set([...mesUnderLead, currentUid]);
      return Object.fromEntries(
        Object.entries(guestinfo).filter(([, g]) => visible.has(g.userUid))
      );
    }

    if (isMe(currentRole)) {
      return Object.fromEntries(
        Object.entries(guestinfo).filter(([, g]) => g.userUid === currentUid)
      );
    }

    return {};
  }

  // Export core API
  window.guestinfoCore = {
    ROLES,
    hasVal,
    digitsOnly,
    hasAnyEvalData,
    detectStatus,
    hasPrefilledStep1,
    normGuest,
    getField,
    computeGuestPitchQuality,
    isAdmin,
    isDM,
    isLead,
    isMe,
    canDelete,
    canEditEntry,
    canMarkSold,
    getUsersUnderDM,
    filterGuestinfo
  };
})();