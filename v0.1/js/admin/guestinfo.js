(() => {
  const ROLES = { ME: "me", LEAD: "lead", DM: "dm", ADMIN: "admin" };
  const GUESTINFO_PAGE = window.GUESTINFO_PAGE || "../html/guestinfo.html";

  // UI state persisted on window
  window._guestinfo_filterMode ??= "week";
  window._guestinfo_showProposals ??= false;
  window._guestinfo_soldOnly ??= false;

  // --- Core pitch & status logic from gp-core-lite.js ---
  const PITCH_WEIGHTS = {
    custName:8, custPhone:7,
    currentCarrier:12, numLines:8, coverageZip:8,
    deviceStatus:8, finPath:12,
    billPain:4, dataNeed:4, hotspotNeed:2, intlNeed:2,
    solutionText:25
  };

  const FIELD_STEP = {
    custName:"step1", custPhone:"step1",
    currentCarrier:"step2", numLines:"step2", coverageZip:"step2",
    deviceStatus:"step2", finPath:"step2",
    billPain:"step2", dataNeed:"step2", hotspotNeed:"step2", intlNeed:"step2",
    solutionText:"step3"
  };

  function hasVal(v){
    if (v == null) return false;
    if (typeof v === "string")  return v.trim() !== "";
    if (typeof v === "number")  return true;
    if (typeof v === "boolean") return v;
    if (Array.isArray(v))       return v.length>0;
    if (typeof v === "object")  return Object.keys(v).length>0;
    return false;
  }

  function digitsOnly(s){
    return (s||"").replace(/\D+/g,"");
  }

  function hasAnyEvalData(e){
    if(!e) return false;
    return ["currentCarrier","numLines","coverageZip","deviceStatus","finPath",
            "billPain","dataNeed","hotspotNeed","intlNeed"].some(k=>hasVal(e[k]));
  }

  function detectStatus(g){
    const s=(g?.status||"").toLowerCase();
    if (s) return s;
    if (g?.solution && hasVal(g.solution.text)) return "proposal";
    if (hasAnyEvalData(g?.evaluate)) return "working";
    return "new";
  }

  function hasPrefilledStep1(g){
    return hasVal(g?.custName)||hasVal(g?.custPhone);
  }

  function normGuest(src){
    src = src||{};
    const custName  = src.custName  ?? src.guestName  ?? "";
    const custPhone = src.custPhone ?? src.guestPhone ?? "";
    const e = Object.assign({}, src.evaluate||{});
    if (e.currentCarrier==null && src.currentCarrier!=null) e.currentCarrier=src.currentCarrier;
    if (e.numLines      ==null && src.numLines     !=null) e.numLines=src.numLines;
    if (e.coverageZip   ==null && src.coverageZip  !=null) e.coverageZip=src.coverageZip;
    if (e.deviceStatus  ==null && src.deviceStatus !=null) e.deviceStatus=src.deviceStatus;
    if (e.finPath       ==null && src.finPath      !=null) e.finPath=src.finPath;

    const sol = Object.assign({}, src.solution||{});
    if (sol.text==null && src.solutionText!=null) sol.text=src.solutionText;

    const out = {
      ...src,
      custName,
      custPhone,
      custPhoneDigits:digitsOnly(custPhone),
      evaluate:e,
      solution:sol,
      prefilledStep1: src.prefilledStep1 || hasPrefilledStep1({custName,custPhone})
    };
    out.status = detectStatus(out);
    return out;
  }

  function getField(g,k){
    const e=g?.evaluate||{}, sol=g?.solution||{};
    switch(k){
      case "custName":return g?.custName;
      case "custPhone":return g?.custPhone;
      case "currentCarrier":return e.currentCarrier;
      case "numLines":return e.numLines;
      case "coverageZip":return e.coverageZip;
      case "deviceStatus":return e.deviceStatus;
      case "finPath":return e.finPath;
      case "billPain":return e.billPain;
      case "dataNeed":return e.dataNeed;
      case "hotspotNeed":return e.hotspotNeed;
      case "intlNeed":return e.intlNeed;
      case "solutionText":return sol.text;
      default:return undefined;
    }
  }

  function computeGuestPitchQuality(g, weights=PITCH_WEIGHTS){
    const steps={step1:{earned:0,max:0},step2:{earned:0,max:0},step3:{earned:0,max:0}};
    const fields={};
    let earned=0,max=0;
    for(const [k,wt] of Object.entries(weights)){
      const st=FIELD_STEP[k]||"step1";
      steps[st].max += wt; max += wt;
      const ok=hasVal(getField(g,k));
      if(ok){ steps[st].earned += wt; earned += wt; }
      fields[k]={ok,wt};
    }
    const pctFull = max?Math.round((earned/max)*100):0;
    return {pct: pctFull, steps, fields};
  }

  // --- Role helpers & permission checks ---
  const isAdmin = r => r === ROLES.ADMIN;
  const isDM = r => r === ROLES.DM;
  const isLead = r => r === ROLES.LEAD;
  const isMe = r => r === ROLES.ME;

  const canDelete = r => isAdmin(r) || isDM(r) || isLead(r);
  const canEditEntry = (r, ownerUid, currentUid) =>
    r && (isAdmin(r) || isDM(r) || isLead(r) || ownerUid === currentUid);
  const canMarkSold = canEditEntry;

  const getUsersUnderDM = (users, dmUid) => {
    const leads = Object.entries(users)
      .filter(([, u]) => u.role === ROLES.LEAD && u.assignedDM === dmUid)
      .map(([uid]) => uid);
    const mes = Object.entries(users)
      .filter(([, u]) => u.role === ROLES.ME && leads.includes(u.assignedLead))
      .map(([uid]) => uid);
    return new Set([...leads, ...mes]);
  };

  function filterGuestinfo(guestinfo, users, currentUid, currentRole) {
    if (!guestinfo || !users || !currentUid || !currentRole) return {};

    if (isAdmin(currentRole)) return guestinfo;

    if (isDM(currentRole)) {
      const under = getUsersUnderDM(users, currentUid);
      under.add(currentUid);
      return Object.fromEntries(
        Object.entries(guestinfo).filter(([, g]) => under.has(g.userUid))
      );
    }

    if (isLead(currentRole)) {
      const mesUnderLead = Object.entries(users)
        .filter(([, u]) => u.role === ROLES.ME && u.assignedLead === currentUid)
        .map(([uid]) => uid);
      const visible = new Set([...mesUnderLead, currentUid]);
      return Object.fromEntries(
        Object.entries(guestinfo).filter(([, g]) => visible.has(g.userUid))
      );
    }

    if (isMe(currentRole)) {
      return Object.fromEntries(
        Object.entries(guestinfo).filter(([, g]) => g.userUid === currentUid)
      );
    }

    return {};
  }

  // HTML escape helper
  const esc = str => String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  // Date helpers
  const nowMs = () => Date.now();
  const msNDaysAgo = n => nowMs() - n * 864e5;
  const latestActivityTs = g =>
    Math.max(g.updatedAt || 0, g.submittedAt || 0, g.sale?.soldAt || 0, g.solution?.completedAt || 0);
  const inCurrentWeek = g => latestActivityTs(g) >= msNDaysAgo(7);

  // Group guestinfo by status
  function groupByStatus(guestMap) {
    const groups = { new: [], working: [], proposal: [], sold: [] };
    for (const [id, g] of Object.entries(guestMap)) {
      const st = detectStatus(g);
      if (!groups[st]) groups[st] = [];
      groups[st].push([id, g]);
    }
    for (const k in groups) {
      groups[k].sort((a, b) => latestActivityTs(b[1]) - latestActivityTs(a[1]));
    }
    return groups;
  }

  // Status badge HTML
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

  // Toggle Quick Edit form visibility
  function toggleEdit(id) {
    const card = document.getElementById(`guest-card-${id}`);
    if (!card) return;
    const display = card.querySelector(".guest-display");
    const form = card.querySelector(".guest-edit-form");
    if (!display || !form) return;
    const showForm = form.style.display === "none";
    form.style.display = showForm ? "block" : "none";
    display.style.display = showForm ? "none" : "block";
  }
  function cancelEdit(id) {
    const card = document.getElementById(`guest-card-${id}`);
    if (!card) return;
    const display = card.querySelector(".guest-display");
    const form = card.querySelector(".guest-edit-form");
    if (!display || !form) return;
    form.style.display = "none";
    display.style.display = "block";
  }

  // Save quick edit data and recompute pitch
  async function saveEdit(id) {
    const card = document.getElementById(`guest-card-${id}`);
    const form = card?.querySelector(".guest-edit-form");
    if (!form) return alert("Edit form not found.");

    const data = {
      custName: form.custName.value.trim(),
      custPhone: form.custPhone.value.trim(),
      serviceType: form.serviceType.value.trim(),
      situation: form.situation.value.trim(),
      updatedAt: Date.now()
    };

    try {
      await window.db.ref(`guestinfo/${id}`).update(data);
      await recomputePitch(id);
      cancelEdit(id);
      await window.renderAdminApp();
    } catch (e) {
      alert("Error saving changes: " + e.message);
    }
  }

  // Delete guest lead
  async function deleteGuestInfo(id) {
    if (!canDelete(window.currentRole)) {
      alert("You don't have permission to delete.");
      return;
    }
    if (!confirm("Delete this guest lead? This cannot be undone.")) return;
    try {
      await window.db.ref(`guestinfo/${id}`).remove();
      await window.renderAdminApp();
    } catch (e) {
      alert("Error deleting: " + e.message);
    }
  }

  // Mark lead sold and create sale record
  async function markSold(id) {
    try {
      const snap = await window.db.ref(`guestinfo/${id}`).get();
      const g = snap.val();
      if (!g) {
        alert("Guest record not found.");
        return;
      }
      if (!canMarkSold(window.currentRole, g.userUid, window.currentUid)) {
        alert("You don't have permission to mark this sold.");
        return;
      }

      let unitsStr = prompt("How many units were sold?", "1");
      if (unitsStr === null) return;
      let units = parseInt(unitsStr, 10);
      if (isNaN(units) || units < 0) units = 0;

      const users = window._users || {};
      const submitter = users[g.userUid] || {};
      let storeNumber = submitter.store || prompt("Enter store number for credit:", "") || "";
      storeNumber = storeNumber.toString().trim();

      const now = Date.now();

      const salePayload = {
        guestinfoKey: id,
        storeNumber,
        repUid: window.currentUid || null,
        units,
        createdAt: now
      };
      const saleRef = await window.db.ref("sales").push(salePayload);
      const saleId = saleRef.key;

      await window.db.ref(`guestinfo/${id}/sale`).set({
        saleId,
        soldAt: now,
        storeNumber,
        units
      });
      await window.db.ref(`guestinfo/${id}/status`).set("sold");

      if (storeNumber) {
        try {
          await window.db.ref(`storeCredits/${storeNumber}`).push({
            saleId,
            guestinfoKey: id,
            creditedAt: now,
            units
          });
        } catch (ledgerErr) {
          console.warn("storeCredits push failed:", ledgerErr);
        }
      }

      await recomputePitch(id);
      await window.renderAdminApp();
    } catch (err) {
      alert("Error marking sold: " + err.message);
    }
  }

  // Delete sale and rollback status + credits
  async function deleteSale(id) {
    try {
      const snap = await window.db.ref(`guestinfo/${id}`).get();
      const g = snap.val();
      if (!g) {
        alert("Guest record not found.");
        return;
      }
      if (!canMarkSold(window.currentRole, g.userUid, window.currentUid)) {
        alert("You don't have permission to modify this sale.");
        return;
      }
      if (!g.sale?.saleId) {
        alert("No sale recorded.");
        return;
      }
      if (!confirm("Delete this sale? This will remove store credit.")) return;

      const saleId = g.sale.saleId;
      const storeNumber = g.sale.storeNumber;
      const hasEval = !!g.evaluate;

      await window.db.ref(`sales/${saleId}`).remove();
      await window.db.ref(`guestinfo/${id}/sale`).remove();
      await window.db.ref(`guestinfo/${id}/status`).set(hasEval ? "working" : "new");

      if (storeNumber) {
        try {
          const creditsSnap = await window.db.ref(`storeCredits/${storeNumber}`).get();
          const creditsObj = creditsSnap.val() || {};
          const ops = Object.entries(creditsObj)
            .filter(([, c]) => c.saleId === saleId)
            .map(([cid]) => window.db.ref(`storeCredits/${storeNumber}/${cid}`).remove());
          await Promise.all(ops);
        } catch (ledgerErr) {
          console.warn("storeCredits cleanup failed:", ledgerErr);
        }
      }

      await recomputePitch(id);
      await window.renderAdminApp();
    } catch (err) {
      alert("Error deleting sale: " + err.message);
    }
  }

  // Recompute Pitch Quality and persist
  async function recomputePitch(id) {
    try {
      const snap = await window.db.ref(`guestinfo/${id}`).get();
      const data = snap.val() || {};
      const gNorm = normGuest(data);
      const comp = computeGuestPitchQuality(gNorm);
      await window.db.ref(`guestinfo/${id}/completion`).set({
        pct: Math.round(comp.pct),
        steps: comp.steps,
        fields: comp.fields,
        updatedAt: Date.now()
      });
    } catch (err) {
      console.warn("guestinfo: recomputePitch failed", err);
    }
  }

  // Filter control setters
  function setFilterMode(mode) {
    window._guestinfo_filterMode = isMe(window.currentRole) ? "week" : (mode === "all" ? "all" : "week");
    window.renderAdminApp();
  }
  function toggleShowProposals() {
    if (!window._guestinfo_showProposals) window._guestinfo_soldOnly = false;
    window._guestinfo_showProposals = !window._guestinfo_showProposals;
    window.renderAdminApp();
  }
  function toggleSoldOnly() {
    if (!window._guestinfo_soldOnly) window._guestinfo_showProposals = false;
    window._guestinfo_soldOnly = !window._guestinfo_soldOnly;
    window.renderAdminApp();
  }

  // **Updated** Create new lead: create in Firebase, store key, redirect with gid
  async function createNewLead() {
    try {
      const ref = await window.db.ref("guestinfo").push({
        createdAt: Date.now(),
        status: "new",
        userUid: window.currentUid || null
      });
      const newKey = ref.key;
      localStorage.setItem("last_guestinfo_key", newKey);
      const baseUrl = GUESTINFO_PAGE.split("?")[0];
      window.location.href = `${baseUrl}?gid=${encodeURIComponent(newKey)}&uistart=step1`;
    } catch (e) {
      alert("Error creating new lead: " + e.message);
    }
  }

  // Open full workflow page for a guest lead with uistart hint
  function openGuestInfoPage(guestKey) {
    const base = GUESTINFO_PAGE;
    const g = (window._guestinfo && window._guestinfo[guestKey]) || null;

    let uistart = "step1";
    if (g) {
      const status = (g.status || "").toLowerCase();
      if (["proposal", "sold"].includes(status)) uistart = "step3";
      else if (status === "working") uistart = "step2";
      else {
        const hasStep1 = g.prefilledStep1 || (g.custName?.trim()) || (g.custPhone?.trim());
        uistart = hasStep1 ? "step2" : "step1";
      }
    }

    const sep = base.includes("?") ? "&" : "?";
    const url = `${base}${sep}gid=${encodeURIComponent(guestKey)}&uistart=${uistart}`;

    try { localStorage.setItem("last_guestinfo_key", guestKey || ""); } catch {}
    window.location.href = url;
  }

  // Inject CSS for pitch pills once
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

  // Expose public API
  window.guestinfo = {
    renderGuestinfoSection,
    toggleEdit,
    cancelEdit,
    saveEdit,
    deleteGuestInfo,
    markSold,
    deleteSale,
    openGuestInfoPage,
    setFilterMode,
    toggleShowProposals,
    toggleSoldOnly,
    createNewLead,
    recomputePitch,
    computePitchScore: computeGuestPitchQuality
  };
})();