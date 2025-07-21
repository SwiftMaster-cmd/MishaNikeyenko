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

export function timeAgo(ts) {
  if (!ts) return "-";
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(diff / 3600000);
  if (h < 24) return `${h}h`;
  const d = Math.floor(diff / 86400000);
  return `${d}d`;
}

// ── Core data logic ────────────────────────────────────────────────────────
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
  let earned = 0, max = 0;
  for (const [k, wt] of Object.entries(weights)) {
    const st = FIELD_STEP[k] || "step1";
    steps[st].max += wt;
    max += wt;
    if (hasVal(getField(g, k))) {
      steps[st].earned += wt;
      earned += wt;
    }
  }
  const pct = max ? Math.round(earned/max*100) : 0;
  return { pct, steps };
}

// ── UI helpers ─────────────────────────────────────────────────────────────
export function statusBadge(status) {
  const map = {
    new:      ["role-badge role-guest",   "NEW"],
    working:  ["role-badge role-lead",    "WORKING"],
    proposal: ["role-badge role-dm",      "PROPOSAL"],
    sold:     ["role-badge role-admin",   "SOLD"]
  };
  const [cls, lbl] = map[status] || map.new;
  return { cls, lbl };
}

export function groupByStatus(guestMap) {
  const groups = { new:[], working:[], proposal:[], sold:[] };
  for (const [id, g] of Object.entries(guestMap)) {
    const st = detectStatus(g);
    (groups[st] ||= []).push([id, g]);
  }
  for (const arr of Object.values(groups)) {
    arr.sort((a,b) => {
      const ta = Math.max(a[1].updatedAt||0, a[1].submittedAt||0, a[1].sale?.soldAt||0);
      const tb = Math.max(b[1].updatedAt||0, b[1].submittedAt||0, b[1].sale?.soldAt||0);
      return tb - ta;
    });
  }
  return groups;
}

// ── Section renderer ───────────────────────────────────────────────────────
export function statusSectionHtml(_, rows, users, currentUid, currentRole) {
  if (!rows?.length) return `<div class="guestinfo-subsection-empty"><i>None.</i></div>`;
  return rows.map(([id,g]) =>
    guestCardHtml(id, g, users, currentUid, currentRole)
  ).join("");
}

// ── Card renderer ──────────────────────────────────────────────────────────
export function guestCardHtml(id, g, users, currentUid, currentRole) {
  const submitter = users[g.userUid] || {};
  const { cls: statusCls, lbl: statusLbl } = statusBadge(detectStatus(g));
  const { pct } = computeGuestPitchQuality(normGuest(g));
  const pcls = pct >= 75 ? "pitch-good" : pct >= 40 ? "pitch-warn" : "pitch-low";

  // mask phone
  const raw   = digitsOnly(g.custPhone || "");
  const last4 = raw.slice(-4).padStart(4,"0");
  const masked = `XXX-${last4}`;

  // time ago
  const when = timeAgo(g.submittedAt);

  // submitter badge
  const roleCls = currentRole === "me"
    ? "role-badge role-me"
    : currentRole === "lead"
      ? "role-badge role-lead"
      : currentRole === "dm"
        ? "role-badge role-dm"
        : "role-badge role-admin";
  const nameLabel = esc(submitter.name || submitter.email || g.userUid);

  return `
    <div class="guest-card" id="guest-card-${id}" style="position:relative;padding:8px;border:1px solid #ddd;border-radius:8px;margin-bottom:8px;">
      <div style="display:flex;align-items:center;gap:8px;">
        <span class="${statusCls}" style="border-radius:999px;padding:2px 8px;font-size:.85em;">${statusLbl}</span>
        <span class="guest-pitch-pill ${pcls}" style="border-radius:999px;padding:2px 8px;font-size:.85em;">${pct}%</span>
        <button class="btn-sm btn-edit-actions" style="margin-left:auto;background:none;border:none;cursor:pointer;"
                onclick="window.guestinfo.toggleActionButtons('${id}')">⋮</button>
      </div>
      <div style="text-align:center;font-weight:600;padding:8px 0;font-size:1.1em;">
        ${esc(g.custName || "-")}
      </div>
      <div style="display:flex;align-items:center;position:relative;font-size:.85em;">
        <span class="${roleCls}" style="border-radius:999px;padding:2px 6px;">${nameLabel}</span>
        <span class="guest-phone" style="margin-left:12px;cursor:pointer;" onclick="this.textContent='${esc(g.custPhone||"")}'">
          ${masked}
        </span>
        <span class="guest-time" style="position:absolute;right:0;background:rgba(0,0,0,0.1);border-radius:999px;padding:2px 6px;">
          ${when}
        </span>
      </div>
      <div class="guest-card-actions" style="display:none;flex-wrap:wrap;gap:4px;margin-top:8px;"></div>
    </div>`;
}