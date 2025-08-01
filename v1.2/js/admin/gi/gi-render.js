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
  // Glassy status badges with subtle coloring
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

export function guestCardHtml(id, g, users, currentUid, currentRole) {
  const submitter = users[g.userUid] || {};
  const [statusCls, statusLbl] = statusBadge(detectStatus(g));

  const bg = "rgba(23, 30, 45, 0.7)";

  const savedPct = typeof g.completionPct === "number"
    ? g.completionPct
    : (g.completion?.pct ?? null);
  const pct = savedPct != null
    ? savedPct
    : computeGuestPitchQuality(normGuest(g)).pct;

  const raw    = esc(g.custPhone || "");
  const num    = digitsOnly(g.custPhone || "");
  const last4  = num.slice(-4).padStart(4, "0");
  const masked = `XXX-${last4}`;

  const when = timeAgo(g.submittedAt);

  const roleCls = currentRole === "me"    ? "role-badge role-me"
                 : currentRole === "lead" ? "role-badge role-lead"
                 : currentRole === "dm"   ? "role-badge role-dm"
                                           : "role-badge role-admin";
  const nameLabel = esc(submitter.name || submitter.email || "-");

  const sold   = detectStatus(g) === "sold";
  const canEdit = ["admin","dm","lead"].includes(currentRole) || g.userUid === currentUid;
  const canSold = canEdit && !sold;
  const actions = [
    `<button class="btn btn-secondary btn-sm" onclick="window.guestinfo.openGuestInfoPage('${id}')">
       ${g.evaluate||g.solution||g.sale ? "Open" : "Continue"}
     </button>`,
    canEdit ? `<button class="btn btn-primary btn-sm" onclick="window.guestinfo.toggleEdit('${id}')">Quick Edit</button>` : "",
    canSold ? `<button class="btn btn-success btn-sm" onclick="window.guestinfo.markSold('${id}')">Mark Sold</button>` : "",
    sold    ? `<button class="btn btn-danger btn-sm" onclick="window.guestinfo.deleteSale('${id}')">Delete Sale</button>` : "",
    canEdit ? `<button class="btn btn-danger btn-sm" onclick="window.guestinfo.deleteGuestInfo('${id}')">Delete Lead</button>` : ""
  ].filter(Boolean).join("");

  return `
    <style>
      /* Responsive bigger customer name */
      #guest-card-${id} .guest-name {
        font-weight: 600;
        font-size: 1.25rem;
        margin: 0.5rem 0;
        text-align: center;
        color: #dbeafe;
        user-select: text;
        cursor: pointer;
        transition: text-decoration 0.3s ease;
      }
      #guest-card-${id} .guest-name:hover {
        text-decoration: underline;
      }
      @media (min-width: 768px) {
        #guest-card-${id} .guest-name {
          font-size: 1.5rem;
        }
      }

      /* Submitter name glowing better */
      #guest-card-${id} .submitter-name {
        padding: 2px 8px;
        border-radius: 999px;
        font-size: 0.9rem;
        background: rgba(23,30,45,0.6);
        color: #a5d6ff;
        box-shadow:
          0 0 6px 2px #55baffaa,
          0 0 12px 4px #55baff66;
        user-select: none;
        white-space: nowrap;
        cursor: default;
      }

      /* Phone number clickable and larger on wider screens */
      #guest-card-${id} .guest-phone {
        cursor: pointer;
        padding: 2px 8px;
        border-radius: 999px;
        font-size: 0.85rem;
        background: rgba(23,30,45,0.6);
        color: #a5b4fc;
        transition: background 0.25s ease, color 0.25s ease;
        user-select: text;
      }
      #guest-card-${id} .guest-phone:hover {
        background: var(--brand);
        color: #f0f9ff;
      }
      @media (min-width: 768px) {
        #guest-card-${id} .guest-phone {
          font-size: 1rem;
        }
      }

      /* Timeframe style */
      #guest-card-${id} .guest-time {
        padding: 2px 8px;
        border-radius: 999px;
        font-size: 0.75rem;
        background: rgba(23,30,45,0.6);
        color: #9ca3af;
        user-select: none;
      }

      /* Card container spacing and padding for mobile */
      #guest-card-${id} {
        margin: 1rem 0.75rem;
        border-radius: var(--radius-md);
        padding: 12px;
        background: ${bg};
        box-sizing: border-box;
        box-shadow: 0 0 15px rgba(30, 144, 255, 0.2);
      }

      @media (max-width: 600px) {
        #guest-card-${id} {
          margin-left: 1rem;
          margin-right: 1rem;
          padding: 1rem 1.2rem;
        }
      }
    </style>

    <div class="guest-card" id="guest-card-${id}">
      <!-- header: status + pitch + toggle -->
      <div style="display:flex;align-items:center;gap:8px;">
        <span class="${statusCls}" style="padding:2px 8px;border-radius:999px;font-size:.85em;">
          ${statusLbl}
        </span>
        <span class="guest-pitch-pill" style="padding:2px 8px;border-radius:999px;font-size:.85em;background:${bg};border:1px solid #fff;">
          ${pct}%
        </span>
        <button class="btn-edit-actions" style="margin-left:auto;background:none;border:none;font-size:1.2rem;cursor:pointer;" onclick="window.guestinfo.toggleActionButtons('${id}')">⋮</button>
      </div>

      <!-- customer name centered with click -->
      <div class="guest-name" onclick="window.guestinfo.openGuestInfoPage('${id}')">${esc(g.custName || "-")}</div>

      <!-- footer: submitted by, phone toggle, time -->
      <div style="display:flex;align-items:center;justify-content:space-between;gap:1rem;">
        <span class="submitter-name" title="Submitted by">${nameLabel}</span>
        <span class="guest-phone" 
              data-raw="${raw}" 
              data-mask="${masked}" 
              onclick="(function(e){navigator.clipboard.writeText('${raw}'); alert('Copied: ${raw}');})(event)">
          ${masked}
        </span>
        <span class="guest-time">${when}</span>
      </div>

      <!-- hidden actions -->
      <div class="guest-card-actions" style="display:none;flex-wrap:wrap;gap:4px;margin-top:8px;">
        ${actions}
      </div>

      <!-- hidden edit form -->
      <form class="guest-edit-form" id="guest-edit-form-${id}" style="display:none;margin-top:8px;">
        <label>Customer Name <input type="text" name="custName" value="${esc(g.custName)}"/></label>
        <label>Customer Phone<input type="text" name="custPhone" value="${esc(g.custPhone)}"/></label>
        <label>Service Type  <input type="text" name="serviceType" value="${esc(g.serviceType||"")}"/></label>
        <label>Situation     <textarea name="situation">${esc(g.situation||"")}</textarea></label>
        <div style="margin-top:8px;">
          <button type="button" class="btn btn-primary btn-sm" onclick="window.guestinfo.saveEdit('${id}')">Save</button>
          <button type="button" class="btn btn-secondary btn-sm" onclick="window.guestinfo.cancelEdit('${id}')">Cancel</button>
        </div>
      </form>
    </div>`;
}    