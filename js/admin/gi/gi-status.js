(() => {
  const ROLES = window.ROLES || { ME: "me", LEAD: "lead", DM: "dm", ADMIN: "admin" };

  // Helper: check if a value counts as "present"
  function hasVal(v){
    if (v == null) return false;
    if (typeof v === "string")  return v.trim() !== "";
    if (typeof v === "number")  return true;
    if (typeof v === "boolean") return v;
    if (Array.isArray(v))       return v.length>0;
    if (typeof v === "object")  return Object.keys(v).length>0;
    return false;
  }

  // Normalize guest info, merge evaluate and solution fields
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
      custPhoneDigits: (custPhone||"").replace(/\D+/g,""),
      evaluate:e,
      solution:sol,
      prefilledStep1: src.prefilledStep1 || hasVal(custName) || hasVal(custPhone)
    };
    out.status = detectStatus(out);
    return out;
  }

  // Detect guest status string
  function detectStatus(g){
    const s=(g?.status||"").toLowerCase();
    if (s) return s;
    if (g?.solution && hasVal(g.solution.text)) return "proposal";
    if (hasAnyEvalData(g?.evaluate)) return "working";
    return "new";
  }

  // Checks if any key evaluation data is present
  function hasAnyEvalData(e){
    if(!e) return false;
    return ["currentCarrier","numLines","coverageZip","deviceStatus","finPath",
            "billPain","dataNeed","hotspotNeed","intlNeed"].some(k=>hasVal(e[k]));
  }

  // Retrieve a field from guest normalized data
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

  // Compute pitch quality % based on weighted fields
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

  function computeGuestPitchQuality(g, weights=PITCH_WEIGHTS){
    const steps={step1:{earned:0,max:0},step2:{earned:0,max:0},step3:{earned:0,max:0}};
    let earned=0, max=0;
    for(const [k,wt] of Object.entries(weights)){
      const st=FIELD_STEP[k]||"step1";
      steps[st].max += wt; max += wt;
      const ok=hasVal(getField(g,k));
      if(ok){ steps[st].earned += wt; earned += wt; }
    }
    const pctFull = max ? Math.round((earned/max)*100) : 0;
    return {pct: pctFull, steps};
  }

  // Group guestinfo by status, sorting by latest activity descending
  function groupByStatus(guestMap) {
    const groups = { new: [], working: [], proposal: [], sold: [] };
    for (const [id, g] of Object.entries(guestMap)) {
      const st = detectStatus(g);
      if (!groups[st]) groups[st] = [];
      groups[st].push([id, g]);
    }
    for (const k in groups) {
      groups[k].sort((a, b) => latestActivityTs(b[1]) - latestActivityTs(a[1]));
    }
    return groups;
  }

  // Helpers for dates and activity timestamps
  function nowMs() { return Date.now(); }
  function msNDaysAgo(n) { return nowMs() - n * 864e5; }
  function latestActivityTs(g) {
    return Math.max(g.updatedAt || 0, g.submittedAt || 0, g.sale?.soldAt || 0, g.solution?.completedAt || 0);
  }
  function inCurrentWeek(g) {
    return latestActivityTs(g) >= msNDaysAgo(7);
  }

  // Status badge HTML with class & label
  function statusBadge(status) {
    const s = (status || "new").toLowerCase();
    const map = {
      new: ["role-badge role-guest", "NEW"],
      working: ["role-badge role-lead", "WORKING"],
      proposal: ["role-badge role-dm", "PROPOSAL"],
      sold: ["role-badge role-admin", "SOLD"]
    };
    const [cls, label] = map[s] || map.new;
    return `<span class="${cls}">${label}</span>`;
  }

  // Pitch badge decorator with color class and tooltip
  function decoratePitch(pct, status, compObj) {
    const p = Math.min(100, Math.max(0, Math.round(pct)));
    const cls = p >= 75 ? "pitch-good" : p >= 40 ? "pitch-warn" : "pitch-low";

    const lines = [`Pitch Quality: ${p}%`];
    if (status) lines.push(`Status: ${status.toUpperCase()}`);
    if (compObj?.steps) {
      const stepLines = Object.entries(compObj.steps).map(([k, s]) => {
        const val = Math.round(s.earned / s.max * 100);
        return `${k} ${val}%`;
      });
      if (stepLines.length) lines.push(stepLines.join(" | "));
    }

    return { pct: p, cls, tooltip: lines.join(" • ") };
  }

  // Escape HTML helper
  const esc = str => String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  // Guest card HTML with pitch and status badges
  function guestCardHtml(id, g, users, currentUid, currentRole) {
    const submitter = users[g.userUid] || {};
    const status = detectStatus(g);
    const statBadge = statusBadge(status);

    const savedPct = typeof g.completion?.pct === "number" ? g.completion.pct : null;
    const compObj = savedPct != null ? { pct: savedPct } : computeGuestPitchQuality(normGuest(g));
    const pct = savedPct != null ? savedPct : compObj.pct;
    const pitch = decoratePitch(pct, status, savedPct != null ? null : compObj);

    const pitchHtml = `<span class="guest-pitch-pill ${pitch.cls}" title="${esc(pitch.tooltip)}">${pitch.pct}%</span>`;

    const situation = g.situation || "";
    const sitPreview = situation.length > 140 ? situation.slice(0, 137) + "…" : situation;

    const isSold = status === "sold";
    const units = isSold ? (g.sale?.units ?? "") : "";
    const soldAt = isSold && g.sale?.soldAt ? new Date(g.sale.soldAt).toLocaleString() : "";
    const saleSummary = isSold ? `<div class="guest-sale-summary"><b>Sold:</b> ${soldAt} &bull; Units: ${units}</div>` : "";

    const actions = [
      `<button class="btn btn-secondary btn-sm" onclick="window.guestinfo.openGuestInfoPage('${id}')">${g.evaluate || g.solution || g.sale ? "Open" : "Continue"}</button>`,
      window.guestinfo.canEditEntry(currentRole, g.userUid, currentUid) ? `<button class="btn btn-primary btn-sm" style="margin-left:8px;" onclick="window.guestinfo.toggleEdit('${id}')">Quick Edit</button>` : "",
      !isSold && window.guestinfo.canMarkSold(currentRole, g.userUid, currentUid) ? `<button class="btn btn-success btn-sm" style="margin-left:8px;" onclick="window.guestinfo.markSold('${id}')">Mark Sold</button>` : "",
      isSold && window.guestinfo.canMarkSold(currentRole, g.userUid, currentUid) ? `<button class="btn btn-danger btn-sm" style="margin-left:8px;" onclick="window.guestinfo.deleteSale('${id}')">Delete Sale</button>` : "",
      window.guestinfo.canDelete(currentRole) ? `<button class="btn btn-danger btn-sm" style="margin-left:8px;" onclick="window.guestinfo.deleteGuestInfo('${id}')">Delete Lead</button>` : ""
    ].filter(Boolean).join("");

    return `
      <div class="guest-card" id="guest-card-${id}">
        <div class="guest-display">
          <div><b>Status:</b> ${statBadge}</div>
          <div><b>Pitch:</b> ${pitchHtml}</div>
          <div><b>Submitted by:</b> ${esc(submitter?.name || submitter?.email || g.userUid)}</div>
          <div><b>Customer:</b> ${esc(g.custName) || "-" } &nbsp; | &nbsp; <b>Phone:</b> ${esc(g.custPhone) || "-" }</div>
          ${g.serviceType ? `<div><b>Type:</b> ${esc(g.serviceType)}</div>` : ""}
          ${situation ? `<div><b>Situation:</b> ${esc(sitPreview)}</div>` : ""}
          <div><b>When:</b> ${g.submittedAt ? new Date(g.submittedAt).toLocaleString() : "-"}</div>
          ${saleSummary}
          <div class="guest-card-actions" style="margin-top:8px;">${actions}</div>
        </div>

        <form class="guest-edit-form" id="guest-edit-form-${id}" style="display:none;margin-top:8px;">
          <label>Customer Name
            <input type="text" name="custName" value="${esc(g.custName)}" />
          </label>
          <label>Customer Phone
            <input type="text" name="custPhone" value="${esc(g.custPhone)}" />
          </label>
          <label>Service Type
            <input type="text" name="serviceType" value="${esc(g.serviceType)}" />
          </label>
          <label>Situation
            <textarea name="situation">${esc(g.situation)}</textarea>
          </label>
          <div style="margin-top:8px;">
            <button type="button" class="btn btn-primary btn-sm" onclick="window.guestinfo.saveEdit('${id}')">Save</button>
            <button type="button" class="btn btn-secondary btn-sm" onclick="window.guestinfo.cancelEdit('${id}')">Cancel</button>
          </div>
        </form>
      </div>
    `;
  }

  // Inject CSS for pitch badges once
  function ensurePitchCss() {
    if (document.getElementById("guestinfo-pitch-css")) return;
    const css = `
      .guest-pitch-pill {
        display:inline-block;
        padding:2px 10px;
        margin-left:4px;
        font-size:var(--fs-xs,12px);
        font-weight:700;
        line-height:1.2;
        border-radius:999px;
        border:1px solid var(--border-color,rgba(255,255,255,.2));
        white-space:nowrap;
      }
      .guest-pitch-pill.pitch-good {
        background:var(--success-bg,rgba(0,200,83,.15));
        color:var(--success,#00c853);
      }
      .guest-pitch-pill.pitch-warn {
        background:var(--warning-bg,rgba(255,179,0,.15));
        color:var(--warning,#ffb300);
      }
      .guest-pitch-pill.pitch-low {
        background:var(--danger-bg,rgba(255,82,82,.15));
        color:var(--danger,#ff5252);
      }
    `.trim();
    const style = document.createElement("style");
    style.id = "guestinfo-pitch-css";
    style.textContent = css;
    document.head.appendChild(style);
  }
  ensurePitchCss();

  // Expose public API
  window.guestinfo = window.guestinfo || {};
  Object.assign(window.guestinfo, {
    hasVal,
    normGuest,
    detectStatus,
    hasAnyEvalData,
    getField,
    computeGuestPitchQuality,
    groupByStatus,
    latestActivityTs,
    inCurrentWeek,
    statusBadge,
    decoratePitch,
    guestCardHtml,
    ensurePitchCss
  });
})();