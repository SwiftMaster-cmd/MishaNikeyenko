(() => {
  const ROLES = { ME: "me", LEAD: "lead", DM: "dm", ADMIN: "admin" };

  /* ------------------------------------------------------------------
     Basic permission checks
     ------------------------------------------------------------------ */
  function canDelete(role) {
    return [ROLES.ADMIN, ROLES.DM, ROLES.LEAD].includes(role);
  }

  // Editable if not just a random ME. ME can edit their own.
  function canEdit(role) {
    return role !== ROLES.ME || true; // legacy; refined per-entry below
  }

  // Can mark sold? (same logic as edit-entry)
  function canMarkSold(currentRole, entryOwnerUid, currentUid) {
    if (currentRole === ROLES.ADMIN || currentRole === ROLES.DM || currentRole === ROLES.LEAD) return true;
    // ME can only mark their own
    return currentRole === ROLES.ME && entryOwnerUid === currentUid;
  }

  /* ------------------------------------------------------------------
     Helper: get users under this DM (leads + ME)
     ------------------------------------------------------------------ */
  function getUsersUnderDM(users, dmUid) {
    const leads = Object.entries(users)
      .filter(([, u]) => u.role === ROLES.LEAD && u.assignedDM === dmUid)
      .map(([uid]) => uid);
    const mes = Object.entries(users)
      .filter(([, u]) => u.role === ROLES.ME && leads.includes(u.assignedLead))
      .map(([uid]) => uid);
    return new Set([...leads, ...mes]);
  }

  /* ------------------------------------------------------------------
     Filter guestinfo by visibility rules per role
     ------------------------------------------------------------------ */
  function filterGuestinfo(guestinfo, users, currentUid, currentRole) {
    if (!guestinfo || !users || !currentUid || !currentRole) return {};

    if (currentRole === ROLES.ADMIN) return guestinfo;

    if (currentRole === ROLES.DM) {
      const underUsers = getUsersUnderDM(users, currentUid);
      underUsers.add(currentUid);
      return Object.fromEntries(
        Object.entries(guestinfo).filter(([, g]) => underUsers.has(g.userUid))
      );
    }

    if (currentRole === ROLES.LEAD) {
      const mesUnderLead = Object.entries(users)
        .filter(([, u]) => u.role === ROLES.ME && u.assignedLead === currentUid)
        .map(([uid]) => uid);
      const visibleUsers = new Set([...mesUnderLead, currentUid]);
      return Object.fromEntries(
        Object.entries(guestinfo).filter(([, g]) => visibleUsers.has(g.userUid))
      );
    }

    if (currentRole === ROLES.ME) {
      return Object.fromEntries(
        Object.entries(guestinfo).filter(([, g]) => g.userUid === currentUid)
      );
    }

    return {};
  }

  /* ------------------------------------------------------------------
     Escape for HTML inputs (simple)
     ------------------------------------------------------------------ */
  function escapeHtml(str) {
    return (str || '')
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ------------------------------------------------------------------
     Render Guest Info section
     ------------------------------------------------------------------ */
  function renderGuestinfoSection(guestinfo, users, currentUid, currentRole) {
    const visibleGuestinfo = filterGuestinfo(guestinfo, users, currentUid, currentRole);

    if (Object.keys(visibleGuestinfo).length === 0)
      return `<section class="admin-section guestinfo-section"><h2>Guest Info</h2><p class="text-center">No guest info found.</p></section>`;

    const guestCards = Object.entries(visibleGuestinfo)
      .sort((a, b) => (b[1].submittedAt || 0) - (a[1].submittedAt || 0))
      .map(([id, g]) => {
        const submitter = users[g.userUid];
        const canDeleteEntry = canDelete(currentRole);
        const canEditEntry   = currentRole !== ROLES.ME || g.userUid === currentUid;
        const isSold         = (g.status === "sold") || !!g.sale;

        // sale summary (if sold)
        let saleSummaryHtml = "";
        if (isSold && g.sale) {
          const soldAt = g.sale.soldAt ? new Date(g.sale.soldAt).toLocaleString() : "";
          const units  = g.sale.units ?? "";
          const amt    = g.sale.amount != null ? `$${Number(g.sale.amount).toFixed(2)}` : "";
          saleSummaryHtml = `
            <div class="guest-sale-summary" style="margin-top:8px; font-size:.9rem; color:#0f0;">
              <b>Sold:</b> ${soldAt} &bull; Units: ${units} ${amt ? "&bull; " + amt : ""}
            </div>`;
        }

        // action buttons row (view mode)
        const displayActions = [
          canEditEntry ? `<button class="btn btn-primary btn-sm" onclick="window.guestinfo.toggleEdit('${id}')">Edit</button>` : "",
          (!isSold && canMarkSold(currentRole, g.userUid, currentUid))
            ? `<button class="btn btn-success btn-sm" style="margin-left:8px;" onclick="window.guestinfo.markSold('${id}')">Mark Sold</button>`
            : "",
          (isSold && g.sale?.saleId)
            ? `<button class="btn btn-secondary btn-sm" style="margin-left:8px;" onclick="window.sales?.openSaleModal && window.sales.openSaleModal('${id}','${submitter?.store||""}')">View / Edit Sale</button>`
            : ""
        ].filter(Boolean).join("");

        return `
          <div class="guest-card" id="guest-card-${id}">
            <div class="guest-display" style="display: block;">
              <div><b>Submitted by:</b> ${submitter?.name || submitter?.email || g.userUid}</div>
              <div><b>Customer:</b> ${escapeHtml(g.custName) || "-"} | <b>Phone:</b> ${escapeHtml(g.custPhone) || "-"}</div>
              <div><b>Type:</b> ${escapeHtml(g.serviceType) || "-"}</div>
              <div><b>Situation:</b> ${escapeHtml(g.situation) || "-"}</div>
              <div><b>When:</b> ${g.submittedAt ? new Date(g.submittedAt).toLocaleString() : "-"}</div>
              ${saleSummaryHtml}
              <div style="margin-top:8px;">${displayActions}</div>
            </div>

            <form class="guest-edit-form" id="guest-edit-form-${id}" style="display:none; margin-top: 8px;">
              <label>
                Customer Name:<br>
                <input type="text" name="custName" value="${escapeHtml(g.custName)}" />
              </label><br>
              <label>
                Customer Phone:<br>
                <input type="text" name="custPhone" value="${escapeHtml(g.custPhone)}" />
              </label><br>
              <label>
                Service Type:<br>
                <input type="text" name="serviceType" value="${escapeHtml(g.serviceType)}" />
              </label><br>
              <label>
                Situation:<br>
                <textarea name="situation">${escapeHtml(g.situation)}</textarea>
              </label><br>
              <button type="button" onclick="window.guestinfo.saveEdit('${id}')">Save</button>
              <button type="button" onclick="window.guestinfo.cancelEdit('${id}')">Cancel</button>
              ${
                canDeleteEntry
                  ? `<button type="button" style="margin-left:10px;" onclick="window.guestinfo.deleteGuestInfo('${id}')">Delete</button>`
                  : ""
              }
            </form>
          </div>
        `;
      })
      .join("");

    return `
      <section class="admin-section guestinfo-section">
        <h2>Guest Info</h2>
        <div class="guestinfo-container">${guestCards}</div>
      </section>
    `;
  }

  /* ------------------------------------------------------------------
     View/Edit toggle
     ------------------------------------------------------------------ */
  function toggleEdit(id) {
    const displayDiv = document.querySelector(`#guest-card-${id} .guest-display`);
    const editForm   = document.getElementById(`guest-edit-form-${id}`);
    if (!displayDiv || !editForm) return;

    if (editForm.style.display === "none") {
      editForm.style.display = "block";
      displayDiv.style.display = "none";
    } else {
      editForm.style.display = "none";
      displayDiv.style.display = "block";
    }
  }

  function cancelEdit(id) {
    const form       = document.getElementById(`guest-edit-form-${id}`);
    const displayDiv = document.querySelector(`#guest-card-${id} .guest-display`);
    if (!form || !displayDiv) return;
    form.style.display = "none";
    displayDiv.style.display = "block";
  }

  /* ------------------------------------------------------------------
     Save edits
     ------------------------------------------------------------------ */
  async function saveEdit(id) {
    const form = document.getElementById(`guest-edit-form-${id}`);
    if (!form) return alert("Edit form not found.");

    const data = {
      custName:    form.custName.value.trim(),
      custPhone:   form.custPhone.value.trim(),
      serviceType: form.serviceType.value.trim(),
      situation:   form.situation.value.trim(),
    };

    try {
      await window.db.ref(`guestinfo/${id}`).update(data);
      cancelEdit(id);
      await window.renderAdminApp();
    } catch (e) {
      alert("Error saving changes: " + e.message);
    }
  }

  /* ------------------------------------------------------------------
     Delete guest info
     ------------------------------------------------------------------ */
  async function deleteGuestInfo(id) {
    if (!canDelete(window.currentRole)) {
      alert("You don't have permission to delete.");
      return;
    }
    if (!confirm("Delete this guest info?")) return;
    try {
      await window.db.ref(`guestinfo/${id}`).remove();
      await window.renderAdminApp();
    } catch (e) {
      alert("Error deleting: " + e.message);
    }
  }

  /* ------------------------------------------------------------------
     MARK SOLD FLOW (quick prompt-driven)
     ------------------------------------------------------------------ */
  async function markSold(id) {
    try {
      // Load guestinfo record
      const snap = await window.db.ref(`guestinfo/${id}`).get();
      const g = snap.val();
      if (!g) {
        alert("Guest record not found.");
        return;
      }
      // Permission check
      if (!canMarkSold(window.currentRole, g.userUid, window.currentUid)) {
        alert("You don't have permission to mark this sold.");
        return;
      }

      // Units prompt
      let unitsStr = prompt("How many units were sold?", "1");
      if (unitsStr === null) return; // cancel
      let units = parseInt(unitsStr, 10);
      if (isNaN(units) || units < 0) units = 0;

      // Optional amount
      let amtStr = prompt("Sale amount (optional $)", "");
      let amount = parseFloat(amtStr);
      if (isNaN(amount)) amount = null;

      // Determine storeNumber: prefer submitter’s user record
      const users = window._users || {};
      const submitter = users[g.userUid] || {};
      let storeNumber = submitter.store;
      if (!storeNumber) {
        storeNumber = prompt("Enter store number for credit:", "") || "";
      }
      storeNumber = storeNumber.toString().trim();

      // Create sale
      const salePayload = {
        guestinfoKey: id,
        storeNumber,
        repUid: window.currentUid || null,
        units,
        amount: amount ?? 0,
        createdAt: Date.now()
      };
      const saleRef = await window.db.ref("sales").push(salePayload);
      const saleId  = saleRef.key;

      // Attach to guestinfo
      await window.db.ref(`guestinfo/${id}/sale`).set({
        saleId,
        soldAt: Date.now(),
        storeNumber,
        units,
        amount: amount ?? 0
      });
      await window.db.ref(`guestinfo/${id}/status`).set("sold");

      // Credit store ledger
      if (storeNumber) {
        await window.db.ref(`storeCredits/${storeNumber}`).push({
          saleId,
          guestinfoKey: id,
          creditedAt: Date.now(),
          units,
          amount: amount ?? 0
        });
      }

      await window.renderAdminApp();
    } catch (err) {
      alert("Error marking sold: " + err.message);
    }
  }

  /* ------------------------------------------------------------------
     Expose
     ------------------------------------------------------------------ */
  window.guestinfo = {
    renderGuestinfoSection,
    toggleEdit,
    cancelEdit,
    saveEdit,
    deleteGuestInfo,
    markSold
  };
})();