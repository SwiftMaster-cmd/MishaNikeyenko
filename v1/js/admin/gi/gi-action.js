// guestinfo-admin.js

// ---- State for mode switching ----
if (!window.guestinfoMode) window.guestinfoMode = 'open';

window.setGuestinfoMode = function(mode) {
  window.guestinfoMode = mode;
  window.renderAdminApp();
};

function modeSwitcherHtml() {
  const m = window.guestinfoMode || 'open';
  const modes = [
    ['open', 'Open'],
    ['edit', 'Quick Edit'],
    ['markSold', 'Mark Sold'],
    ['delete', 'Delete']
  ];
  return `
    <div class="guestinfo-mode-switcher" style="margin-bottom:18px;display:flex;gap:16px;align-items:center;">
      <span style="font-weight:600;color:#444;">Action Mode:</span>
      ${modes.map(([val, lbl]) =>
        `<label style="margin-right:12px;cursor:pointer;">
          <input type="radio" name="guestinfo-mode" value="${val}" ${m===val?'checked':''}
            onchange="window.setGuestinfoMode('${val}')"
            style="margin-right:4px;vertical-align:middle;" /> ${lbl}
        </label>`
      ).join('')}
    </div>
  `;
}

// ---- Helpers ----
function msNDaysAgo(n) { return Date.now() - n * 864e5; }
function latestActivityTs(g) {
  return Math.max(
    g.updatedAt || 0,
    g.submittedAt || 0,
    g.sale?.soldAt || 0,
    g.solution?.completedAt || 0
  );
}
function inCurrentWeek(g) { return latestActivityTs(g) >= msNDaysAgo(7); }
function dateToISO(ts) { return ts ? new Date(ts).toISOString().slice(0, 10) : ''; }
function hasVal(v) {
  if (v == null) return false;
  if (typeof v === "string")  return v.trim() !== "";
  if (typeof v === "number")  return true;
  if (typeof v === "boolean") return v;
  if (Array.isArray(v))       return v.length > 0;
  if (typeof v === "object")  return Object.keys(v).length > 0;
  return false;
}
function digitsOnly(s) { return (s || "").replace(/\D+/g, ""); }
function esc(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function timeAgo(ts) {
  if (!ts) return "-";
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(diff / 3600000);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(diff / 86400000);
  return `${days}d`;
}

// ---- Role filter logic ----
function getUsersUnderDM(users, dmUid) {
  const leads = Object.entries(users)
    .filter(([,u]) => u.role === "lead" && u.assignedDM === dmUid)
    .map(([uid]) => uid);
  const mes = Object.entries(users)
    .filter(([,u]) => u.role === "me" && leads.includes(u.assignedLead))
    .map(([uid]) => uid);
  return new Set([...leads, ...mes]);
}
function filterByRole(guestinfo, users, uid, role) {
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
  if (role === "me") {
    return Object.fromEntries(
      Object.entries(guestinfo).filter(([,g]) => g.userUid === uid)
    );
  }
  return {};
}

// ---- Status helpers ----
function detectStatus(g) {
  const s = (g?.status || "").toLowerCase();
  if (s) return s;
  if (g?.solution && hasVal(g.solution.text)) return "proposal";
  if (["currentCarrier","numLines","coverageZip","deviceStatus","finPath",
       "billPain","dataNeed","hotspotNeed","intlNeed"]
      .some(k => hasVal(g.evaluate?.[k]))
  ) return "working";
  return "new";
}
function normGuest(src) {
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
function groupByStatus(guestMap) {
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
function computeGuestPitchQuality(g) {
  // adjust as needed for your score fields
  let earned = 0, max = 80;
  if (hasVal(g.custName)) earned += 8;
  if (hasVal(g.custPhone)) earned += 7;
  if (g.evaluate) {
    ["currentCarrier","numLines","coverageZip","deviceStatus","finPath","billPain","dataNeed","hotspotNeed","intlNeed"]
    .forEach(k => { if (hasVal(g.evaluate[k])) earned += 5; });
  }
  if (g.solution && hasVal(g.solution.text)) earned += 25;
  return { pct: max ? Math.round(earned/max*100) : 0 };
}
function statusBadge(status) {
  const map = {
    new:      ["role-badge role-guest", "NEW"],
    working:  ["role-badge role-lead",  "WORKING"],
    proposal: ["role-badge role-dm",    "PROPOSAL"],
    sold:     ["role-badge role-admin", "SOLD"]
  };
  return map[status] || map.new;
}

// ---- Section rendering ----
function statusSectionHtml(title, rows, users, currentUid, currentRole, highlight = false) {
  if (!rows?.length) {
    return `<div class="guestinfo-subsection-empty"><i>None.</i></div>`;
  }
  return rows.map(([id, g]) =>
    guestCardHtml(id, g, users, currentUid, currentRole)
  ).join("");
}
function emptyHtml(msg = "No guest leads in this view.") {
  return `
    <div class="guestinfo-empty" style="text-align:center;margin-top:16px;">
      <p><b>${msg}</b></p>
      <button class="btn btn-success btn-sm"
              onclick="window.guestinfo.createNewLead()">
        + New Lead
      </button>
    </div>`;
}

// ---- Card rendering ----
function guestCardHtml(id, g, users, currentUid, currentRole) {
  const submitter = users[g.userUid] || {};
  const [statusCls, statusLbl] = statusBadge(detectStatus(g));
  const savedPct = typeof g.completionPct === "number"
    ? g.completionPct
    : (g.completion?.pct ?? null);
  const pct = savedPct != null
    ? savedPct
    : computeGuestPitchQuality(normGuest(g)).pct;
  let bg;
  if (pct >= 75)      bg = "rgba(0, 80, 0, 0.4)";
  else if (pct >= 40) bg = "rgba(80, 80, 0, 0.4)";
  else                bg = "rgba(80, 0, 0, 0.4)";
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

  return `
    <div class="guest-card" id="guest-card-${id}"
         style="background:${bg};border-radius:8px;padding:12px;position:relative;cursor:pointer;"
         onclick="window.handleGuestCardClick('${id}')">
      <div style="display:flex;align-items:center;gap:8px;">
        <span class="${statusCls}" style="padding:2px 8px;border-radius:999px;font-size:.85em;">
          ${statusLbl}
        </span>
        <span class="guest-pitch-pill"
              style="padding:2px 8px;border-radius:999px;font-size:.85em;background:${bg};border:1px solid #fff;">
          ${pct}%
        </span>
      </div>
      <div style="text-align:center;font-weight:600;font-size:1.1em;margin:8px 0;">
        ${esc(g.custName || "-")}
      </div>
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

// ---- Main section renderer ----
window.renderGuestinfoSection = function(guestinfo, users, uid, role) {
  const f = window._guestinfo_filters || {};
  let items = filterByRole(guestinfo, users, uid, role);
  if (f.name) {
    const nameLower = f.name.toLowerCase();
    items = Object.fromEntries(
      Object.entries(items).filter(([,g]) =>
        g.custName?.toLowerCase().includes(nameLower)
      )
    );
  }
  if (f.employee) {
    const empLower = f.employee.toLowerCase();
    items = Object.fromEntries(
      Object.entries(items).filter(([,g]) => {
        const sub = users[g.userUid] || {};
        const n = (sub.name || sub.email || "").toLowerCase();
        return n.includes(empLower);
      })
    );
  }
  if (f.date) {
    items = Object.fromEntries(
      Object.entries(items).filter(([,g]) =>
        dateToISO(g.submittedAt) === f.date
      )
    );
  }

  const fullGroups = groupByStatus(items);
  const propCount  = fullGroups.proposal.length;
  const soldCount  = fullGroups.sold.length;

  if (!f.showProposals && !f.soldOnly && f.filterMode === 'week' && role !== 'me') {
    items = Object.fromEntries(
      Object.entries(items).filter(([,g]) => inCurrentWeek(g))
    );
  }

  const groups = groupByStatus(items);

  let inner = '';
  if (f.soldOnly && role !== 'me') {
    if (groups.sold.length) {
      inner = statusSectionHtml('Sales', groups.sold, users, uid, role);
    } else {
      inner = emptyHtml('No sales in this view.');
    }
  } else if (f.showProposals) {
    if (groups.proposal.length) {
      inner = statusSectionHtml('Follow-Ups', groups.proposal, users, uid, role, true);
    } else {
      inner = emptyHtml('No follow-ups in this view.');
    }
  } else {
    const hasAny = groups.new.length || groups.working.length || groups.proposal.length;
    if (!hasAny) {
      inner = emptyHtml("You're all caught up!");
    } else {
      if (groups.new.length)     inner += statusSectionHtml('New',      groups.new,     users, uid, role);
      if (groups.working.length) inner += statusSectionHtml('Working',  groups.working, users, uid, role);
      if (groups.proposal.length)inner += statusSectionHtml('Proposal', groups.proposal,users, uid, role, true);
    }
  }

  return `
    <section class="admin-section guestinfo-section" id="guestinfo-section">
      ${modeSwitcherHtml()}
      <!-- Add your controlsBarHtml here if needed -->
      <div id="guestinfo-results">
        ${inner}
      </div>
    </section>
  `;
};

// ---- ACTIONS ----
window.guestinfo = window.guestinfo || {};

window.handleGuestCardClick = async function(id) {
  const mode = window.guestinfoMode || 'open';
  if (mode === 'open')        window.guestinfo.openGuestInfoPage(id);
  else if (mode === 'edit')   window.guestinfo.toggleEdit(id);
  else if (mode === 'markSold') await window.guestinfo.markSold(id);
  else if (mode === 'delete')    await window.guestinfo.deleteGuestInfo(id);
};

window.guestinfo.openGuestInfoPage = function(id) {
  const base = window.GUESTINFO_PAGE || '../html/guestinfo.html';
  window.location.href = `${base}?gid=${encodeURIComponent(id)}`;
};
window.guestinfo.toggleEdit = function(id) {
  const card = document.getElementById(`guest-card-${id}`);
  if (!card) return;
  const form = card.querySelector('.guest-edit-form');
  if (!form) return;
  form.style.display = form.style.display === 'block' ? 'none' : 'block';
};
window.guestinfo.saveEdit = async function(id) {
  const form = document.getElementById(`guest-edit-form-${id}`);
  if (!form) return;
  const data = {
    custName:    form.custName.value.trim(),
    custPhone:   form.custPhone.value.trim(),
    serviceType: form.serviceType.value.trim(),
    situation:   form.situation.value.trim(),
    updatedAt:   Date.now()
  };
  try {
    await window.db.ref(`guestinfo/${id}`).update(data);
    window.guestinfo.toggleEdit(id);
    await window.renderAdminApp();
  } catch (e) { alert('Error saving changes: ' + e.message); }
};
window.guestinfo.cancelEdit = function(id) {
  window.guestinfo.toggleEdit(id);
};
window.guestinfo.deleteGuestInfo = async function(id) {
  try {
    await window.db.ref(`guestinfo/${id}`).remove();
    await window.renderAdminApp();
  } catch (e) {
    alert('Error deleting: ' + e.message);
  }
};
window.guestinfo.markSold = async function(id) {
  try {
    const snap = await window.db.ref(`guestinfo/${id}`).get();
    const g    = snap.val();
    if (!g) return alert('Guest record not found.');
    let units = parseInt(prompt('How many units were sold?', '1'), 10);
    if (isNaN(units) || units < 0) units = 0;
    const users     = window._users || {};
    const submitter = users[g.userUid] || {};
    let storeNumber = submitter.store || prompt('Enter store number for credit:', '') || '';
    storeNumber = storeNumber.toString().trim();
    const now = Date.now();
    const saleRef = await window.db.ref('sales').push({
      guestinfoKey: id,
      storeNumber,
      repUid: window.currentUid || null,
      units,
      createdAt: now
    });
    const saleId = saleRef.key;
    await window.db.ref(`guestinfo/${id}`).update({
      sale:   { saleId, soldAt: now, storeNumber, units },
      status: 'sold'
    });
    if (storeNumber) {
      try {
        await window.db.ref(`storeCredits/${storeNumber}`).push({
          saleId,
          guestinfoKey: id,
          creditedAt: now,
          units
        });
      } catch {}
    }
    await window.renderAdminApp();
  } catch (err) {
    alert('Error marking sold: ' + err.message);
  }
};
window.guestinfo.createNewLead = function() {
  try { localStorage.removeItem("last_guestinfo_key"); } catch (_) {}
  window.location.href = (window.GUESTINFO_PAGE || "../html/guestinfo.html").split('?')[0];
};