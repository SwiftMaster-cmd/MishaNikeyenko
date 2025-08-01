(() => {
  const ROLES = { ME: "me", LEAD: "lead", DM: "dm", ADMIN: "admin" };
  const GUESTINFO_PAGE = window.GUESTINFO_PAGE || "../html/guestinfo.html";

  // Persistent UI state
  window._guestinfo_filterMode ??= "week";
  window._guestinfo_showProposals ??= false;
  window._guestinfo_soldOnly ??= false;

  // Pitch weights & field step mapping
  const PITCH_WEIGHTS = {
    custName: 8, custPhone: 7,
    currentCarrier: 12, numLines: 8, coverageZip: 8,
    deviceStatus: 8, finPath: 12,
    billPain: 4, dataNeed: 4, hotspotNeed: 2, intlNeed: 2,
    solutionText: 25
  };
  const FIELD_STEP = {
    custName: "step1", custPhone: "step1",
    currentCarrier: "step2", numLines: "step2", coverageZip: "step2",
    deviceStatus: "step2", finPath: "step2",
    billPain: "step2", dataNeed: "step2", hotspotNeed: "step2", intlNeed: "step2",
    solutionText: "step3"
  };

  // Utilities
  const hasVal = v => {
    if (v == null) return false;
    if (typeof v === "string") return v.trim() !== "";
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return true;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "object") return Object.keys(v).length > 0;
    return false;
  };
  const digitsOnly = s => (s || "").replace(/\D+/g, "");
  const nowMs = () => Date.now();
  const msNDaysAgo = n => nowMs() - n * 864e5;
  const esc = str => String(str || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  // Detect guest status based on fields and data
  function detectStatus(g) {
    const s = (g?.status || "").toLowerCase();
    if (s) return s;
    if (g?.solution?.text && hasVal(g.solution.text)) return "proposal";
    if (["currentCarrier","numLines","coverageZip","deviceStatus","finPath","billPain","dataNeed","hotspotNeed","intlNeed"].some(k => hasVal(g.evaluate?.[k]))) return "working";
    return "new";
  }

  // Normalize guest for pitch quality and UI logic
  function normGuest(src = {}) {
    const custName = src.custName ?? src.guestName ?? "";
    const custPhone = src.custPhone ?? src.guestPhone ?? "";
    const evaluate = { ...src.evaluate };
    ["currentCarrier","numLines","coverageZip","deviceStatus","finPath"].forEach(k => {
      if (evaluate[k] == null && src[k] != null) evaluate[k] = src[k];
    });
    const solution = { ...src.solution };
    if (solution.text == null && src.solutionText != null) solution.text = src.solutionText;

    return {
      ...src,
      custName,
      custPhone,
      custPhoneDigits: digitsOnly(custPhone),
      evaluate,
      solution,
      prefilledStep1: src.prefilledStep1 || hasVal(custName) || hasVal(custPhone),
      status: detectStatus(src)
    };
  }

  // Get field value from guest object (evaluate or solution)
  function getField(g, k) {
    if (!g) return undefined;
    if (k === "custName" || k === "custPhone") return g[k];
    if (k === "solutionText") return g.solution?.text;
    return g.evaluate?.[k];
  }

  // Compute pitch quality as percentage with step breakdown
  function computeGuestPitchQuality(g, weights = PITCH_WEIGHTS) {
    const steps = { step1: { earned: 0, max: 0 }, step2: { earned: 0, max: 0 }, step3: { earned: 0, max: 0 } };
    let earned = 0, max = 0;

    for (const [k, wt] of Object.entries(weights)) {
      const step = FIELD_STEP[k] || "step1";
      steps[step].max += wt;
      max += wt;
      if (hasVal(getField(g, k))) {
        steps[step].earned += wt;
        earned += wt;
      }
    }
    return {
      pct: max ? Math.round((earned / max) * 100) : 0,
      steps,
      fields: weights // you can add detailed fields if needed
    };
  }

  // Role helpers
  const isAdmin = r => r === ROLES.ADMIN;
  const isDM = r => r === ROLES.DM;
  const isLead = r => r === ROLES.LEAD;
  const isMe = r => r === ROLES.ME;

  const canDelete = r => isAdmin(r) || isDM(r) || isLead(r);
  const canEditEntry = (r, ownerUid, currentUid) =>
    r && (isAdmin(r) || isDM(r) || isLead(r) || ownerUid === currentUid);
  const canMarkSold = canEditEntry;

  // Get UIDs under a DM (leads + MEs)
  function getUsersUnderDM(users = {}, dmUid) {
    const leads = Object.entries(users).filter(([, u]) => u.role === ROLES.LEAD && u.assignedDM === dmUid).map(([uid]) => uid);
    const mes = Object.entries(users).filter(([, u]) => u.role === ROLES.ME && leads.includes(u.assignedLead)).map(([uid]) => uid);
    return new Set([...leads, ...mes]);
  }

  // Filter guestinfo entries based on role and ownership
  function filterGuestinfo(guestinfo, users, currentUid, currentRole) {
    if (!guestinfo || !users || !currentUid || !currentRole) return {};
    if (isAdmin(currentRole)) return guestinfo;

    if (isDM(currentRole)) {
      const under = getUsersUnderDM(users, currentUid);
      under.add(currentUid);
      return Object.fromEntries(Object.entries(guestinfo).filter(([, g]) => under.has(g.userUid)));
    }

    if (isLead(currentRole)) {
      const mesUnderLead = Object.entries(users)
        .filter(([, u]) => u.role === ROLES.ME && u.assignedLead === currentUid)
        .map(([uid]) => uid);
      const visible = new Set([...mesUnderLead, currentUid]);
      return Object.fromEntries(Object.entries(guestinfo).filter(([, g]) => visible.has(g.userUid)));
    }

    if (isMe(currentRole)) {
      return Object.fromEntries(Object.entries(guestinfo).filter(([, g]) => g.userUid === currentUid));
    }

    return {};
  }

  // Group guestinfo entries by status
  function groupByStatus(guestMap) {
    const groups = { new: [], working: [], proposal: [], sold: [] };
    for (const [id, g] of Object.entries(guestMap)) {
      const st = detectStatus(g);
      if (!groups[st]) groups[st] = [];
      groups[st].push([id, g]);
    }
    Object.values(groups).forEach(arr => arr.sort((a, b) => Math.max(b[1].updatedAt || 0, b[1].submittedAt || 0) - Math.max(a[1].updatedAt || 0, a[1].submittedAt || 0)));
    return groups;
  }

  // Status badge component
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

  // Controls bar html
  function controlsBarHtml(filterMode, proposalCount, soldCount, showProposals, soldOnly, currentRole, showCreateBtn = true) {
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
  const emptyMotivationHtml = (msg = "No guest leads in this view.") => `
    <div class="guestinfo-empty-all text-center" style="margin-top:16px;">
      <p><b>${esc(msg)}</b></p>
      <p style="opacity:.8;">Let's start a conversation and create a new lead.</p>
      <button class="btn btn-success btn-sm" onclick="window.guestinfo.createNewLead()">+ New Lead</button>
    </div>`;

  // Main render function
  function renderGuestinfoSection(guestinfo, users, currentUid, currentRole) {
    if (isMe(currentRole)) window._guestinfo_filterMode = "week";

    const visible = filterGuestinfo(guestinfo, users, currentUid, currentRole);
    const filterWeek = isMe(currentRole) || window._guestinfo_filterMode === "week";

    const filtered = filterWeek
      ? Object.fromEntries(Object.entries(visible).filter(([, g]) => inCurrentWeek(g)))
      : visible;

    const groups = groupByStatus(filtered);
    const proposalCount = groups.proposal.length;
    const soldCount = groups.sold.length;
    const showProposals = window._guestinfo_showProposals;
    const soldOnly = window._guestinfo_soldOnly;

    if (soldOnly && !isMe(currentRole)) {
      return `
      <section class="admin-section guestinfo-section" id="guestinfo-section">
        <h2>Guest Info</h2>
        ${controlsBarHtml(window._guestinfo_filterMode, proposalCount, soldCount, showProposals, soldOnly, currentRole)}
        ${statusSectionHtml("Sales", groups.sold, currentUid, currentRole, "sold")}
        ${groups.sold.length ? "" : emptyMotivationHtml("No sales in this view.")}
      </section>`;
    }

    if (showProposals) {
      return `
      <section class="admin-section guestinfo-section" id="guestinfo-section">
        <h2>Guest Info</h2>
        ${controlsBarHtml(window._guestinfo_filterMode, proposalCount, soldCount, showProposals, soldOnly, currentRole)}
        ${statusSectionHtml("Follow-Ups (Proposals)", groups.proposal, currentUid, currentRole, "proposal", true)}
        ${groups.proposal.length ? "" : emptyMotivationHtml("No follow-ups in this view.")}
      </section>`;
    }

    const showEmpty = !groups.new.length && !groups.working.length && !groups.proposal.length;

    return `
      <section class="admin-section guestinfo-section" id="guestinfo-section">
        <h2>Guest Info</h2>
        ${controlsBarHtml(window._guestinfo_filterMode, proposalCount, soldCount, showProposals, soldOnly, currentRole, !showEmpty)}
        ${showEmpty ? emptyMotivationHtml("You're all caught up!") : ""}
        ${showEmpty ? "" : statusSectionHtml("New", groups.new, currentUid, currentRole, "new")}
        ${showEmpty ? "" : statusSectionHtml("Working", groups.working, currentUid, currentRole, "working")}
        ${(!showEmpty && groups.proposal.length) ? `<div class="guestinfo-proposal-alert" style="margin-top:8px;">
          <span>⚠ ${groups.proposal.length} follow-up lead${groups.proposal.length === 1 ? "" : "s"} awaiting action.</span>
          <span style="opacity:.7;font-size:.85em;margin-left:8px;">Tap "Follow-Ups" above to view.</span>
        </div>` : ""}
      </section>`;
  }

  // Status subsection
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

  // Guest card HTML + quick edit + pitch badge
  function guestCardHtml(id, g, users, currentUid, currentRole) {
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
    const compObj = savedPct != null ? null : computeGuestPitchQuality(normGuest(g));
    const pct = savedPct != null ? savedPct : compObj.pct;
    const pitch = decoratePitch(pct, status, compObj);

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
      <div