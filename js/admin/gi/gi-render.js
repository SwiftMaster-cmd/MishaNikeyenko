// guestinfo-render.js

// ── Constants ───────────────────────────────────────────────────────────────
export const PITCH_WEIGHTS = {
  custName: 8, custPhone: 7,
  currentCarrier: 12, numLines: 8, coverageZip: 8,
  deviceStatus: 8, finPath: 12,
  billPain: 4, dataNeed: 4, hotspotNeed: 2, intlNeed: 2,
  solutionText: 25
};

export const FIELD_STEP = {
  custName: "step1", custPhone: "step1",
  currentCarrier: "step2", numLines: "step2", coverageZip: "step2",
  deviceStatus: "step2", finPath: "step2",
  billPain: "step2", dataNeed: "step2", hotspotNeed: "step2", intlNeed: "step2",
  solutionText: "step3"
};

// ── Helpers ────────────────────────────────────────────────────────────────
export function hasVal(v) {
  if (v == null) return false;
  if (typeof v === "string")  return v.trim() !== "";
  if (typeof v === "number")  return true;
  if (typeof v === "boolean") return v;
  if (Array.isArray(v))       return v.length > 0;
  if (typeof v === "object")  return Object.keys(v).length > 0;
  return false;
}

export function digitsOnly(s) {
  return (s||"").replace(/\D+/g, "");
}

export function esc(str) {
  return String(str||"")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Core status & pitch logic ─────────────────────────────────────────────
export function detectStatus(g) {
  const s = (g?.status||"").toLowerCase();
  if (s) return s;
  if (g?.solution && hasVal(g.solution.text)) return "proposal";
  if (["currentCarrier","numLines","coverageZip","deviceStatus","finPath",
       "billPain","dataNeed","hotspotNeed","intlNeed"]
      .some(k => hasVal(g.evaluate?.[k]))
  ) return "working";
  return "new";
}

export function normGuest(src) {
  src = src||{};
  const custName  = src.custName  ?? src.guestName  ?? "";
  const custPhone = src.custPhone ?? src.guestPhone ?? "";
  const e = { ...(src.evaluate||{}) };
  if (e.currentCarrier==null && src.currentCarrier!=null) e.currentCarrier = src.currentCarrier;
  if (e.numLines     ==null && src.numLines     !=null) e.numLines     = src.numLines;
  if (e.coverageZip  ==null && src.coverageZip  !=null) e.coverageZip  = src.coverageZip;
  if (e.deviceStatus ==null && src.deviceStatus !=null) e.deviceStatus = src.deviceStatus;
  if (e.finPath      ==null && src.finPath      !=null) e.finPath      = src.finPath;
  const sol = { ...(src.solution||{}) };
  if (sol.text==null && src.solutionText!=null) sol.text = src.solutionText;
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

export function getField(g, k) {
  const e = g.evaluate||{}, sol = g.solution||{};
  switch(k) {
    case "custName":      return g?.custName;
    case "custPhone":     return g?.custPhone;
    case "currentCarrier":return e.currentCarrier;
    case "numLines":      return e.numLines;
    case "coverageZip":   return e.coverageZip;
    case "deviceStatus":  return e.deviceStatus;
    case "finPath":       return e.finPath;
    case "billPain":      return e.billPain;
    case "dataNeed":      return e.dataNeed;
    case "hotspotNeed":   return e.hotspotNeed;
    case "intlNeed":      return e.intlNeed;
    case "solutionText":  return sol.text;
    default: return undefined;
  }
}

export function computeGuestPitchQuality(g, weights=PITCH_WEIGHTS) {
  const steps = { step1:{earned:0,max:0}, step2:{earned:0,max:0}, step3:{earned:0,max:0} };
  const fields = {};
  let earned = 0, max = 0;
  Object.entries(weights).forEach(([k, wt]) => {
    const st = FIELD_STEP[k] || "step1";
    steps[st].max += wt;
    max += wt;
    const ok = hasVal(getField(g,k));
    if (ok) {
      steps[st].earned += wt;
      earned += wt;
    }
    fields[k] = { ok, wt };
  });
  const pct = max ? Math.round(earned/max*100) : 0;
  return { pct, steps, fields };
}

export function statusBadge(status) {
  const map = {
    new:      ["role-badge role-guest", "NEW"],
    working:  ["role-badge role-lead",  "WORKING"],
    proposal: ["role-badge role-dm",    "PROPOSAL"],
    sold:     ["role-badge role-admin", "SOLD"]
  };
  const [cls, lbl] = map[status] || map.new;
  return `<span class="${cls}">${lbl}</span>`;
}

export function decoratePitch(pct, status, compObj) {
  const p   = Math.min(100, Math.max(0, Math.round(pct)));
  const cls = p>=75 ? "pitch-good" : p>=40 ? "pitch-warn" : "pitch-low";
  const lines = [`Pitch Quality: ${p}%`].concat(status ? [`Status: ${status.toUpperCase()}`] : []);
  return { pct: p, cls, tooltip: lines.join(" • ") };
}

export function groupByStatus(guestMap) {
  const groups = { new:[], working:[], proposal:[], sold:[] };
  Object.entries(guestMap).forEach(([id,g]) => {
    const st = detectStatus(g);
    groups[st] = groups[st]||[];
    groups[st].push([id,g]);
  });
  Object.values(groups).forEach(arr => {
    arr.sort((a,b)=>{
      const ta = Math.max(a[1].updatedAt||0, a[1].submittedAt||0, a[1].sale?.soldAt||0, a[1].solution?.completedAt||0);
      const tb = Math.max(b[1].updatedAt||0, b[1].submittedAt||0, b[1].sale?.soldAt||0, b[1].solution?.completedAt||0);
      return tb - ta;
    });
  });
  return groups;
}

// ── HTML renderers ────────────────────────────────────────────────────────
export function statusSectionHtml(title, rows, users, currentUid, currentRole, highlight=false) {
  if (!rows?.length) {
    return `
      <div class="guestinfo-subsection guestinfo-subsection-empty">
        <h3>${esc(title)}</h3>
        <div class="guestinfo-empty-msg"><i>None.</i></div>
      </div>`;
  }
  const cards = rows.map(([id,g])=>guestCardHtml(id,g,users,currentUid,currentRole)).join("");
  return `
    <div class="guestinfo-subsection ${highlight?"guestinfo-subsection-highlight":""}">
      <h3>${esc(title)}</h3>
      <div class="guestinfo-container">${cards}</div>
    </div>`;
}

export function guestCardHtml(id, g, users, currentUid, currentRole) {
  const submitter = users[g.userUid]||{};
  const ev = g.evaluate||{};
  const serviceType = g.serviceType ?? ev.serviceType ?? "";
  const situation   = g.situation   ?? ev.situation   ?? "";
  const sitPreview  = situation.length>140 ? situation.slice(0,137)+"…" : situation;
  const status      = detectStatus(g);
  const statBadge   = statusBadge(status);

  const savedPct = typeof g.completion?.pct==="number" ? g.completion.pct : null;
  const compObj  = savedPct!=null ? { pct: savedPct } : computeGuestPitchQuality(normGuest(g));
  const pct      = savedPct!=null ? savedPct : compObj.pct;
  const pitch    = decoratePitch(pct, status, savedPct!=null?null:compObj);
  const pitchHtml = `<span class="guest-pitch-pill ${pitch.cls}" title="${esc(pitch.tooltip)}">${pitch.pct}%</span>`;

  const isSold     = status==="sold";
  const saleSummary = isSold
    ? `<div class="guest-sale-summary"><b>Sold:</b> ${new Date(g.sale.soldAt).toLocaleString()} • Units: ${g.sale.units}</div>`
    : "";

  const allowDelete = ["admin","dm","lead"].includes(currentRole);
  const allowEdit   = allowDelete || g.userUid===currentUid;
  const allowSold   = allowEdit;

  // build action buttons (hidden by default via CSS)
  const actions = [
    `<button class="btn btn-secondary btn-sm" onclick="window.guestinfo.openGuestInfoPage('${id}')">${g.evaluate||g.solution||g.sale?"Open":"Continue"}</button>`,
    allowEdit ? `<button class="btn btn-primary btn-sm" onclick="window.guestinfo.toggleEdit('${id}')">Quick Edit</button>` : "",
    (!isSold && allowSold) ? `<button class="btn btn-success btn-sm" onclick="window.guestinfo.markSold('${id}')">Mark Sold</button>` : "",
    (isSold  && allowSold) ? `<button class="btn btn-danger btn-sm"  onclick="window.guestinfo.deleteSale('${id}')">Delete Sale</button>` : "",
    allowDelete ? `<button class="btn btn-danger btn-sm" onclick="window.guestinfo.deleteGuestInfo('${id}')">Delete Lead</button>` : ""
  ].filter(Boolean).join("");

  return `
    <div class="guest-card" id="guest-card-${id}" style="position:relative;">
      <!-- toggle button -->
      <button class="btn btn-sm btn-edit-actions"
              style="position:absolute; top:8px; right:8px; z-index:1;"
              onclick="window.guestinfo.toggleActionButtons('${id}')">
        ⋮
      </button>

      <div class="guest-display">
        <div><b>Status:</b> ${statBadge}</div>
        <div><b>Pitch:</b> ${pitchHtml}</div>
        <div><b>Submitted by:</b> ${esc(submitter.name||submitter.email||g.userUid)}</div>
        <div><b>Customer:</b> ${esc(g.custName)||"-"} | <b>Phone:</b> ${esc(g.custPhone)||"-"}</div>
        ${serviceType? `<div><b>Type:</b> ${esc(serviceType)}</div>` : ""}
        ${situation?   `<div><b>Situation:</b> ${esc(sitPreview)}</div>`   : ""}
        <div><b>When:</b> ${g.submittedAt? new Date(g.submittedAt).toLocaleString() : "-"}</div>
        ${saleSummary}
        <div class="guest-card-actions" style="display:none; gap:8px; margin-top:8px;">
          ${actions}
        </div>
      </div>

      <form class="guest-edit-form" id="guest-edit-form-${id}" style="display:none;margin-top:8px;">
        <label>Customer Name <input type="text" name="custName" value="${esc(g.custName)}" /></label>
        <label>Customer Phone<input type="text" name="custPhone" value="${esc(g.custPhone)}" /></label>
        <label>Service Type  <input type="text" name="serviceType" value="${esc(serviceType)}" /></label>
        <label>Situation     <textarea name="situation">${esc(situation)}</textarea></label>
        <div style="margin-top:8px;">
          <button type="button" class="btn btn-primary btn-sm" onclick="window.guestinfo.saveEdit('${id}')">Save</button>
          <button type="button" class="btn btn-secondary btn-sm" onclick="window.guestinfo.cancelEdit('${id}')">Cancel</button>
        </div>
      </form>
    </div>`;
}