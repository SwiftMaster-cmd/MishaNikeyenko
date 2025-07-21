// guestinfo-container.js

import {
  groupByStatus,
  statusSectionHtml
} from './gi-render.js';

import {
  toggleEdit, cancelEdit, saveEdit, deleteGuestInfo,
  markSold, deleteSale, openGuestInfoPage,
  recomputePitch
} from './gi-action.js';

// ── Time & filter helpers ─────────────────────────────────────────────────
function msNDaysAgo(n){ return Date.now() - n*864e5; }
function latestActivityTs(g){
  return Math.max(
    g.updatedAt||0,
    g.submittedAt||0,
    g.sale?.soldAt||0,
    g.solution?.completedAt||0
  );
}
function inCurrentWeek(g){ return latestActivityTs(g) >= msNDaysAgo(7); }

function getUsersUnderDM(users, dmUid){
  const leads = Object.entries(users)
    .filter(([,u])=>u.role==="lead" && u.assignedDM===dmUid)
    .map(([uid])=>uid);
  const mes = Object.entries(users)
    .filter(([,u])=>u.role==="me" && leads.includes(u.assignedLead))
    .map(([uid])=>uid);
  return new Set([...leads, ...mes]);
}

function filterGuestinfo(guestinfo, users, uid, role){
  if (!guestinfo||!users||!uid||!role) return {};
  if (role==="admin") return guestinfo;
  if (role==="dm"){
    const under = getUsersUnderDM(users, uid);
    under.add(uid);
    return Object.fromEntries(Object.entries(guestinfo)
      .filter(([,g])=>under.has(g.userUid))
    );
  }
  if (role==="lead"){
    const mes = Object.entries(users)
      .filter(([,u])=>u.role==="me" && u.assignedLead===uid)
      .map(([u])=>u);
    const vis = new Set([...mes, uid]);
    return Object.fromEntries(Object.entries(guestinfo)
      .filter(([,g])=>vis.has(g.userUid))
    );
  }
  if (role==="me"){
    return Object.fromEntries(Object.entries(guestinfo)
      .filter(([,g])=>g.userUid===uid)
    );
  }
  return {};
}

// ── Controls & empty state ─────────────────────────────────────────────────
function controlsBarHtml(filterMode, proposalCount, soldCount, showProposals, soldOnly, role, showCreate=true){
  const weekActive = filterMode==="week";
  const allBtn = role==="me" ? "" : `<button class="btn ${weekActive?"btn-secondary":"btn-primary"} btn-sm" onclick="window.guestinfo.setFilterMode('all')">All</button>`;
  const propBtn = (proposalCount>0||showProposals)
    ? `<button class="btn ${showProposals?"btn-secondary":(proposalCount?"btn-warning":"btn-secondary")} btn-sm" onclick="window.guestinfo.toggleShowProposals()">${showProposals?"Back":"⚠ Follow-Ups ("+proposalCount+")"}</button>`
    : "";
  const soldBtn = role==="me" ? "" : `<button class="btn btn-secondary btn-sm" onclick="window.guestinfo.toggleSoldOnly()">${soldOnly?"Back":"Sales ("+soldCount+")"}</button>`;
  const create = showCreate ? `<button class="btn btn-success btn-sm" onclick="window.guestinfo.createNewLead()">+ New Lead</button>` : "";
  return `
    <div class="guestinfo-controls" style="display:flex;gap:8px;">
      <button class="btn ${weekActive?"btn-primary":"btn-secondary"} btn-sm" onclick="window.guestinfo.setFilterMode('week')">This Week</button>
      ${allBtn}${propBtn}${soldBtn}${create}
    </div>`;
}

function emptyHtml(msg="No guest leads in this view.") {
  return `
    <div class="guestinfo-empty" style="text-align:center;margin-top:16px;">
      <p><b>${msg}</b></p>
      <button class="btn btn-success btn-sm" onclick="window.guestinfo.createNewLead()">+ New Lead</button>
    </div>`;
}

// ── Main renderer ─────────────────────────────────────────────────────────
export function renderGuestinfoSection(guestinfo, users, uid, role) {
  if (role==="me") window._guestinfo_filterMode = "week";

  const visible = filterGuestinfo(guestinfo, users, uid, role);
  const items = window._guestinfo_filterMode==="week" || role==="me"
    ? Object.fromEntries(Object.entries(visible).filter(([,g])=>inCurrentWeek(g)))
    : visible;

  const groups = groupByStatus(items);
  const propCount = groups.proposal.length;
  const soldCount = groups.sold.length;
  const showProps = window._guestinfo_showProposals;
  const soldOnly  = window._guestinfo_soldOnly;

  // sales view
  if (soldOnly && role!=="me") {
    return `
      <section class="guestinfo-section">
        <h2>Guest Info</h2>
        ${controlsBarHtml(window._guestinfo_filterMode, propCount, soldCount, showProps, soldOnly, role)}
        ${statusSectionHtml("Sales", groups.sold, users, uid, role)}
        ${groups.sold.length ? "" : emptyHtml("No sales in this view.")}
      </section>`;
  }

  // proposals view
  if (showProps) {
    return `
      <section class="guestinfo-section">
        <h2>Guest Info</h2>
        ${controlsBarHtml(window._guestinfo_filterMode, propCount, soldCount, showProps, soldOnly, role)}
        ${statusSectionHtml("Follow-Ups", groups.proposal, users, uid, role, true)}
        ${groups.proposal.length ? "" : emptyHtml("No follow-ups in this view.")}
      </section>`;
  }

  // default view
  const isEmpty = !groups.new.length && !groups.working.length && !groups.proposal.length;
  return `
    <section class="guestinfo-section">
      <h2>Guest Info</h2>
      ${controlsBarHtml(window._guestinfo_filterMode, propCount, soldCount, showProps, soldOnly, role, !isEmpty)}
      ${isEmpty ? emptyHtml("You're all caught up!") : ""}
      ${!isEmpty ? statusSectionHtml("New",     groups.new,     users, uid, role) : ""}
      ${!isEmpty ? statusSectionHtml("Working", groups.working, users, uid, role) : ""}
      ${!isEmpty && groups.proposal.length
         ? `<div style="margin-top:8px;color:#a00;">⚠ ${groups.proposal.length} follow-up(s). Tap "Follow-Ups" above.</div>`
         : ""}
    </section>`;
}

// ── Filter controls ────────────────────────────────────────────────────────
export function setFilterMode(mode) {
  window._guestinfo_filterMode = window.currentRole==="me" ? "week" : (mode==="all"?"all":"week");
  window.renderAdminApp();
}

export function toggleShowProposals() {
  if (!window._guestinfo_showProposals) window._guestinfo_soldOnly = false;
  window._guestinfo_showProposals = !window._guestinfo_showProposals;
  window.renderAdminApp();
}

export function toggleSoldOnly() {
  if (!window._guestinfo_soldOnly) window._guestinfo_showProposals = false;
  window._guestinfo_soldOnly = !window._guestinfo_soldOnly;
  window.renderAdminApp();
}

export function createNewLead() {
  try { localStorage.removeItem("last_guestinfo_key"); } catch(_) {}
  window.location.href = (window.GUESTINFO_PAGE||"../html/guestinfo.html").split("?")[0];
}

// ── Pitch CSS injector ─────────────────────────────────────────────────────
export function ensurePitchCss() {
  if (document.getElementById("guestinfo-pitch-css")) return;
  const css = `
    .guest-pitch-pill { display:inline-block;padding:2px 10px;margin-left:4px;font-size:12px;font-weight:700;line-height:1.2;border-radius:999px;border:1px solid rgba(0,0,0,.2); }
    .guest-pitch-pill.pitch-good { background:rgba(0,200,83,.15); color:#00c853; }
    .guest-pitch-pill.pitch-warn { background:rgba(255,179,0,.15); color:#ffb300; }
    .guest-pitch-pill.pitch-low  { background:rgba(255, 82,82,.15); color:#ff5252; }
  `.trim();
  const style = document.createElement("style");
  style.id = "guestinfo-pitch-css";
  style.textContent = css;
  document.head.appendChild(style);
}

// ── Initialization ────────────────────────────────────────────────────────
export function initGuestinfo() {
  ensurePitchCss();
  window.guestinfo = {
    renderGuestinfoSection,
    toggleEdit, cancelEdit, saveEdit, deleteGuestInfo,
    markSold, deleteSale, openGuestInfoPage,
    setFilterMode, toggleShowProposals, toggleSoldOnly, createNewLead,
    recomputePitch
  };
}