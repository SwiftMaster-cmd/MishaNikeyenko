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

// ── Main render function ────────────────────────────────────────────────
export function renderGuestCards(guestMap, users, currentUid, currentRole) {
  const containerStyle = `
    display: grid;
    grid-template-columns: repeat(1, 1fr);
    gap: 1rem;
    padding: 1rem 1.5rem;
    box-sizing: border-box;
  `;

  // Responsive CSS added inline
  const styleId = "guest-cards-responsive-style";
  if (!document.getElementById(styleId)) {
    const styleEl = document.createElement("style");
    styleEl.id = styleId;
    styleEl.textContent = `
      @media (min-width: 600px) {
        #guestCardsContainer {
          grid-template-columns: repeat(2, 1fr);
        }
      }
      @media (min-width: 1024px) {
        #guestCardsContainer {
          grid-template-columns: repeat(3, 1fr);
        }
      }
    `;
    document.head.appendChild(styleEl);
  }

  // Render all cards as grid items
  const cardsHtml = Object.entries(guestMap).map(([id, g]) => guestCardHtml(id, g, users, currentUid, currentRole)).join("");

  return `
    <div id="guestCardsContainer" style="${containerStyle}" role="list">
      ${cardsHtml}
    </div>
  `;
}

export function guestCardHtml(id, g, users, currentUid, currentRole) {
  const submitter = users[g.userUid] || {};
  const [statusCls, statusLbl] = statusBadge(detectStatus(g));
  const bg = "rgba(23, 30, 45, 0.7)";

  // Pitch %
  const savedPct = typeof g.completionPct === "number"
    ? g.completionPct
    : (g.completion?.pct ?? null);
  const pct = savedPct != null
    ? savedPct
    : computeGuestPitchQuality(normGuest(g)).pct;

  // Mask phone
  const raw    = esc(g.custPhone || "");
  const num    = digitsOnly(g.custPhone || "");
  const last4  = num.slice(-4).padStart(4, "0");
  const masked = `XXX-${last4}`;

  // Time ago
  const when = timeAgo(g.submittedAt);

  // Submitter role class
  const roleCls = currentRole === "me"    ? "role-badge role-me"
                 : currentRole === "lead" ? "role-badge role-lead"
                 : currentRole === "dm"   ? "role-badge role-dm"
                                           : "role-badge role-admin";

  const nameLabel = esc(submitter.name || submitter.email || "-");

  // Permissions & actions hidden behind menu
  const sold   = detectStatus(g) === "sold";
  const canEdit = ["admin","dm","lead"].includes(currentRole) || g.userUid === currentUid;
  const canSold = canEdit && !sold;

  const actions = [
    `<button class="btn" onclick="window.guestinfo.openGuestInfoPage('${id}')">Open</button>`,
    canEdit ? `<button class="btn" onclick="window.guestinfo.toggleEdit('${id}')">Quick Edit</button>` : "",
    canSold ? `<button class="btn" onclick="window.guestinfo.markSold('${id}')">Mark Sold</button>` : "",
    sold    ? `<button class="btn btn-danger" onclick="window.guestinfo.deleteSale('${id}')">Delete Sale</button>` : "",
    canEdit ? `<button class="btn btn-danger" onclick="window.guestinfo.deleteGuestInfo('${id}')">Delete Lead</button>` : ""
  ].filter(Boolean).join("");

  return `
    <style>
      #guest-card-${id} {
        background: ${bg};
        border-radius: var(--radius-md);
        padding: 1rem 1.2rem;
        box-shadow: 0 0 15px rgba(30, 144, 255, 0.2);
        display: flex;
        flex-direction: column;
        user-select: none;
        box-sizing: border-box;
        cursor: default;
        position: relative;
      }
      #guest-card-${id}:hover {
        box-shadow: 0 0 25px rgba(30, 144, 255, 0.5);
      }
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
      #guest-card-${id} .btn-menu {
        position: absolute;
        top: 12px;
        right: 12px;
        background: transparent;
        border: none;
        color: #55baff;
        font-size: 1.6rem;
        cursor: pointer;
        user-select: none;
        padding: 4px;
        line-height: 1;
        border-radius: 999px;
        transition: background 0.3s ease;
      }
      #guest-card-${id} .btn-menu:hover {
        background: rgba(30,144,255,0.2);
      }
      #guest-card-${id} .guest-card-actions {
        display: none;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 40px;
        justify-content: center;
      }
      #guest-card-${id} .guest-card-actions.active {
        display: flex;
      }
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

    <div id="guest-card-${id}" class="guest-card" role="listitem" tabindex="0" aria-label="Open lead for ${esc(g.custName || "Unknown")}">

      <button class="btn-menu" aria-label="Toggle actions menu" onclick="window.guestinfo.toggleActionButtons('${id}')">⋮</button>

      <div class="guest-name" 
           onclick="window.guestinfo.openGuestInfoPage('${id}')"
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

// Toggle the visibility of the actions menu per card
export function toggleActionButtons(id) {
  const card = document.getElementById(`guest-card-${id}`);
  if (!card) return;
  const actions = card.querySelector(".guest-card-actions");
  if (!actions) return;
  actions.classList.toggle("active");
}