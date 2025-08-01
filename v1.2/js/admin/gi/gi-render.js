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

// ── Section renderer ───────────────────────────────────────────────────────
export function statusSectionHtml(title, rows, users, currentUid, currentRole, highlight = false) {
  if (!rows?.length) {
    return `<div class="guestinfo-subsection-empty"><i>None.</i></div>`;
  }
  return rows.map(([id, g]) =>
    guestCardHtml(id, g, users, currentUid, currentRole)
  ).join("");
}

export function guestCardHtml(id, g, users, currentUid, currentRole) {
  const submitter = users[g.userUid] || {};
  const [statusCls, statusLbl] = statusBadge(detectStatus(g));

  // Glassy background for card
  const bg = "rgba(23, 30, 45, 0.7)";
  
  // determine pitch %
  const savedPct = typeof g.completionPct === "number"
    ? g.completionPct
    : (g.completion?.pct ?? null);
  const pct = savedPct != null
    ? savedPct
    : computeGuestPitchQuality(normGuest(g)).pct;

  // mask phone
  const raw    = esc(g.custPhone || "");
  const num    = digitsOnly(g.custPhone || "");
  const last4  = num.slice(-4).padStart(4, "0");
  const masked = `XXX-${last4}`;

  // time ago
  const when = timeAgo(g.submittedAt);

  // submitter role badge class
  const roleCls = currentRole === "me"    ? "role-badge role-me"
                 : currentRole === "lead" ? "role-badge role-lead"
                 : currentRole === "dm"   ? "role-badge role-dm"
                                           : "role-badge role-admin";
  const nameLabel = esc(submitter.name || submitter.email || "-");

  // actions permissions
  const sold   = detectStatus(g) === "sold";
  const canEdit = ["admin","dm","lead"].includes(currentRole) || g.userUid === currentUid;
  const canSold = canEdit && !sold;
  const actions = [
    `<button class="btn" onclick="window.guestinfo.openGuestInfoPage('${id}')">${g.evaluate||g.solution||g.sale ? "Open" : "Continue"}</button>`,
    canEdit ? `<button class="btn" onclick="window.guestinfo.toggleEdit('${id}')">Quick Edit</button>` : "",
    canSold ? `<button class="btn" onclick="window.guestinfo.markSold('${id}')">Mark Sold</button>` : "",
    sold    ? `<button class="btn btn-danger" onclick="window.guestinfo.deleteSale('${id}')">Delete Sale</button>` : "",
    canEdit ? `<button class="btn btn-danger" onclick="window.guestinfo.deleteGuestInfo('${id}')">Delete Lead</button>` : ""
  ].filter(Boolean).join("");

  return `
    <style>
      /* Container grid handled outside, card styling here */
      #guest-card-${id} {
        background: ${bg};
        border-radius: var(--radius-md);
        padding: 12px;
        box-shadow: 0 0 15px rgba(30, 144, 255, 0.2);
        display: flex;
        flex-direction: column;
        user-select: none;
        box-sizing: border-box;
        cursor: default;
        transition: box-shadow 0.25s ease;
      }
      #guest-card-${id}:hover {
        box-shadow: 0 0 25px rgba(30, 144, 255, 0.5);
      }

      /* Guest name clickable */
      #guest-card-${id} .guest-name {
        font-weight: 600;
        font-size: 1.25rem;
        margin: 0.5rem 0;
        text-align: center;
        color: #dbeafe;
        cursor: pointer;
        transition: text-decoration 0.3s ease;
        user-select: text;
      }
      #guest-card-${id} .guest-name:hover {
        text-decoration: underline;
      }

      /* Submitter bubble */
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
        text-align: center;
        margin-bottom: 0.5rem;
      }

      /* Phone number */
      #guest-card-${id} .guest-phone {
        cursor: pointer;
        padding: 2px 8px;
        border-radius: 999px;
        font-size: 0.85rem;
        background: rgba(23,30,45,0.6);
        color: #a5b4fc;
        transition: background 0.25s ease, color 0.25s ease;
        user-select: text;
        text-align: center;
      }
      #guest-card-${id} .guest-phone:hover {
        background: var(--brand);
        color: #f0f9ff;
      }

      /* Time */
      #guest-card-${id} .guest-time {
        padding: 2px 8px;
        border-radius: 999px;
        font-size: 0.75rem;
        background: rgba(23,30,45,0.6);
        color: #9ca3af;
        user-select: none;
        text-align: center;
        margin-top: 0.5rem;
      }

      /* Actions container */
      #guest-card-${id} .guest-card-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 12px;
        justify-content: center;
      }

      /* Buttons */
      #guest-card-${id} .btn {
        font-weight: 700;
        border-radius: var(--radius-md);
        padding: 0.48em 1.3em;
        font-size: 1rem;
        background: linear-gradient(90deg, #17b2ff2a, #007bffa2 95%);
        color: #f9fdff;
        box-shadow:
          inset 0 1px 1px rgba(255 255 255 / 0.3),
          0 3px 10px rgba(0 123 255 / 0.5);
        border: none;
        cursor: pointer;
        transition: background 0.3s ease, box-shadow 0.3s ease, transform 0.15s ease;
        backdrop-filter: saturate(180%) blur(6px);
        white-space: nowrap;
      }
      #guest-card-${id} .btn:hover,
      #guest-card-${id} .btn:focus {
        background: linear-gradient(90deg, #3fcbff2a, #0f43c8b0 95%);
        box-shadow:
          inset 0 2px 3px rgba(255 255 255 / 0.5),
          0 6px 18px rgba(30 144 255 / 0.8);
        transform: scale(1.05);
        outline: none;
      }
    </style>

    <div id="guest-card-${id}" class="guest-card" role="button" tabindex="0" 
      aria-label="Open lead for ${esc(g.custName || 'Unknown')}">

      <div class="guest-name" onclick="window.guestinfo.openGuestInfoPage('${id}')"
           onkeydown="if(event.key==='Enter' || event.key===' ') { window.guestinfo.openGuestInfoPage('${id}'); event.preventDefault(); }"
           role="link" tabindex="0" style="outline:none;">
        ${esc(g.custName || "-")}
      </div>

      <div class="submitter-name" title="Submitted by">
        ${nameLabel}
      </div>

      <div class="guest-phone" 
           data-raw="${raw}" 
           data-mask="${masked}" 
           onclick="navigator.clipboard.writeText('${raw}'); alert('Copied: ${raw}');"
           role="button" tabindex="0" aria-label="Copy phone number ${raw}">
        ${masked}
      </div>

      <div class="guest-time">
        ${when}
      </div>

      <div class="guest-card-actions">
        ${actions}
      </div>
    </div>
  `;
}