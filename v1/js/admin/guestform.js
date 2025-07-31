/* guestform.js */
(() => {
  const ROLES = { ME:"me", LEAD:"lead", DM:"dm", ADMIN:"admin" };

  let currentUid = null;
  let currentRole = ROLES.ME;

  let _formsCache = {};
  let _guestinfoCache = {};
  let _usersCache = {};

  let _rerenderTimer = null;

  // Today/All toggle global
  if (typeof window._guestforms_showAll === "undefined") {
    window._guestforms_showAll = false;
  }

  function init(uid, role) {
    currentUid = uid;
    currentRole = role;
    bindRealtimeListeners();
  }

  function bindRealtimeListeners() {
    const formsRef = window.db.ref("guestEntries");
    const guestinfoRef = window.db.ref("guestinfo");
    const usersRef = window.db.ref("users");

    formsRef.on("value", snap => {
      _formsCache = snap.val() || {};
      debounceRender();
    });

    guestinfoRef.on("value", snap => {
      _guestinfoCache = snap.val() || {};
      debounceRender();
    });

    usersRef.on("value", snap => {
      _usersCache = snap.val() || {};
      debounceRender();
    });
  }

  // Filter forms visible to current user
  function visibleFormsForRole(formsObj) {
    if (!formsObj) return {};
    const out = {};
    for (const [id, f] of Object.entries(formsObj)) {
      // Hide forms if linked guest is advanced status
      const gid = f.guestinfoKey;
      if (gid) {
        const g = _guestinfoCache[gid];
        if (g && (g.status === "proposal" || g.status === "sold")) continue;
      }
      if (currentRole === ROLES.ADMIN || currentRole === ROLES.DM) {
        out[id] = f;
        continue;
      }
      const claimedBy = f.consumedBy || f.claimedBy;
      if (!claimedBy || claimedBy === currentUid) {
        out[id] = f;
      }
    }
    return out;
  }

  // Partition into unclaimed and claimed arrays
  function partitionForms(forms) {
    const unclaimed = [];
    const claimed = [];
    for (const [id, f] of Object.entries(forms)) {
      const claimedBy = f.consumedBy || f.claimedBy;
      if (!claimedBy) {
        unclaimed.push([id, f]);
      } else {
        claimed.push([id, f]);
      }
    }
    unclaimed.sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));
    claimed.sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));
    return { unclaimed, claimed };
  }

  // Apply today filter
  function applyTodayFilter(rows) {
    if (window._guestforms_showAll) return rows;
    const startToday = startOfTodayMs();
    const endToday = endOfTodayMs();
    return rows.filter(([, f]) => {
      const ts = f.timestamp || 0;
      return ts >= startToday && ts <= endToday;
    });
  }

  function startOfTodayMs() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function endOfTodayMs() {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  }

  // Escape HTML helper
  function esc(str) {
    return (str || "").toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Render HTML row for a form
  function rowHtml(id, f) {
    const ts = f.timestamp ? new Date(f.timestamp).toLocaleString() : "-";
    const name = esc(f.guestName || "-");
    const phone = esc(f.guestPhone || "-");

    const claimedBy = f.consumedBy || f.claimedBy;
    const isClaimed = !!claimedBy;

    let status = "new";
    if (f.guestinfoKey) {
      const g = _guestinfoCache[f.guestinfoKey];
      if (g?.status) status = g.status;
    }

    const statusBadge = `<span class="role-badge role-guest" style="opacity:.8;">${esc(status)}</span>`;

    let claimLabel;
    if (isClaimed) {
      const u = _usersCache[claimedBy] || {};
      const label = esc(u.name || u.email || claimedBy);
      const roleCss = "role-" + (u.role || "guest");
      claimLabel = `<span class="role-badge ${roleCss}" title="${label}">${label}</span>`;
    } else {
      claimLabel = `<small style="opacity:.7;">unclaimed</small>`;
    }

    const actionLabel = isClaimed ? "Open" : "Continue";

    const canDeleteForm = currentRole === ROLES.ADMIN || currentRole === ROLES.DM || currentRole === ROLES.LEAD;
    const delBtn = canDeleteForm ? `<button class="btn btn-danger btn-sm" onclick="window.guestforms.deleteGuestFormEntry('${id}')">Delete</button>` : "";

    return `<tr class="${isClaimed ? "claimed" : ""}">
      <td data-label="Name">${name}</td>
      <td data-label="Phone">${phone}</td>
      <td data-label="Submitted">${ts}</td>
      <td data-label="Status">${statusBadge}<br>${claimLabel}</td>
      <td data-label="Action">
        <button class="btn btn-primary btn-sm" onclick="window.guestforms.continueToGuestInfo('${id}')">${actionLabel}</button>
        ${delBtn}
      </td>
    </tr>`;
  }

  // Render main UI
  function render() {
    const container = document.getElementById("guestFormsContainer");
    if (!container) return;

    const visibleForms = visibleFormsForRole(_formsCache);
    const { unclaimed, claimed } = partitionForms(visibleForms);

    const unclaimedFiltered = applyTodayFilter(unclaimed);
    const claimedFiltered = applyTodayFilter(claimed);

    let html = "";

    if (unclaimedFiltered.length > 0) {
      html += `<h3>Unclaimed Leads</h3><table class="table"><tbody>`;
      for (const [id, f] of unclaimedFiltered) {
        html += rowHtml(id, f);
      }
      html += `</tbody></table>`;
    }

    if (claimedFiltered.length > 0) {
      html += `<h3>Claimed Leads</h3><table class="table"><tbody>`;
      for (const [id, f] of claimedFiltered) {
        html += rowHtml(id, f);
      }
      html += `</tbody></table>`;
    }

    if (unclaimedFiltered.length === 0 && claimedFiltered.length === 0) {
      html = `
        <div class="text-center" style="margin-top:20px;">
          <p><b>All caught up!</b> No guest forms in your queue.</p>
          <p style="opacity:.8;">Go greet a customer and start a new lead.</p>
          <button class="btn btn-primary btn-sm" onclick="window.guestforms.startNewLead()">Start New Lead</button>
        </div>`;
    }

    container.innerHTML = html;
  }

  // Debounce render calls
  function debounceRender() {
    if (_rerenderTimer) clearTimeout(_rerenderTimer);
    _rerenderTimer = setTimeout(() => render(), 100);
  }

  // Create a new guest form lead
  async function startNewLead() {
    const newEntry = {
      guestName: "",
      guestPhone: "",
      timestamp: Date.now(),
      claimedBy: currentUid,
      status: "new"
    };
    const newRef = window.db.ref("guestEntries").push();
    await newRef.set(newEntry);
  }

  // Delete guest form entry
  async function deleteGuestFormEntry(id) {
    if (!(currentRole === ROLES.ADMIN || currentRole === ROLES.DM || currentRole === ROLES.LEAD)) {
      alert("Permission denied.");
      return;
    }
    if (!confirm("Are you sure you want to delete this guest form?")) return;
    await window.db.ref("guestEntries/" + id).remove();
  }

  // Continue to guest info page or create new if missing
  async function continueToGuestInfo(formId) {
    const form = _formsCache[formId];
    if (!form) return alert("Form not found.");

    if (form.guestinfoKey) {
      window.location.href = `${window.GUESTINFO_PAGE}?guestKey=${form.guestinfoKey}`;
    } else {
      // Create new guestinfo record
      const guestinfoRef = window.db.ref("guestinfo").push();
      const newGuestKey = guestinfoRef.key;

      // Seed guestinfo with form data
      await guestinfoRef.set({
        custName: form.guestName || "",
        custPhone: form.guestPhone || "",
        userUid: currentUid,
        status: "working",
        createdAt: Date.now()
      });

      // Update guestEntries to link guestinfoKey
      await window.db.ref("guestEntries/" + formId).update({
        guestinfoKey: newGuestKey
      });

      window.location.href = `${window.GUESTINFO_PAGE}?guestKey=${newGuestKey}`;
    }
  }

  window.guestforms = {
    init,
    startNewLead,
    deleteGuestFormEntry,
    continueToGuestInfo
  };
})();