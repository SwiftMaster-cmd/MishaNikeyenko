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
  toggleActionButtons,
  togglePhone
} from './gi-action.js';

// ── Time helpers ────────────────────────────────────────────────────────────
function msNDaysAgo(n) {
  return Date.now() - n * 86400000;
}
function latestActivityTs(g) {
  return Math.max(
    g.updatedAt  || 0,
    g.submittedAt|| 0,
    g.sale?.soldAt|| 0,
    g.solution?.completedAt|| 0
  );
}
function inCurrentWeek(g) {
  return latestActivityTs(g) >= msNDaysAgo(7);
}

// ── Role filtering ──────────────────────────────────────────────────────────
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
      Object.entries(guestinfo)
        .filter(([,g]) => under.has(g.userUid))
    );
  }
  if (role === "lead") {
    const mes = Object.entries(users)
      .filter(([,u]) => u.role==="me" && u.assignedLead===uid)
      .map(([uid])=>uid);
    const vis = new Set([...mes, uid]);
    return Object.fromEntries(
      Object.entries(guestinfo)
        .filter(([,g]) => vis.has(g.userUid))
    );
  }
  // me
  return Object.fromEntries(
    Object.entries(guestinfo)
      .filter(([,g]) => g.userUid === uid)
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
  const current = window._guestinfo_filterMode || "week";
  const next = FILTER_MODES[(FILTER_MODES.indexOf(current) + 1) % FILTER_MODES.length];
  window._guestinfo_filterMode = next;
  window.renderAdminApp();
}

// ── Controls & empty state ─────────────────────────────────────────────────
function controlsBarHtml(filterMode, showCreate = true) {
  const label = FILTER_LABELS[filterMode] || FILTER_LABELS.week;
  return `
    <div class="guestinfo-controls" style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
      <button class="btn btn-secondary btn-sm" onclick="window.guestinfo.toggleFilterMode()">
        ${label}
      </button>
      ${showCreate ? `<button class="btn btn-success btn-sm" onclick="window.guestinfo.createNewLead()">+ New Lead</button>` : ""}
    </div>`;
}

function emptyHtml(msg = "No guest leads in this view.") {
  return `
    <div class="guestinfo-empty" style="text-align:center;margin:16px 0;">
      <p><b>${msg}</b></p>
      <button class="btn btn-success btn-sm" onclick="window.guestinfo.createNewLead()">+ New Lead</button>
    </div>`;
}

// ── Main renderer ───────────────────────────────────────────────────────────
export function renderGuestinfoSection(guestinfo, users, uid, role) {
  if (role === "me") window._guestinfo_filterMode = "week";

  const mode    = window._guestinfo_filterMode || "week";
  const visible = filterGuestinfo(guestinfo, users, uid, role);

  let items;
  if (mode === "week") {
    items = Object.fromEntries(
      Object.entries(visible).filter(([,g]) => inCurrentWeek(g))
    );
  } else if (mode === "all") {
    items = visible;
  } else { // progress → proposals only
    items = Object.fromEntries(
      Object.entries(visible)
        .filter(([,g]) => g.solution && g.solution.text && g.solution.text.trim() !== "")
    );
  }

  const groups = groupByStatus(items);

  // PROGRESS mode: only proposals
  if (mode === "progress") {
    return `
      <section class="guestinfo-section">
        ${controlsBarHtml(mode)}
        ${groups.proposal.length
          ? statusSectionHtml("Proposals", groups.proposal, users, uid, role, true)
          : emptyHtml("No proposals yet.")}
      </section>`;
  }

  // WEEK / ALL modes: show New & Working
  const isEmpty = !groups.new.length && !groups.working.length;
  return `
    <section class="guestinfo-section">
      ${controlsBarHtml(mode, !isEmpty)}
      ${isEmpty
        ? emptyHtml("You're all caught up!")
        : `
          ${statusSectionHtml("New",     groups.new,     users, uid, role)}
          ${statusSectionHtml("Working", groups.working, users, uid, role)}
        `}
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
    togglePhone,
    createNewLead: () => {
      try { localStorage.removeItem("last_guestinfo_key"); } catch {}
      window.location.href = (window.GUESTINFO_PAGE || "../html/guestinfo.html").split("?")[0];
    }
  };
}