// guestinfo-container.js

import { groupByStatus, statusSectionHtml } from './gi-render.js';
import {
  toggleEdit,
  cancelEdit,
  saveEdit,
  deleteGuestInfo,
  markSold,
  deleteSale,
  openGuestInfoPage,
  recomputePitch,
  toggleActionButtons
} from './gi-action.js';

// ── Time helpers ────────────────────────────────────────────────────────────
function msNDaysAgo(n) {
  return Date.now() - n * 864e5;
}
function latestActivityTs(g) {
  return Math.max(
    g.updatedAt         || 0,
    g.submittedAt       || 0,
    g.sale?.soldAt      || 0,
    g.solution?.completedAt || 0
  );
}
function inCurrentWeek(g) {
  return latestActivityTs(g) >= msNDaysAgo(7);
}

// ── Role-based filtering ────────────────────────────────────────────────────
function getUsersUnderDM(users, dmUid) {
  const leads = Object.entries(users)
    .filter(([,u]) => u.role === "lead" && u.assignedDM === dmUid)
    .map(([uid]) => uid);
  const mes = Object.entries(users)
    .filter(([,u]) => u.role === "me" && leads.includes(u.assignedLead))
    .map(([uid]) => uid);
  return new Set([...leads, ...mes]);
}

function filterGuestinfo(guestinfo, users, uid, role) {
  if (!guestinfo || !users || !uid || !role) return {};
  if (role === "admin") return guestinfo;
  if (role === "dm") {
    const under = getUsersUnderDM(users, uid);
    under.add(uid);
    return Object.fromEntries(
      Object.entries(guestinfo).filter(([,g]) => under.has(g.userUid))
    );
  }
  if (role === "lead") {
    const mes = Object.entries(users)
      .filter(([,u]) => u.role === "me" && u.assignedLead === uid)
      .map(([uid]) => uid);
    const vis = new Set([...mes, uid]);
    return Object.fromEntries(
      Object.entries(guestinfo).filter(([,g]) => vis.has(g.userUid))
    );
  }
  // role === "me"
  return Object.fromEntries(
    Object.entries(guestinfo).filter(([,g]) => g.userUid === uid)
  );
}

// ── Filter modes ────────────────────────────────────────────────────────────
const FILTER_MODES  = ["week", "all", "progress"];
const FILTER_LABELS = {
  week:     "This Week",
  all:      "Show All",
  progress: "Proposals"
};

export function toggleFilterMode() {
  if (window.currentRole === "me") return;
  const current = window._guestinfo_filterMode || "week";
  const next = FILTER_MODES[(FILTER_MODES.indexOf(current) + 1) % FILTER_MODES.length];
  window._guestinfo_filterMode = next;
  window.renderAdminApp();
}

// ── Controls & empty state ─────────────────────────────────────────────────
function controlsBarHtml(showCreate) {
  const mode = window._guestinfo_filterMode || "week";
  const label = FILTER_LABELS[mode];
  return `
    <div class="guestinfo-controls">
      <button class="btn btn-secondary btn-sm"
              onclick="window.guestinfo.toggleFilterMode()">
        ${label}
      </button>
      ${showCreate
        ? `<button class="btn btn-success btn-sm" onclick="window.guestinfo.createNewLead()">+ New Lead</button>`
        : ""}
    </div>`;
}

function emptyHtml(msg = "No guest leads in this view.") {
  return `
    <div class="guestinfo-empty">
      <p><b>${msg}</b></p>
      <button class="btn btn-success btn-sm" onclick="window.guestinfo.createNewLead()">+ New Lead</button>
    </div>`;
}

// ── Main renderer ───────────────────────────────────────────────────────────
export function renderGuestinfoSection(guestinfo, users, uid, role) {
  // Initialize filter mode
  window._guestinfo_filterMode ||= "week";
  if (role === "me") window._guestinfo_filterMode = "week";
  const mode = window._guestinfo_filterMode;

  // Filter by role
  const visible = filterGuestinfo(guestinfo, users, uid, role);

  // Pick subset based on mode
  let items;
  if (mode === "week") {
    items = Object.fromEntries(
      Object.entries(visible).filter(([,g]) => inCurrentWeek(g))
    );
  } else if (mode === "all") {
    items = visible;
  } else {
    // progress → only show those with a solution (level 3)
    items = Object.fromEntries(
      Object.entries(visible).filter(([,g]) =>
        g.solution?.text?.trim() !== ""
      )
    );
  }

  // Group by status
  const groups = groupByStatus(items);

  // Build inner content
  let contentHtml;
  if (mode === "progress") {
    contentHtml = groups.proposal.length
      ? statusSectionHtml("Proposals", groups.proposal, users, uid, role, true)
      : emptyHtml("No proposals yet.");
  } else {
    const hasNewOrWorking = groups.new.length || groups.working.length;
    contentHtml = !hasNewOrWorking
      ? emptyHtml("You're all caught up!")
      : `
        ${statusSectionHtml("New",     groups.new,     users, uid, role)}
        ${statusSectionHtml("Working", groups.working, users, uid, role)}
      `;
  }

  // Wrap in styled container (.admin-section applies background, rounding, shadow)
  return `
    <section class="admin-section guestinfo-section" id="guestinfo-container">
      ${controlsBarHtml(
        mode !== "progress" || (groups.new.length || groups.working.length)
      )}
      ${contentHtml}
    </section>`;
}

// ── Initialization ────────────────────────────────────────────────────────
export function initGuestinfo() {
  window._guestinfo_filterMode ||= "week";

  window.guestinfo = {
    renderGuestinfoSection,
    toggleFilterMode,
    toggleActionButtons,
    toggleEdit,
    cancelEdit,
    saveEdit,
    deleteGuestInfo,
    markSold,
    deleteSale,
    openGuestInfoPage,
    recomputePitch,
    createNewLead: () => {
      try { localStorage.removeItem("last_guestinfo_key"); } catch {}
      window.location.href = (window.GUESTINFO_PAGE || "../html/guestinfo.html").split("?")[0];
    }
  };
}