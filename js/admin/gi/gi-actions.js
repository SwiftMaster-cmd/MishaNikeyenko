(() => {
  const { normGuest, computeGuestPitchQuality, detectStatus, canDelete, canEditEntry, canMarkSold, ROLES } = window.guestinfoCore;

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
    const { isMe } = window.guestinfoCore;
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

  // Create new lead (clear last key & redirect)
  function createNewLead() {
    try { localStorage.removeItem("last_guestinfo_key"); } catch {}
    const GUESTINFO_PAGE = window.GUESTINFO_PAGE || "../html/guestinfo.html";
    window.location.href = GUESTINFO_PAGE.split("?")[0];
  }

  // Open full workflow page for a guest lead with uistart hint
  function openGuestInfoPage(guestKey) {
    const GUESTINFO_PAGE = window.GUESTINFO_PAGE || "../html/guestinfo.html";
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

  // Export actions API
  window.guestinfoActions = {
    toggleEdit,
    cancelEdit,
    saveEdit,
    deleteGuestInfo,
    markSold,
    deleteSale,
    recomputePitch,
    setFilterMode,
    toggleShowProposals,
    toggleSoldOnly,
    createNewLead,
    openGuestInfoPage
  };
})();