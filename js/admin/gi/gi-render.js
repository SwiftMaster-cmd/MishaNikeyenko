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
  return (s || "").replace(/\D+/g, "");
}

export function esc(str) {
  return String(str || "")
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

// ── Core logic ─────────────────────────────────────────────────────────────
export function detectStatus(g) {
  const s = (g?.status || "").toLowerCase();
  if (s) return s;
  if (g?.solution && hasVal(g.solution.text)) return "proposal";
  if (["currentCarrier","numLines","coverageZip","deviceStatus","finPath",
       "billPain","dataNeed","hotspotNeed","intlNeed"]
      .some(k => hasVal(g.evaluate?.[k]))
  ) return "working";
  return "new";
}

export function normGuest(src) {
  src = src || {};
  const custName  = src.custName  ?? src.guestName  ?? "";
  const custPhone = src.custPhone ?? src.guestPhone ?? "";
  const e = { ...(src.evaluate || {}) };
  if (e.currentCarrier == null && src.currentCarrier != null) e.currentCarrier = src.currentCarrier;
  if (e.numLines      == null && src.numLines      != null) e.numLines      = src.numLines;
  if (e.coverageZip   == null && src.coverageZip   != null) e.coverageZip   = src.coverageZip;
  if (e.deviceStatus  == null && src.deviceStatus  != null) e.deviceStatus  = src.deviceStatus;
  if (e.finPath       == null && src.finPath       != null) e.finPath       = src.finPath;
  const sol = { ...(src.solution || {}) };
  if (sol.text == null && src.solutionText != null) sol.text = src.solutionText;

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
  const e = g.evaluate || {}, sol = g.solution || {};
  switch (k) {
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

export function computeGuestPitchQuality(g, weights = PITCH_WEIGHTS) {
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
  return { pct: max ? Math.round(earned/max*100) : 0, steps };
}

export function statusBadge(status) {
  const map = {
    new:      ["role-badge role-guest", "NEW"],
    working:  ["role-badge role-lead",  "WORKING"],
    proposal: ["role-badge role-dm",    "PROPOSAL"],
    sold:     ["role-badge role-admin", "SOLD"]
  };
  return map[status] || map.new;
}

export function groupByStatus(guestMap) {
  const groups = { new:[], working:[], proposal:[], sold:[] };
  for (const [id, g] of Object.entries(guestMap)) {
    const st = detectStatus(g);
    (groups[st] ||= []).push([id, g]);
  }
  for (const arr of Object.values(groups)) {
    arr.sort((a, b) => {
      const ta = Math.max(a[1].updatedAt||0, a[1].submittedAt||0, a[1].sale?.soldAt||0);
      const tb = Math.max(b[1].updatedAt||0, b[1].submittedAt||0, b[1].sale?.soldAt||0);
      return tb - ta;
    });
  }
  return groups;
}

// ── Section renderer ───────────────────────────────────────────────────────
export function statusSectionHtml(title, rows, users, currentUid, currentRole, highlight = false) {
  if (!rows?.length) {
    return `<div class="guestinfo-subsection-empty"><i>None.</i></div>`;
  }
  return rows.map(([id, g]) =>
    guestCardHtml(id, g, users, currentUid, currentRole)
  ).join("");
}

// ── Card renderer ──────────────────────────────────────────────────────────
export function guestCardHtml(id, g, users, currentUid, currentRole) {
  const submitter = users[g.userUid] || {};
  const [statusCls, statusLbl] = statusBadge(detectStatus(g));
  const { pct } = computeGuestPitchQuality(normGuest(g));
  const pcls    = pct >= 75 ? "pitch-good" : pct >= 40 ? "pitch-warn" : "pitch-low";
  const bg      = pct >= 75
                  ? "rgba(200,255,200,0.3)"
                  : pct >= 40
                    ? "rgba(255,235,150,0.3)"
                    : "rgba(255,200,200,0.3)";

  // Phone masking
  const raw    = esc(g.custPhone || "");
  const num    = digitsOnly(g.custPhone || "");
  const last4  = num.slice(-4).padStart(4, "0");
  const masked = `XXX-${last4}`;

  // Time ago
  const when   = timeAgo(g.submittedAt);

  // Submitter badge
  const roleCls = currentRole === "me"    ? "role-badge role-me"
                 : currentRole === "lead" ? "role-badge role-lead"
                 : currentRole === "dm"   ? "role-badge role-dm"
                                            : "role-badge role-admin";
  const nameLabel = esc(submitter.name || submitter.email || "");

  // Action buttons
  const isSold    = detectStatus(g) === "sold";
  const canEdit   = ["admin","dm","lead"].includes(currentRole) || g.userUid === currentUid;
  const canSold   = canEdit && !isSold;
  const actions = [
    `<button class="btn btn-secondary btn-sm" onclick="window.guestinfo.openGuestInfoPage('${id}')">
       ${g.evaluate||g.solution||g.sale ? "Open" : "Continue"}
     </button>`,
    canEdit ? `<button class="btn btn-primary btn-sm" onclick="window.guestinfo.toggleEdit('${id}')">Quick Edit</button>` : "",
    canSold ? `<button class="btn btn-success btn-sm" onclick="window.guestinfo.markSold('${id}')">Mark Sold</button>` : "",
    isSold  ? `<button class="btn btn-danger btn-sm" onclick="window.guestinfo.deleteSale('${id}')">Delete Sale</button>` : "",
    canEdit ? `<button class="btn btn-danger btn-sm" onclick="window.guestinfo.deleteGuestInfo('${id}')">Delete Lead</button>` : ""
  ].filter(Boolean).join("");

  return `
    <div class="guest-card" id="guest-card-${id}"
         style="position:relative;padding:12px;border-radius:8px;background:${bg};margin-bottom:8px;">
      <div style="display:flex;align-items:center;gap:8px;">
        <span class="${statusCls}"
              style="padding:2px 8px;border-radius:999px;font-size:.85em;">
          ${statusLbl}
        </span>
        <span class="guest-pitch-pill ${pcls}"
              style="padding:2px 8px;border-radius:999px;font-size:.85em;background:${bg};">
          ${pct}%
        </span>
        <button class="btn-edit-actions"
                style="margin-left:auto;background:none;border:none;font-size:1.2rem;cursor:pointer;"
                onclick="window.guestinfo.toggleActionButtons('${id}')">⋮</button>
      </div>

      <div style="text-align:center;font-weight:600;font-size:1.1em;margin:8px 0;">
        ${esc(g.custName || "-")}
      </div>

      <div style="display:flex;align-items:center;justify-content:center;position:relative;">
        <span class="${roleCls}"
              style="padding:2px 6px;border-radius:999px;font-size:.85em;background:${bg};">
          ${nameLabel}
        </span>
        <span class="guest-phone"
              style="margin:0 12px;padding:2px 6px;border-radius:999px;font-size:.85em;cursor:pointer;background:${bg};"
              onclick="this.textContent = this.textContent==='${masked}' ? '${raw}' : '${masked}'">
          ${masked}
        </span>
        <span class="guest-time"
              style="position:absolute;right:0;padding:2px 6px;border-radius:999px;font-size:.75em;background:${bg};">
          ${when}
        </span>
      </div>

      <div class="guest-card-actions"
           style="display:none;flex-wrap:wrap;gap:4px;margin-top:8px;">
        ${actions}
      </div>

      <form class="guest-edit-form" id="guest-edit-form-${id}" style="display:none;margin-top:8px;">
        <label>Customer Name <input type="text" name="custName" value="${esc(g.custName)}"></label>
        <label>Customer Phone<input type="text" name="custPhone" value="${esc(g.custPhone)}"></label>
        <label>Service Type  <input type="text" name="serviceType" value="${esc(g.serviceType||"")}"></label>
        <label>Situation     <textarea name="situation">${esc(g.situation||"")}</textarea></label>
        <div style="margin-top:8px;">
          <button type="button" class="btn btn-primary btn-sm" onclick="window.guestinfo.saveEdit('${id}')">Save</button>
          <button type="button" class="btn btn-secondary btn-sm" onclick="window.guestinfo.cancelEdit('${id}')">Cancel</button>
        </div>
      </form>
    </div>`;
}