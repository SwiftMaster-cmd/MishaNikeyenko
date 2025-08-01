export function guestCardHtml(id, g, users, currentUid, currentRole) {
  const submitter = users[g.userUid] || {};
  const [statusCls, statusLbl] = statusBadge(detectStatus(g));

  const savedPct = typeof g.completionPct === "number"
    ? g.completionPct
    : (g.completion?.pct ?? null);
  const pct = savedPct != null
    ? savedPct
    : computeGuestPitchQuality(normGuest(g)).pct;

  // Glassy muted backgrounds tinted by quality
  let bgColor;
  if (pct >= 75)      bgColor = "rgba(15, 75, 25, 0.38)";
  else if (pct >= 40) bgColor = "rgba(75, 75, 15, 0.38)";
  else                bgColor = "rgba(75, 15, 15, 0.38)";

  const rawPhone = esc(g.custPhone || "");
  const numDigits = digitsOnly(g.custPhone || "");
  const last4 = numDigits.slice(-4).padStart(4, "0");
  const maskedPhone = `XXX-${last4}`;

  const timeAgoStr = timeAgo(g.submittedAt);

  const roleBadgeClass = currentRole === "me" ? "role-badge role-me"
                     : currentRole === "lead" ? "role-badge role-lead"
                     : currentRole === "dm" ? "role-badge role-dm"
                     : "role-badge role-admin";
  const submitterName = esc(submitter.name || submitter.email || "-");

  const sold = detectStatus(g) === "sold";
  const canEdit = ["admin","dm","lead"].includes(currentRole) || g.userUid === currentUid;
  const canSold = canEdit && !sold;

  const actions = [
    `<button class="btn btn-secondary btn-sm" onclick="window.guestinfo.openGuestInfoPage('${id}')">
       ${g.evaluate||g.solution||g.sale ? "Open" : "Continue"}
     </button>`,
    canEdit ? `<button class="btn btn-primary btn-sm" onclick="window.guestinfo.toggleEdit('${id}')">Quick Edit</button>` : "",
    canSold ? `<button class="btn btn-success btn-sm" onclick="window.guestinfo.markSold('${id}')">Mark Sold</button>` : "",
    sold ? `<button class="btn btn-danger btn-sm" onclick="window.guestinfo.deleteSale('${id}')">Delete Sale</button>` : "",
    canEdit ? `<button class="btn btn-danger btn-sm" onclick="window.guestinfo.deleteGuestInfo('${id}')">Delete Lead</button>` : ""
  ].filter(Boolean).join("");

  return `
  <div class="guest-card" id="guest-card-${id}" style="
    background: ${bgColor};
    backdrop-filter: saturate(160%) blur(14px);
    border-radius: 14px;
    box-shadow: 0 3px 15px rgba(0,0,0,0.14);
    padding: 18px 22px;
    margin-bottom: 1.6rem;
    color: #e7f2ff;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
  ">
    <!-- Header: Status badge, pitch %, action toggle -->
    <div style="display:flex; align-items:center; gap: 10px; margin-bottom: 14px;">
      <span class="${statusCls}" style="
        padding: 4px 14px;
        border-radius: 9999px;
        font-size: 0.85rem;
        font-weight: 700;
        box-shadow: 0 0 8px rgba(30,144,255,0.6);
        user-select: none;
      ">
        ${statusLbl}
      </span>
      <span style="
        padding: 4px 14px;
        border-radius: 9999px;
        font-size: 0.85rem;
        font-weight: 600;
        border: 1.5px solid rgba(255,255,255,0.4);
        background: rgba(255,255,255,0.1);
        user-select: none;
      ">
        ${pct}%
      </span>
      <button class="btn-action-toggle" style="
        margin-left: auto;
        background: transparent;
        border: none;
        font-size: 1.3rem;
        color: rgba(255,255,255,0.7);
        cursor: pointer;
        transition: color 0.2s ease;
      " onclick="window.guestinfo.toggleActionButtons('${id}')"
      aria-label="Toggle action buttons">⋮</button>
    </div>

    <!-- Customer Name -->
    <div style="
      text-align: center;
      font-weight: 600;
      font-size: 1.18rem;
      color: #bbd7ff;
      margin-bottom: 16px;
      user-select: text;
      letter-spacing: 0.01em;
    ">
      ${esc(g.custName || "-")}
    </div>

    <!-- Footer: Submitter badge, phone toggle, submitted time -->
    <div style="display:flex; justify-content: space-between; align-items: center; font-size: 0.9rem; color: #a9c5ff;">
      <span class="${roleBadgeClass}" style="
        padding: 4px 10px;
        border-radius: 9999px;
        background: rgba(30,144,255,0.18);
        box-shadow: 0 0 8px rgba(30,144,255,0.4);
        user-select: none;
        max-width: 140px;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      " title="${submitterName}">
        ${submitterName}
      </span>
      <button class="guest-phone-toggle" style="
        background: rgba(255,255,255,0.1);
        border: none;
        border-radius: 12px;
        color: #c5dbff;
        padding: 6px 14px;
        cursor: pointer;
        font-weight: 600;
        user-select: none;
        transition: background-color 0.25s ease;
      " data-raw="${rawPhone}" data-mask="${maskedPhone}" onclick="window.guestinfo.togglePhone('${id}')"
      aria-label="Toggle phone number">
        ${maskedPhone}
      </button>
      <time datetime="${g.submittedAt}" style="color:#8fb8ff; font-variant-numeric: tabular-nums;">${timeAgoStr}</time>
    </div>

    <!-- Hidden action buttons -->
    <div class="guest-card-actions" style="
      display: none;
      margin-top: 16px;
      gap: 10px;
      flex-wrap: wrap;
      justify-content: flex-start;
    ">
      ${actions}
    </div>

    <!-- Hidden edit form -->
    <form class="guest-edit-form" id="guest-edit-form-${id}" style="display:none; margin-top: 18px;">
      <label style="display:block; margin-bottom: 10px; font-weight: 600; font-size: 0.95rem; color:#aac8ff;">
        Customer Name
        <input type="text" name="custName" value="${esc(g.custName)}" style="
          width: 100%;
          padding: 7px 12px;
          border-radius: 9px;
          border: 1.5px solid rgba(30,144,255,0.3);
          background: rgba(20,30,50,0.3);
          color: #d5e6ff;
          font-size: 1rem;
          outline-offset: 2px;
        " />
      </label>
      <label style="display:block; margin-bottom: 10px; font-weight: 600; font-size: 0.95rem; color:#aac8ff;">
        Customer Phone
        <input type="text" name="custPhone" value="${esc(g.custPhone)}" style="
          width: 100%;
          padding: 7px 12px;
          border-radius: 9px;
          border: 1.5px solid rgba(30,144,255,0.3);
          background: rgba(20,30,50,0.3);
          color: #d5e6ff;
          font-size: 1rem;
          outline-offset: 2px;
        " />
      </label>
      <label style="display:block; margin-bottom: 10px; font-weight: 600; font-size: 0.95rem; color:#aac8ff;">
        Service Type
        <input type="text" name="serviceType" value="${esc(g.serviceType || "")}" style="
          width: 100%;
          padding: 7px 12px;
          border-radius: 9px;
          border: 1.5px solid rgba(30,144,255,0.3);
          background: rgba(20,30,50,0.3);
          color: #d5e6ff;
          font-size: 1rem;
          outline-offset: 2px;
        " />
      </label>
      <label style="display:block; margin-bottom: 14px; font-weight: 600; font-size: 0.95rem; color:#aac8ff;">
        Situation
        <textarea name="situation" rows="3" style="
          width: 100%;
          padding: 9px 12px;
          border-radius: 9px;
          border: 1.5px solid rgba(30,144,255,0.3);
          background: rgba(20,30,50,0.3);
          color: #d5e6ff;
          font-size: 1rem;
          resize: vertical;
          outline-offset: 2px;
        ">${esc(g.situation || "")}</textarea>
      </label>
      <div style="display:flex; gap: 10px;">
        <button type="button" class="btn btn-primary btn-sm" onclick="window.guestinfo.saveEdit('${id}')" style="flex-grow:1;">Save</button>
        <button type="button" class="btn btn-secondary btn-sm" onclick="window.guestinfo.cancelEdit('${id}')" style="flex-grow:1;">Cancel</button>
      </div>
    </form>
  </div>
  `;
}