// guestinfo.js
(() => {
  const ROLES = { ME: "me", LEAD: "lead", DM: "dm", ADMIN: "admin" };

  /* --------------------------------------------------------------
   * Resolve path to full guest workflow page
   * -------------------------------------------------------------- */
  const GUESTINFO_PAGE = window.GUESTINFO_PAGE || "../employee/guestinfo.html";

  /* --------------------------------------------------------------
   * Permission helpers
   * -------------------------------------------------------------- */
  const isAdmin = r => r === ROLES.ADMIN;
  const isDM    = r => r === ROLES.DM;
  const isLead  = r => r === ROLES.LEAD;
  const isMe    = r => r === ROLES.ME;

  function canDelete(role) {
    return isAdmin(role) || isDM(role) || isLead(role);
  }
  // Inline edit allowed for everyone except ME editing *others*
  function canEditEntry(currentRole, entryOwnerUid, currentUid) {
    if (!currentRole) return false;
    if (isAdmin(currentRole) || isDM(currentRole) || isLead(currentRole)) return true;
    return entryOwnerUid === currentUid; // ME -> own only
  }
  function canMarkSold(currentRole, entryOwnerUid, currentUid) {
    // same rule as edit
    return canEditEntry(currentRole, entryOwnerUid, currentUid);
  }

  /* --------------------------------------------------------------
   * Hierarchy helpers
   * -------------------------------------------------------------- */
  function getUsersUnderDM(users, dmUid) {
    const leads = Object.entries(users)
      .filter(([, u]) => u.role === ROLES.LEAD && u.assignedDM === dmUid)
      .map(([uid]) => uid);
    const mes = Object.entries(users)
      .filter(([, u]) => u.role === ROLES.ME && leads.includes(u.assignedLead))
      .map(([uid]) => uid);
    return new Set([...leads, ...mes]);
  }

  /* --------------------------------------------------------------
   * Visibility filter by role
   * -------------------------------------------------------------- */
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

    // ME: own only
    if (isMe(currentRole)) {
      return Object.fromEntries(
        Object.entries(guestinfo).filter(([, g]) => g.userUid === currentUid)
      );
    }

    return {};
  }

  /* --------------------------------------------------------------
   * Escape HTML
   * -------------------------------------------------------------- */
  function esc(str) {
    return (str || "")
      .toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* --------------------------------------------------------------
   * Status Badge
   * -------------------------------------------------------------- */
  function statusBadge(status) {
    const s = (status || "new").toLowerCase();
    let cls = "role-badge role-guest", label = "NEW";
    if (s === "working")  { cls = "role-badge role-lead";  label = "WORKING"; }
    else if (s === "proposal") { cls = "role-badge role-dm"; label = "PROPOSAL"; }
    else if (s === "sold")     { cls = "role-badge role-admin"; label = "SOLD"; }
    return `<span class="${cls}">${label}</span>`;
  }

  /* --------------------------------------------------------------
   * Build inline card HTML
   * -------------------------------------------------------------- */
  function renderGuestinfoSection(guestinfo, users, currentUid, currentRole) {
    const visibleGuestinfo = filterGuestinfo(guestinfo, users, currentUid, currentRole);

    if (!Object.keys(visibleGuestinfo).length) {
      return `
        <section class="admin-section guestinfo-section">
          <h2>Guest Info</h2>
          <p class="text-center">No guest info found.</p>
        </section>`;
    }

    const cardsHtml = Object.entries(visibleGuestinfo)
      .sort((a,b) => (b[1].submittedAt||0) - (a[1].submittedAt||0))
      .map(([id, g]) => guestCardHtml(id, g, users, currentUid, currentRole))
      .join("");

    return `
      <section class="admin-section guestinfo-section">
        <h2>Guest Info</h2>
        <div class="guestinfo-container">${cardsHtml}</div>
      </section>
    `;
  }

  function guestCardHtml(id, g, users, currentUid, currentRole) {
    const submitter = users[g.userUid];
    const allowDelete = canDelete(currentRole);
    const allowEdit   = canEditEntry(currentRole, g.userUid, currentUid);
    const allowSold   = canMarkSold(currentRole, g.userUid, currentUid);

    // unify service/eval fields: prefer top-level (legacy), else evaluate.*
    const serviceType = g.serviceType ?? g.evaluate?.serviceType ?? "";
    const situation   = g.situation   ?? g.evaluate?.situation   ?? "";
    // for inline preview, truncate long situation
    const sitPreview  = situation && situation.length > 140
      ? situation.slice(0,137) + "…"
      : situation;

    const status      = g.status || (g.sale ? "sold" : (g.evaluate ? "working" : "new"));
    const statBadge   = statusBadge(status);

    const isSold = status === "sold" || !!g.sale;
    const units  = isSold ? (g.sale?.units ?? "") : "";
    const soldAt = isSold && g.sale?.soldAt ? new Date(g.sale.soldAt).toLocaleString() : "";

    const saleSummary = isSold
      ? `<div class="guest-sale-summary"><b>Sold:</b> ${soldAt || ""} &bull; Units: ${units}</div>`
      : "";

    /* ---- Action Row (View Mode) ----------------------------------- */
    const actions = [];

    // Continue/Open workflow page
    actions.push(
      `<button class="btn btn-secondary btn-sm" onclick="window.guestinfo.openGuestInfoPage('${id}')">
         ${g.evaluate || g.solution || g.sale ? "Open" : "Continue"}
       </button>`
    );

    if (allowEdit) {
      actions.push(
        `<button class="btn btn-primary btn-sm" style="margin-left:8px;" onclick="window.guestinfo.toggleEdit('${id}')">Quick Edit</button>`
      );
    }

    if (!isSold && allowSold) {
      actions.push(
        `<button class="btn btn-success btn-sm" style="margin-left:8px;" onclick="window.guestinfo.markSold('${id}')">Mark Sold</button>`
      );
    }

    if (isSold && allowSold) {
      actions.push(
        `<button class="btn btn-danger btn-sm" style="margin-left:8px;" onclick="window.guestinfo.deleteSale('${id}')">Delete Sale</button>`
      );
    }

    if (allowDelete) {
      actions.push(
        `<button class="btn btn-danger btn-sm" style="margin-left:8px;" onclick="window.guestinfo.deleteGuestInfo('${id}')">Delete Lead</button>`
      );
    }

    const actionRow = actions.join("");

    /* ---- Quick Edit Form ------------------------------------------ */
    // (top-level fields only; deeper evaluate/solution done in workflow page)
    return `
      <div class="guest-card" id="guest-card-${id}">
        <div class="guest-display">
          <div><b>Status:</b> ${statBadge}</div>
          <div><b>Submitted by:</b> ${esc(submitter?.name || submitter?.email || g.userUid)}</div>
          <div><b>Customer:</b> ${esc(g.custName) || "-"} &nbsp; | &nbsp; <b>Phone:</b> ${esc(g.custPhone) || "-"}</div>
          <div><b>Type:</b> ${esc(serviceType) || "-"}</div>
          <div><b>Situation:</b> ${esc(sitPreview) || "-"}</div>
          <div><b>When:</b> ${g.submittedAt ? new Date(g.submittedAt).toLocaleString() : "-"}</div>
          ${saleSummary}
          <div class="guest-card-actions" style="margin-top:8px;">${actionRow}</div>
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

  /* --------------------------------------------------------------
   * Toggle Quick Edit
   * -------------------------------------------------------------- */
  function toggleEdit(id) {
    const card      = document.getElementById(`guest-card-${id}`);
    if (!card) return;
    const display   = card.querySelector(".guest-display");
    const form      = card.querySelector(".guest-edit-form");
    if (!display || !form) return;
    const showForm = form.style.display === "none";
    form.style.display    = showForm ? "block" : "none";
    display.style.display = showForm ? "none"  : "block";
  }
  function cancelEdit(id) {
    const card    = document.getElementById(`guest-card-${id}`);
    if (!card) return;
    const display = card.querySelector(".guest-display");
    const form    = card.querySelector(".guest-edit-form");
    if (!display || !form) return;
    form.style.display    = "none";
    display.style.display = "block";
  }

  /* --------------------------------------------------------------
   * Save Quick Edit (top-level fields only)
   * -------------------------------------------------------------- */
  async function saveEdit(id) {
    const card = document.getElementById(`guest-card-${id}`);
    const form = card?.querySelector(".guest-edit-form");
    if (!form) return alert("Edit form not found.");

    const data = {
      custName:    form.custName.value.trim(),
      custPhone:   form.custPhone.value.trim(),
      serviceType: form.serviceType.value.trim(),
      situation:   form.situation.value.trim(),
      updatedAt:   Date.now()
    };

    try {
      await window.db.ref(`guestinfo/${id}`).update(data);
      cancelEdit(id);
      await window.renderAdminApp(); // full refresh
    } catch (e) {
      alert("Error saving changes: " + e.message);
    }
  }

  /* --------------------------------------------------------------
   * Delete Lead
   * -------------------------------------------------------------- */
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

  /* --------------------------------------------------------------
   * Mark Sold (units only)
   * -------------------------------------------------------------- */
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
      if (unitsStr === null) return; // cancel
      let units = parseInt(unitsStr, 10);
      if (isNaN(units) || units < 0) units = 0;

      // Determine storeNumber: prefer submitter’s user record
      const users = window._users || {};
      const submitter = users[g.userUid] || {};
      let storeNumber = submitter.store;
      if (!storeNumber) {
        storeNumber = prompt("Enter store number for credit:", "") || "";
      }
      storeNumber = storeNumber.toString().trim();

      const now = Date.now();

      // Create sale
      const salePayload = {
        guestinfoKey: id,
        storeNumber,
        repUid: window.currentUid || null,
        units,
        createdAt: now
      };
      const saleRef = await window.db.ref("sales").push(salePayload);
      const saleId  = saleRef.key;

      // Attach to guestinfo
      await window.db.ref(`guestinfo/${id}/sale`).set({
        saleId,
        soldAt: now,
        storeNumber,
        units
      });
      await window.db.ref(`guestinfo/${id}/status`).set("sold");

      // Credit store ledger (best-effort)
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

      await window.renderAdminApp();
    } catch (err) {
      alert("Error marking sold: " + err.message);
    }
  }

  /* --------------------------------------------------------------
   * Delete Sale (undo)
   * -------------------------------------------------------------- */
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
      if (!g.sale || !g.sale.saleId) {
        alert("No sale recorded.");
        return;
      }
      if (!confirm("Delete this sale? This will remove store credit.")) return;

      const saleId      = g.sale.saleId;
      const storeNumber = g.sale.storeNumber;
      const hasEval     = !!g.evaluate;

      // Remove sale record
      await window.db.ref(`sales/${saleId}`).remove();
      // Remove from guestinfo
      await window.db.ref(`guestinfo/${id}/sale`).remove();
      // Reset status
      await window.db.ref(`guestinfo/${id}/status`).set(hasEval ? "working" : "new");

      // Remove related storeCredits entries (best-effort)
      if (storeNumber) {
        try {
          const creditsSnap = await window.db.ref(`storeCredits/${storeNumber}`).get();
          const creditsObj = creditsSnap.val() || {};
          const ops = [];
          for (const [cid, c] of Object.entries(creditsObj)) {
            if (c.saleId === saleId) {
              ops.push(window.db.ref(`storeCredits/${storeNumber}/${cid}`).remove());
            }
          }
          await Promise.all(ops);
        } catch (ledgerErr) {
          console.warn("storeCredits cleanup failed:", ledgerErr);
        }
      }

      await window.renderAdminApp();
    } catch (err) {
      alert("Error deleting sale: " + err.message);
    }
  }

  /* --------------------------------------------------------------
   * Open full workflow page (Step UI)
   * -------------------------------------------------------------- */
  function openGuestInfoPage(guestKey) {
    const base = GUESTINFO_PAGE;
    const sep  = base.includes("?") ? "&" : "?";
    const url  = `${base}${sep}gid=${encodeURIComponent(guestKey)}`;
    try { localStorage.setItem("last_guestinfo_key", guestKey); } catch(_) {}
    window.location.href = url;
  }

  /* --------------------------------------------------------------
   * Expose public API
   * -------------------------------------------------------------- */
  window.guestinfo = {
    renderGuestinfoSection,
    toggleEdit,
    cancelEdit,
    saveEdit,
    deleteGuestInfo,
    markSold,
    deleteSale,
    openGuestInfoPage
  };
})();