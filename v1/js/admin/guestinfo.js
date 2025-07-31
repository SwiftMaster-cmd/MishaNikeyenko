/* guestinfo.js */
(() => {
  const ROLES = { ME: "me", LEAD: "lead", DM: "dm", ADMIN: "admin" };

  const GUESTINFO_PAGE = window.GUESTINFO_PAGE || "../html/guestinfo.html";

  let currentUid = null;
  let currentRole = ROLES.ME;

  let _guestinfoCache = {};
  let _usersCache = {};

  let _rerenderTimer = null;

  // UI state stored globally for persistence
  window._guestinfo_filterMode ??= "week";
  window._guestinfo_showProposals ??= false;
  window._guestinfo_soldOnly ??= false;

  function init(uid, role) {
    currentUid = uid;
    currentRole = role;
    bindRealtimeListeners();
  }

  function bindRealtimeListeners() {
    const guestinfoRef = window.db.ref("guestinfo");
    const usersRef = window.db.ref("users");

    guestinfoRef.on("value", (snap) => {
      _guestinfoCache = snap.val() || {};
      debounceRender();
    });

    usersRef.on("value", (snap) => {
      _usersCache = snap.val() || {};
      debounceRender();
    });
  }

  // Role-based filtering of guestinfo
  function filterGuestinfo() {
    if (!currentRole || !currentUid) return {};

    if (currentRole === ROLES.ADMIN) return _guestinfoCache;

    if (currentRole === ROLES.DM) {
      const under = getUsersUnderDM(currentUid);
      under.add(currentUid);
      return Object.fromEntries(
        Object.entries(_guestinfoCache).filter(([, g]) => under.has(g.userUid))
      );
    }

    if (currentRole === ROLES.LEAD) {
      const visibleSet = new Set(
        Object.entries(_usersCache)
          .filter(([, u]) => u.role === ROLES.ME && u.assignedLead === currentUid)
          .map(([uid]) => uid)
          .concat([currentUid])
      );
      return Object.fromEntries(
        Object.entries(_guestinfoCache).filter(([, g]) => visibleSet.has(g.userUid))
      );
    }

    if (currentRole === ROLES.ME) {
      return Object.fromEntries(
        Object.entries(_guestinfoCache).filter(([, g]) => g.userUid === currentUid)
      );
    }

    return {};
  }

  // Helper: get users under a DM
  function getUsersUnderDM(dmUid) {
    const leads = Object.entries(_usersCache)
      .filter(([, u]) => u.role === ROLES.LEAD && u.assignedDM === dmUid)
      .map(([uid]) => uid);
    const mes = Object.entries(_usersCache)
      .filter(([, u]) => u.role === ROLES.ME && leads.includes(u.assignedLead))
      .map(([uid]) => uid);
    return new Set([...leads, ...mes]);
  }

  // Helper: HTML escape
  function esc(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Render guestinfo UI (simplified example)
  function render() {
    const container = document.getElementById("guestInfoContainer");
    if (!container) return;

    const filtered = filterGuestinfo();

    if (Object.keys(filtered).length === 0) {
      container.innerHTML = `
        <div class="text-center" style="margin-top:20px;">
          <p><b>No leads found for your view.</b></p>
          <button class="btn btn-success btn-sm" onclick="window.guestinfo.createNewLead()">+ New Lead</button>
        </div>`;
      return;
    }

    let html = `<ul class="guestinfo-list">`;

    for (const [id, lead] of Object.entries(filtered)) {
      html += `<li class="guestinfo-item" data-id="${esc(id)}">
        <div><strong>${esc(lead.custName || "No Name")}</strong></div>
        <div>${esc(lead.custPhone || "No Phone")}</div>
        <div>Status: ${esc(lead.status || "new")}</div>
        <button onclick="window.guestinfo.viewLead('${esc(id)}')">View</button>
      </li>`;
    }

    html += "</ul>";

    container.innerHTML = html;
  }

  // Debounce render
  function debounceRender() {
    if (_rerenderTimer) clearTimeout(_rerenderTimer);
    _rerenderTimer = setTimeout(() => render(), 100);
  }

  // Create new lead placeholder
  async function createNewLead() {
    const guestinfoRef = window.db.ref("guestinfo").push();
    const newKey = guestinfoRef.key;
    await guestinfoRef.set({
      custName: "",
      custPhone: "",
      userUid: currentUid,
      status: "new",
      createdAt: Date.now(),
    });
    render();
  }

  // View lead details (navigate or modal)
  function viewLead(id) {
    window.location.href = `${GUESTINFO_PAGE}?guestKey=${id}`;
  }

  window.guestinfo = {
    init,
    createNewLead,
    viewLead,
  };
})();