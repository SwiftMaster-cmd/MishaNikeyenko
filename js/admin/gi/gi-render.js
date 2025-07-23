// guestinfo-render.js

// ── Constants ───────────────────────────────────────────────────────────────
export const PITCH_WEIGHTS = {
  custName: 8, custPhone: 7,
  currentCarrier: 12, numLines: 8, coverageZip: 8,
  deviceStatus: 8, finPath: 12,
  billPain: 4, dataNeed: 4, hotspotNeed: 2, intlNeed: 2,
  solutionText: 25
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
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(diff / 3600000);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(diff / 86400000);
  return `${days}d`;
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
  let earned = 0, max = 0;
  for (const [k, wt] of Object.entries(weights)) {
    max += wt;
    if (hasVal(getField(g, k))) earned += wt;
  }
  return { pct: max ? Math.round(earned/max*100) : 0 };
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

  // determine pitch %
  const savedPct = typeof g.completionPct === "number"
    ? g.completionPct
    : (g.completion?.pct ?? null);
  const pct = savedPct != null
    ? savedPct
    : computeGuestPitchQuality(normGuest(g)).pct;

  // choose a dark muted background tinted by quality
  let bg;
  if (pct >= 75)      bg = "rgba(0, 80, 0, 0.4)";
  else if (pct >= 40) bg = "rgba(80, 80, 0, 0.4)";
  else                bg = "rgba(80, 0, 0, 0.4)";

  // mask phone
  const raw    = esc(g.custPhone || "");
  const num    = digitsOnly(g.custPhone || "");
  const last4  = num.slice(-4).padStart(4, "0");
  const masked = `XXX-${last4}`;

  // time ago
  const when = timeAgo(g.submittedAt);

  // submitted by bubble
  const roleCls = currentRole === "me"    ? "role-badge role-me"
                 : currentRole === "lead" ? "role-badge role-lead"
                 : currentRole === "dm"   ? "role-badge role-dm"
                                           : "role-badge role-admin";
  const nameLabel = esc(submitter.name || submitter.email || "-");

  // Only outer card click, no ... or actions
  // The card action is determined by window._guestCardMode
  // Attach onClick to the outer container

  return `
    <div class="guest-card" id="guest-card-${id}"
         style="background:${bg};border-radius:8px;padding:12px;position:relative;cursor:pointer;"
         onclick="window.handleGuestCardClick && window.handleGuestCardClick('${id}')">
      <!-- header: status + pitch -->
      <div style="display:flex;align-items:center;gap:8px;">
        <span class="${statusCls}"
              style="padding:2px 8px;border-radius:999px;font-size:.85em;">
          ${statusLbl}
        </span>
        <span class="guest-pitch-pill"
              style="padding:2px 8px;border-radius:999px;font-size:.85em;background:${bg};border:1px solid #fff;">
          ${pct}%
        </span>
      </div>

      <!-- customer name centered -->
      <div style="text-align:center;font-weight:600;font-size:1.1em;margin:8px 0;">
        ${esc(g.custName || "-")}
      </div>

      <!-- footer: submitted by, phone (masked), time -->
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <span class="${roleCls}"
              style="padding:2px 6px;border-radius:999px;font-size:.85em;background:${bg};">
          ${nameLabel}
        </span>
        <span class="guest-phone"
              data-raw="${raw}"
              data-mask="${masked}"
              style="padding:2px 6px;border-radius:999px;font-size:.85em;cursor:pointer;background:${bg};"
              onclick="event.stopPropagation();window.guestinfo.togglePhone && window.guestinfo.togglePhone('${id}')">
          ${masked}
        </span>
        <span class="guest-time"
              style="padding:2px 6px;border-radius:999px;font-size:.75em;background:${bg};">
          ${when}
        </span>
      </div>
    </div>`;
}

// ── Global card click handler (attach in your main JS/init) ────────────────
if (typeof window !== "undefined") {
  window._guestCardMode = "open"; // options: "open", "edit", "delete", "markSold"
  window.handleGuestCardClick = function(id) {
    switch (window._guestCardMode) {
      case "edit":
        window.guestinfo && window.guestinfo.toggleEdit && window.guestinfo.toggleEdit(id); break;
      case "delete":
        window.guestinfo && window.guestinfo.deleteGuestInfo && window.guestinfo.deleteGuestInfo(id); break; // no confirm
      case "markSold":
        window.guestinfo && window.guestinfo.markSold && window.guestinfo.markSold(id); break;
      default:
        window.guestinfo && window.guestinfo.openGuestInfoPage && window.guestinfo.openGuestInfoPage(id); break;
    }
  }
}