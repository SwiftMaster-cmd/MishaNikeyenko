(() => {
  const { esc } = (() => {
    function esc(str) {
      return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }
    return { esc };
  })();

  function ensurePitchCss() {
    if (document.getElementById("guestinfo-pitch-css")) return;
    const css = `
      .guest-pitch-pill {
        display:inline-block;
        padding:2px 10px;
        margin-left:4px;
        font-size:var(--fs-xs,12px);
        font-weight:700;
        line-height:1.2;
        border-radius:999px;
        border:1px solid var(--border-color,rgba(255,255,255,.2));
        white-space:nowrap;
      }
      .guest-pitch-pill.pitch-good {
        background:var(--success-bg,rgba(0,200,83,.15));
        color:var(--success,#00c853);
      }
      .guest-pitch-pill.pitch-warn {
        background:var(--warning-bg,rgba(255,179,0,.15));
        color:var(--warning,#ffb300);
      }
      .guest-pitch-pill.pitch-low {
        background:var(--danger-bg,rgba(255,82,82,.15));
        color:var(--danger,#ff5252);
      }
    `.trim();
    const style = document.createElement("style");
    style.id = "guestinfo-pitch-css";
    style.textContent = css;
    document.head.appendChild(style);
  }
  ensurePitchCss();

  // Status badge
  function statusBadge(status) {
    const s = (status || "new").toLowerCase();
    const map = {
      new: ["role-badge role-guest", "NEW"],
      working: ["role-badge role-lead", "WORKING"],
      proposal: ["role-badge role-dm", "PROPOSAL"],
      sold: ["role-badge role-admin", "SOLD"]
    };
    const [cls, label] = map[s] || map.new;
    return `<span class="${cls}">${label}</span>`;
  }

  // Pitch badge decorator
  function decoratePitch(pct, status, compObj) {
    const p = Math.min(100, Math.max(0, Math.round(pct)));
    const cls = p >= 75 ? "pitch-good" : p >= 40 ? "pitch-warn" : "pitch-low";

    const lines = [`Pitch Quality: ${p}%`];
    if (status) lines.push(`Status: ${status.toUpperCase()}`);
    if (compObj?.steps) {
      const stepLines = Object.entries(compObj.steps).map(([k, s]) => {
        const val = typeof s.effectivePct === "number" ? Math.round(s.effectivePct) : Math.round(s.pctWithin || 0);
        return `${k} ${val}%`;
      });
      if (stepLines.length) lines.push(stepLines.join(" | "));
    }

    return { pct: p, cls, tooltip: lines.join(" • ") };
  }

  // Controls bar HTML
  function controlsBarHtml(filterMode, proposalCount, soldCount, showProposals, soldOnly, currentRole, showCreateBtn = true) {
    const { isMe } = window.guestinfoCore;
    const weekActive = filterMode === "week";
    const allBtn = isMe(currentRole) ? "" : `<button class="btn ${weekActive ? "btn-secondary" : "btn-primary"} btn-sm" style="margin-left:8px;" onclick="window.guestinfo.setFilterMode('all')">All</button>`;

    const proposalBtn = (proposalCount > 0 || showProposals)
      ? `<button class="btn ${showProposals ? "btn-secondary" : (proposalCount ? "btn-warning" : "btn-secondary")} btn-sm" style="margin-left:8px;" onclick="window.guestinfo.toggleShowProposals()">${showProposals ? "Back to Leads" : `⚠ Follow-Ups (${proposalCount})`}</button>`
      : "";

    const soldBtn = !isMe(currentRole)
      ? `<button class="btn btn-secondary btn-sm" style="margin-left:8px;" onclick="window.guestinfo.toggleSoldOnly()">${soldOnly ? "Back to Leads" : `Sales (${soldCount})`}</button>`
      : "";

    const createBtn = showCreateBtn ? `<button class="btn btn-success btn-sm" style="margin-left:auto;" onclick="window.guestinfo.createNewLead()">+ New Lead</button>` : "";

    return `
      <div class="guestinfo-controls review-controls" style="justify-content:flex-start;flex-wrap:wrap;">
        <button class="btn ${weekActive ? "btn-primary" : "btn-secondary"} btn-sm" onclick="window.guestinfo.setFilterMode('week')">This Week</button>
        ${allBtn}
        ${proposalBtn}
        ${soldBtn}
        ${createBtn}
      </div>`;
  }

  // Empty state HTML
  function emptyMotivationHtml(msg = "No guest leads in this view.") {
    return `
      <div class="guestinfo-empty-all text-center" style="margin-top:16px;">
        <p><b>${esc(msg)}</b></p>
        <p style="opacity:.8;">Let's start a conversation and create a new lead.</p>
        <button class="btn btn-success btn-sm" onclick="window.guestinfo.createNewLead()">+ New Lead</button>
      </div>`;
  }

  // Guest card HTML + quick edit + pitch badge
  function guestCardHtml(id, g, users, currentUid, currentRole) {
    const { canDelete, canEditEntry, canMarkSold, detectStatus, normGuest, computeGuestPitchQuality, ROLES } = window.guestinfoCore;

    const submitter = users[g.userUid];
    const allowDelete = canDelete(currentRole);
    const allowEdit = canEditEntry(currentRole, g.userUid, currentUid);
    const allowSold = canMarkSold(currentRole, g.userUid, currentUid);

    const ev = g.evaluate || {};
    const serviceType = g.serviceType ?? ev.serviceType ?? "";
    const situation = g.situation ?? ev.situation ?? "";
    const sitPreview = situation.length > 140 ? situation.slice(0, 137) + "…" : situation;

    const status = detectStatus(g);
    const statBadge = statusBadge(status);

    const savedPct = typeof g.completion?.pct === "number" ? g.completion.pct : null;
    const compObj = savedPct != null ? { pct: savedPct } : computeGuestPitchQuality(normGuest(g));
    const pct = savedPct != null ? savedPct : compObj.pct;
    const pitch = decoratePitch(pct, status, savedPct != null ? null : compObj);

    const pitchHtml = `<span class="guest-pitch-pill ${pitch.cls}" title="${esc(pitch.tooltip)}">${pitch.pct}%</span>`;

    const isSold = status === "sold";
    const units = isSold ? (g.sale?.units ?? "") : "";
    const soldAt = isSold && g.sale?.soldAt ? new Date(g.sale.soldAt).toLocaleString() : "";
    const saleSummary = isSold ? `<div class="guest-sale-summary"><b>Sold:</b> ${soldAt} &bull; Units: ${units}</div>` : "";

    const actions = [
      `<button class="btn btn-secondary btn-sm" onclick="window.guestinfo.openGuestInfoPage('${id}')">${g.evaluate || g.solution || g.sale ? "Open" : "Continue"}</button>`,
      allowEdit ? `<button class="btn btn-primary btn-sm" style="margin-left:8px;" onclick="window.guestinfo.toggleEdit('${id}')">Quick Edit</button>` : "",
      !isSold && allowSold ? `<button class="btn btn-success btn-sm" style="margin-left:8px;" onclick="window.guestinfo.markSold('${id}')">Mark Sold</button>` : "",
      isSold && allowSold ? `<button class="btn btn-danger btn-sm" style="margin-left:8px;" onclick="window.guestinfo.deleteSale('${id}')">Delete Sale</button>` : "",
      allowDelete ? `<button class="btn btn-danger btn-sm" style="margin-left:8px;" onclick="window.guestinfo.deleteGuestInfo('${id}')">Delete Lead</button>` : ""
    ].filter(Boolean).join("");

    return `
      <div class="guest-card" id="guest-card-${id}">
        <div class="guest-display">
          <div><b>Status:</b> ${statBadge}</div>
          <div><b>Pitch:</b> ${pitchHtml}</div>
          <div><b>Submitted by:</b> ${esc(submitter?.name || submitter?.email || g.userUid)}</div>
          <div><b>Customer:</b> ${esc(g.custName) || "-"} &nbsp; | &nbsp; <b>Phone:</b> ${esc(g.custPhone) || "-"}</div>
          ${serviceType ? `<div><b>Type:</b> ${esc(serviceType)}</div>` : ""}
          ${situation ? `<div><b>Situation:</b> ${esc(sitPreview)}</div>` : ""}
          <div><b>When:</b> ${g.submittedAt ? new Date(g.submittedAt).toLocaleString() : "-"}</div>
          ${saleSummary}
          <div class="guest-card-actions" style="margin-top:8px;">${actions}</div>
        </div>

        <form class="guest-edit-form" id="guest-edit-form-${id}" style="display:none;margin-top:8px;">
          <label>Customer Name
            <input type="text" name="custName" value="${esc(g.custName)}" />
          </label>
          <label>Customer Phone
            <input type="text" name="custPhone" value="${esc(g.custPhone)}" />
          </label>
          <label>Service Type
            <input type="text" name="serviceType" value="${esc(serviceType)}" />
          </label>
          <label>Situation
            <textarea name="situation">${esc(situation)}</textarea>
          </label>
          <div style="margin-top:8px;">
            <button type="button" class="btn btn-primary btn-sm" onclick="window.guestinfo.saveEdit('${id}')">Save</button>
            <button type="button" class="btn btn-secondary btn-sm" onclick="window.guestinfo.cancelEdit('${id}')">Cancel</button>
          </div>
        </form>
      </div>
    `;
  }

  // Status subsection HTML
  function statusSectionHtml(title, rows, currentUid, currentRole, statusKey, highlight = false) {
    if (!rows?.length) return `
      <div class="guestinfo-subsection guestinfo-subsection-empty status-${statusKey}">
        <h3>${esc(title)}</h3>
        <div class="guestinfo-empty-msg"><i>None.</i></div>
      </div>`;

    const cardsHtml = rows.map(([id, g]) => guestCardHtml(id, g, window._users || {}, currentUid, currentRole)).join("");

    return `
      <div class="guestinfo-subsection status-${statusKey} ${highlight ? "guestinfo-subsection-highlight" : ""}">
        <h3>${esc(title)}</h3>
        <div class="guestinfo-container">${cardsHtml}</div>
      </div>`;
  }

  window.guestinfoUI = {
    esc,
    statusBadge,
    decoratePitch,
    controlsBarHtml,
    emptyMotivationHtml,
    guestCardHtml,
    statusSectionHtml
  };
})();