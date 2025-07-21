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

// ── Relative time ─────────────────────────────────────────────────────────
export function timeAgo(ts) {
  if (!ts) return "-";
  const diff = Date.now() - ts;
  const m = Math.floor(diff/60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(diff/3600000);
  if (h < 24) return `${h}h`;
  const d = Math.floor(diff/86400000);
  return `${d}d`;
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

// ── Pitch quality ─────────────────────────────────────────────────────────
export function computeGuestPitchQuality(g, weights=PITCH_WEIGHTS) {
  const steps = { step1:{earned:0,max:0}, step2:{earned:0,max:0}, step3:{earned:0,max:0} };
  let earned = 0, max = 0;
  Object.entries(weights).forEach(([k, wt]) => {
    const st = FIELD_STEP[k] || "step1";
    steps[st].max += wt; max += wt;
    const ok = hasVal(getField(g,k));
    if (ok) { steps[st].earned += wt; earned += wt; }
  });
  const pct = max ? Math.round(earned/max*100) : 0;
  return { pct, steps };
}

// ── Status badge ──────────────────────────────────────────────────────────
export function statusBadge(status) {
  const map = {
    new:      ["role-badge role-guest", "NEW"],
    working:  ["role-badge role-lead",  "WORKING"],
    proposal: ["role-badge role-dm",    "PROPOSAL"],
    sold:     ["role-badge role-admin", "SOLD"]
  };
  const [cls, lbl] = map[status] || map.new;
  return { cls, lbl };
}

// ── Grouping ───────────────────────────────────────────────────────────────
export function groupByStatus(guestMap) {
  const groups = { new:[], working:[], proposal:[], sold:[] };
  Object.entries(guestMap).forEach(([id,g]) => {
    const st = detectStatus(g);
    groups[st] = groups[st]||[];
    groups[st].push([id,g]);
  });
  Object.values(groups).forEach(arr => {
    arr.sort((a,b)=>{
      const ta = Math.max(a[1].updatedAt||0, a[1].submittedAt||0, a[1].sale?.soldAt||0);
      const tb = Math.max(b[1].updatedAt||0, b[1].submittedAt||0, b[1].sale?.soldAt||0);
      return tb - ta;
    });
  });
  return groups;
}

// ── HTML renderers ────────────────────────────────────────────────────────
export function statusSectionHtml(title, rows, users, currentUid, currentRole, highlight=false) {
  if (!rows?.length) return `<div class="guestinfo-subsection-empty"><i>None.</i></div>`;
  const cards = rows.map(([id,g]) => guestCardHtml(id,g,users,currentUid,currentRole)).join("");
  return `<div class="guestinfo-subsection${highlight?" highlight":""}">${cards}</div>`;
}

export function guestCardHtml(id, g, users, currentUid, currentRole) {
  const submitter = users[g.userUid] || {};
  const status    = detectStatus(g);
  const { cls: statusCls, lbl: statusLbl } = statusBadge(status);

  const pitchObj = computeGuestPitchQuality(g);
  const pcls = pitchObj.pct >= 75 ? "pitch-good" : pitchObj.pct >= 40 ? "pitch-warn" : "pitch-low";
  const pval = pitchObj.pct;

  // mask phone
  const raw = digitsOnly(g.custPhone||"");
  const last4 = raw.slice(-4).padStart(4, "0");
  const masked = `XXX-${last4}`;

  // time ago
  const when = timeAgo(g.submittedAt);

  // submitter role badge
  const roleCls = currentRole === "me" ? "role-badge role-me"
                 : currentRole === "lead" ? "role-badge role-lead"
                 : currentRole === "dm"   ? "role-badge role-dm"
                                          : "role-badge role-admin";
  const nameLabel = esc(submitter.name||submitter.email||"Unknown");

  return `
    <div class="guest-card" id="guest-card-${id}">
      <div class="card-header">
        <span class="${statusCls}" style="border-radius:999px;padding:2px 8px;">${statusLbl}</span>
        <span class="guest-pitch-pill ${pcls}" title="Pitch Quality: ${pval}%">${pval}%</span>
        <button class="btn-edit-actions" onclick="window.guestinfo.toggleActionButtons('${id}')">⋮</button>
      </div>
      <div class="card-body">
        <div class="guest-name" style="text-align:center;font-weight:600;">${esc(g.custName||"-")}</div>
      </div>
      <div class="card-footer">
        <span class="${roleCls}" style="border-radius:999px;padding:2px 6px;font-size:.85em;">
          ${nameLabel}
        </span>
        <span class="guest-time" style="position:absolute;bottom:8px;right:8px;background:rgba(0,0,0,0.1);border-radius:8px;padding:2px 6px;font-size:.75em;">
          ${when}
        </span>
        <span class="guest-phone" style="margin-left:1rem;cursor:pointer;" onclick="this.textContent='${esc(g.custPhone||"")}'">
          ${masked}
        </span>
      </div>
      <div class="guest-card-actions" style="display:none;gap:4px;margin-top:8px;">
        <!-- action buttons here -->
      </div>
    </div>`;
}