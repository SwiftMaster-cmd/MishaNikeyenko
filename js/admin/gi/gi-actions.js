(() => {
  // Role helpers (reuse or define if needed)
  const ROLES = window.ROLES || { ME: "me", LEAD: "lead", DM: "dm", ADMIN: "admin" };
  const isAdmin = r => r === ROLES.ADMIN;
  const isDM = r => r === ROLES.DM;
  const isLead = r => r === ROLES.LEAD;
  const isMe = r => r === ROLES.ME;

  const canDelete = r => isAdmin(r) || isDM(r) || isLead(r);
  const canEditEntry = (r, ownerUid, currentUid) =>
    r && (isAdmin(r) || isDM(r) || isLead(r) || ownerUid === currentUid);
  const canMarkSold = canEditEntry;

  // Toggle Quick Edit form visibility for a guest card
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

  // Delete guest lead with permission check and confirmation
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

  // Mark lead sold and create sale record with optional store credit
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

  // Delete sale record, rollback guest status and credits
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

  // Recompute Pitch Quality and persist to guestinfo
  async function recomputePitch(id) {
    try {
      const snap = await window.db.ref(`guestinfo/${id}`).get();
      const data = snap.val() || {};
      const gNorm = window.guestinfo.normGuest ? window.guestinfo.normGuest(data) : data;
      const comp = window.guestinfo.computeGuestPitchQuality ? window.guestinfo.computeGuestPitchQuality(gNorm) : { pct: 0 };
      await window.db.ref(`guestinfo/${id}/completion`).set({
        pct: Math.round(comp.pct),
        steps: comp.steps,
        updatedAt: Date.now()
      });
    } catch (err) {
      console.warn("guestinfo: recomputePitch failed", err);
    }
  }

  // Open full workflow page for a guest lead with uistart hint
  function openGuestInfoPage(guestKey) {
    const base = window.GUESTINFO_PAGE || "../html/guestinfo.html";
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

  // Expose public API
  window.guestinfo = window.guestinfo || {};
  Object.assign(window.guestinfo, {
    isAdmin,
    isDM,
    isLead,
    isMe,
    canDelete,
    canEditEntry,
    canMarkSold,
    toggleEdit,
    cancelEdit,
    saveEdit,
    deleteGuestInfo,
    markSold,
    deleteSale,
    recomputePitch,
    openGuestInfoPage
  });
})();