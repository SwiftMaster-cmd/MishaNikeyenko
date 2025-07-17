// messages.js  -- Lightweight thread+chat overlay for Admin Dashboard
(() => {
  const ROLES = window.ROLES || { ME:"me", LEAD:"lead", DM:"dm", ADMIN:"admin" };

  /* ------------------------------------------------------------------
   * Local state
   * ------------------------------------------------------------------ */
  let _threads = {};          // {tid: threadObj}
  let _rtBound = false;
  let _currentUid  = null;
  let _currentRole = null;
  let _openThreadId = null;

  /* DOM ids */
  const IDS = {
    overlay:       "msgOverlay",
    panel:         "msgOverlayPanel",
    close:         "msgOverlayClose",
    listWrap:      "msgThreadList",
    viewWrap:      "msgThreadView",
    viewMsgs:      "msgMsgs",
    viewTitle:     "msgThreadTitle",
    viewBack:      "msgThreadBack",
    sendForm:      "msgSendForm",
    sendInput:     "msgInput",
    newBtn:        "msgNewBtn",
    newDlg:        "msgNewDlg",
    newDlgList:    "msgNewDlgList",
    newDlgCreate:  "msgNewDlgCreate",
    newDlgCancel:  "msgNewDlgCancel",
    badge:         "messagesBadge",
    headerBtn:     "messagesBtn"
  };

  /* ------------------------------------------------------------------
   * Helpers (roles)
   * ------------------------------------------------------------------ */
  const isAdmin = r => r === ROLES.ADMIN;
  const isDM    = r => r === ROLES.DM;
  const isLead  = r => r === ROLES.LEAD;
  const isMe    = r => r === ROLES.ME;

  /* Build "people around you" recipient set --------------------------------
     Returns array of user objects {uid, name, role} sorted by role weight then name.
  ------------------------------------------------------------------------- */
  function allowedRecipients(users, myUid, myRole) {
    const meRec = users[myUid] || {name:"Me",role:myRole};
    const out = new Map(); // uid->obj

    function add(uid){
      if(!uid || out.has(uid))return;
      const u = users[uid] || {name:uid,role:"?"};
      out.set(uid, {uid, name:u.name||u.email||uid, role:(u.role||"?").toLowerCase()});
    }

    add(myUid);

    if (isAdmin(myRole)) {
      for (const [uid,u] of Object.entries(users)) {
        if (uid===myUid) continue;
        add(uid);
      }
      return Array.from(out.values()).sort(recSort);
    }

    if (isDM(myRole)) {
      // All leads assignedDM==me
      const leads = Object.entries(users)
        .filter(([,u])=>u.role===ROLES.LEAD && u.assignedDM===myUid)
        .map(([uid])=>uid);
      leads.forEach(add);
      // All MEs under those leads
      Object.entries(users).forEach(([uid,u])=>{
        if(u.role===ROLES.ME && leads.includes(u.assignedLead)) add(uid);
      });
      // Admin(s) for escalation
      Object.entries(users).forEach(([uid,u])=>{
        if(u.role===ROLES.ADMIN) add(uid);
      });
      return Array.from(out.values()).sort(recSort);
    }

    if (isLead(myRole)) {
      // Myself
      add(myUid);
      // My DM
      const myRecord = users[myUid]||{};
      if (myRecord.assignedDM) add(myRecord.assignedDM);
      // Associates (ME) I lead
      Object.entries(users).forEach(([uid,u])=>{
        if(u.role===ROLES.ME && u.assignedLead===myUid) add(uid);
      });
      // Admin(s) optional escalate
      Object.entries(users).forEach(([uid,u])=>{
        if(u.role===ROLES.ADMIN) add(uid);
      });
      return Array.from(out.values()).sort(recSort);
    }

    // ME (associate)
    if (isMe(myRole)) {
      const myRecord = users[myUid]||{};
      // Myself
      add(myUid);
      // My lead
      if (myRecord.assignedLead) add(myRecord.assignedLead);
      // My lead's DM
      const leadRec = users[myRecord.assignedLead];
      if (leadRec && leadRec.assignedDM) add(leadRec.assignedDM);
      // Admin(s) (optional)
      Object.entries(users).forEach(([uid,u])=>{
        if(u.role===ROLES.ADMIN) add(uid);
      });
      return Array.from(out.values()).sort(recSort);
    }

    // fallback none
    return Array.from(out.values()).sort(recSort);
  }

  function recSort(a,b){
    const rank = {admin:0, dm:1, lead:2, me:3, "?":4};
    const ra = rank[a.role] ?? 10;
    const rb = rank[b.role] ?? 10;
    if (ra !== rb) return ra - rb;
    return (a.name||"").localeCompare(b.name||"");
  }

  function roleBadgeHtml(role){
    const r = (role||"").toLowerCase();
    const txt = r.toUpperCase();
    return `<span class="msg-role msg-role-${r}">${txt}</span>`;
  }

  /* ------------------------------------------------------------------
   * Overlay DOM bootstrap
   * ------------------------------------------------------------------ */
  function ensureOverlay(){
    let ov = document.getElementById(IDS.overlay);
    if (ov) return ov;
    ov = document.createElement("div");
    ov.id = IDS.overlay;
    ov.className = "msg-overlay hidden";
    ov.innerHTML = `
      <div id="${IDS.panel}" class="msg-panel">
        <header class="msg-panel-header">
          <span>Messages</span>
          <button type="button" id="${IDS.close}" aria-label="Close Messages">×</button>
        </header>
        <div class="msg-panel-body">
          <div id="${IDS.listWrap}" class="msg-thread-list"></div>
          <div id="${IDS.viewWrap}" class="msg-thread-view hidden">
            <div class="msg-thread-view-header">
              <button type="button" id="${IDS.viewBack}" aria-label="Back">&larr;</button>
              <span id="${IDS.viewTitle}" class="msg-thread-title"></span>
            </div>
            <div id="${IDS.viewMsgs}" class="msg-msgs"></div>
            <form id="${IDS.sendForm}" class="msg-send-form">
              <input id="${IDS.sendInput}" type="text" placeholder="Type a message…" autocomplete="off" />
              <button type="submit">Send</button>
            </form>
          </div>
        </div>
        <button type="button" id="${IDS.newBtn}" class="msg-new-btn" aria-label="New Message">+</button>
      </div>
      <div id="${IDS.newDlg}" class="msg-new-dlg hidden" role="dialog" aria-modal="true">
        <div class="msg-new-dlg-box">
          <h3>New Message</h3>
          <p>Select teammates:</p>
          <div id="${IDS.newDlgList}" class="msg-new-dlg-list"></div>
          <div class="msg-new-dlg-actions">
            <button type="button" id="${IDS.newDlgCancel}">Cancel</button>
            <button type="button" id="${IDS.newDlgCreate}" class="msg-new-dlg-create" disabled>Create</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(ov);

    // wire close
    document.getElementById(IDS.close).addEventListener("click",hideOverlay);
    ov.addEventListener("click",e=>{
      if(e.target===ov) hideOverlay(); // click backdrop
    });

    // wire new btn
    document.getElementById(IDS.newBtn).addEventListener("click",openNewDialog);
    document.getElementById(IDS.newDlgCancel).addEventListener("click",closeNewDialog);
    document.getElementById(IDS.newDlgCreate).addEventListener("click",createThreadFromDialog);

    // send form
    document.getElementById(IDS.sendForm).addEventListener("submit",handleSendMsg);
    document.getElementById(IDS.viewBack).addEventListener("click",()=>showThreadList());

    return ov;
  }

  function showOverlay(){
    ensureOverlay();
    document.getElementById(IDS.overlay).classList.remove("hidden");
    showThreadList();
  }
  function hideOverlay(){
    const ov=document.getElementById(IDS.overlay);
    if(ov)ov.classList.add("hidden");
    _openThreadId=null;
  }

  /* ------------------------------------------------------------------
   * New Thread dialog
   * ------------------------------------------------------------------ */
  function openNewDialog(){
    const dlg=document.getElementById(IDS.newDlg);
    if(!dlg)return;
    renderNewDialogList();
    dlg.classList.remove("hidden");
  }
  function closeNewDialog(){
    const dlg=document.getElementById(IDS.newDlg);
    if(dlg)dlg.classList.add("hidden");
  }
  function renderNewDialogList(){
    const listEl=document.getElementById(IDS.newDlgList);
    const myUid=_currentUid, myRole=_currentRole;
    const users=window._users||{};
    const recs=allowedRecipients(users,myUid,myRole)
      .filter(r=>r.uid!==myUid); // exclude self (auto added)
    listEl.innerHTML = recs.map(r=>{
      const id=`msg-new-chk-${r.uid}`;
      return `
      <label class="msg-new-opt">
        <input type="checkbox" id="${id}" data-uid="${r.uid}">
        ${roleBadgeHtml(r.role)} ${escapeHtml(r.name)}
      </label>`;
    }).join("");
    listEl.querySelectorAll("input[type=checkbox]").forEach(chk=>{
      chk.addEventListener("change",updateNewDialogCreateEnabled);
    });
    updateNewDialogCreateEnabled();
  }
  function updateNewDialogCreateEnabled(){
    const listEl=document.getElementById(IDS.newDlgList);
    const checked=listEl.querySelectorAll("input[type=checkbox]:checked").length;
    document.getElementById(IDS.newDlgCreate).disabled = checked===0;
  }
  async function createThreadFromDialog(){
    const listEl=document.getElementById(IDS.newDlgList);
    const checks=[...listEl.querySelectorAll("input[type=checkbox]:checked")];
    if(!checks.length)return;
    const participants={};
    const roles={};
    const users=window._users||{};
    participants[_currentUid]=true;
    roles[_currentUid]=(_currentRole||"").toLowerCase();
    checks.forEach(chk=>{
      const uid=chk.dataset.uid;
      participants[uid]=true;
      roles[uid]=(users[uid]?.role||"?").toLowerCase();
    });
    const now=Date.now();
    const newRef=window.db.ref("messages").push();
    const init = {
      participants,
      roles,
      unread:Object.fromEntries(Object.keys(participants).map(uid=>[uid, uid===_currentUid?0:1])),
      lastMsg:{
        fromUid:_currentUid,
        text:"(started a conversation)",
        ts:now
      },
      updatedAt:now
    };
    await newRef.set(init);
    // Add a system "started" message
    await newRef.child("msgs").push({
      fromUid:_currentUid,
      text:"Started the conversation.",
      ts:now
    });
    closeNewDialog();
    openThread(newRef.key);
  }

  /* ------------------------------------------------------------------
   * Thread List rendering
   * ------------------------------------------------------------------ */
  function showThreadList(){
    _openThreadId=null;
    const listWrap=document.getElementById(IDS.listWrap);
    const viewWrap=document.getElementById(IDS.viewWrap);
    if(listWrap)listWrap.classList.remove("hidden");
    if(viewWrap)viewWrap.classList.add("hidden");
    renderThreadList();
  }
  function renderThreadList(){
    const wrap=document.getElementById(IDS.listWrap);
    if(!wrap)return;
    const threads = Object.entries(_threads)
      .filter(([,t])=>t.participants && t.participants[_currentUid])
      .sort((a,b)=>(b[1].updatedAt||0)-(a[1].updatedAt||0));

    if(!threads.length){
      wrap.innerHTML = `<div class="msg-none">No messages yet.</div>`;
      return;
    }

    const html=threads.map(([tid,t])=>{
      const {label,unreadCount} = threadLabelAndUnread(tid,t);
      const last = t.lastMsg?.text || '';
      const ts   = t.lastMsg?.ts ? new Date(t.lastMsg.ts).toLocaleString() : '';
      return `
        <div class="msg-thread-row" data-tid="${tid}">
          <div class="msg-thread-row-top">
            <span class="msg-thread-label">${escapeHtml(label)}</span>
            ${unreadCount>0?`<span class="msg-unread-pill">${unreadCount}</span>`:""}
          </div>
          <div class="msg-thread-row-snippet">${escapeHtml(last)}</div>
          <div class="msg-thread-row-ts">${escapeHtml(ts)}</div>
        </div>`;
    }).join("");
    wrap.innerHTML = html;
    // click handlers
    wrap.querySelectorAll(".msg-thread-row").forEach(row=>{
      row.addEventListener("click",()=>openThread(row.dataset.tid));
    });
  }

  function threadLabelAndUnread(tid,t){
    const users=window._users||{};
    const p = t.participants||{};
    const names = Object.keys(p)
      .filter(uid=>uid!==_currentUid)
      .map(uid=>users[uid]?.name||users[uid]?.email||uid);
    const label = names.length ? names.join(", ") : "Me";
    const unreadCount = (t.unread && typeof t.unread[_currentUid]==="number") ? t.unread[_currentUid] : 0;
    return {label, unreadCount};
  }

  /* ------------------------------------------------------------------
   * Thread View
   * ------------------------------------------------------------------ */
  function openThread(tid){
    _openThreadId = tid;
    const listWrap=document.getElementById(IDS.listWrap);
    const viewWrap=document.getElementById(IDS.viewWrap);
    if(listWrap)listWrap.classList.add("hidden");
    if(viewWrap)viewWrap.classList.remove("hidden");

    const t=_threads[tid]||{};
    const {label} = threadLabelAndUnread(tid,t);
    const titleEl=document.getElementById(IDS.viewTitle);
    if(titleEl)titleEl.textContent=label;

    // mark read
    markThreadRead(tid);

    renderThreadMsgs(tid);
  }

  function renderThreadMsgs(tid){
    const wrap=document.getElementById(IDS.viewMsgs);
    if(!wrap)return;
    const t=_threads[tid];
    if(!t){ wrap.innerHTML=`<div class="msg-none">Thread not found.</div>`; return; }
    const msgs=t.msgs?Object.entries(t.msgs):[];
    msgs.sort((a,b)=>(a[1].ts||0)-(b[1].ts||0));
    const html=msgs.map(([mid,m])=>{
      const mine = m.fromUid===_currentUid;
      const users=window._users||{};
      const who  = users[m.fromUid]?.name || users[m.fromUid]?.email || m.fromUid;
      const ts   = m.ts ? new Date(m.ts).toLocaleTimeString() : "";
      return `
        <div class="msg-bubble-wrap ${mine?'mine':'theirs'}">
          <div class="msg-bubble">
            ${!mine?`<div class="msg-bubble-who">${escapeHtml(who)}</div>`:""}
            <div class="msg-bubble-text">${escapeHtml(m.text)}</div>
            <div class="msg-bubble-ts">${escapeHtml(ts)}</div>
          </div>
        </div>`;
    }).join("");
    wrap.innerHTML = html;
    // auto-scroll bottom
    wrap.scrollTop = wrap.scrollHeight;
  }

  /* ------------------------------------------------------------------
   * Send message
   * ------------------------------------------------------------------ */
  async function handleSendMsg(e){
    e.preventDefault();
    if(!_openThreadId)return;
    const inp=document.getElementById(IDS.sendInput);
    const txt=(inp?.value||"").trim();
    if(!txt)return;
    const tid=_openThreadId;
    const now=Date.now();
    // write msg
    const msgRef=window.db.ref(`messages/${tid}/msgs`).push();
    await msgRef.set({
      fromUid:_currentUid,
      text:txt,
      ts:now
    });

    // update lastMsg + unread increments
    const t=_threads[tid]||{};
    const p=t.participants||{};
    const updates={};
    updates[`messages/${tid}/lastMsg`] = {fromUid:_currentUid,text:txt,ts:now};
    updates[`messages/${tid}/updatedAt`] = now;
    for(const uid in p){
      if(uid===_currentUid){
        updates[`messages/${tid}/unread/${uid}`]=0;
      }else{
        const prev=(t.unread&&t.unread[uid])||0;
        updates[`messages/${tid}/unread/${uid}`]=prev+1;
      }
    }
    await window.db.ref().update(updates);

    inp.value="";
  }

  /* ------------------------------------------------------------------
   * Mark thread read
   * ------------------------------------------------------------------ */
  async function markThreadRead(tid){
    const path=`messages/${tid}/unread/${_currentUid}`;
    await window.db.ref(path).set(0);
  }

  /* ------------------------------------------------------------------
   * Unread total -> header badge
   * ------------------------------------------------------------------ */
  function updateHeaderUnread(){
    const badge=document.getElementById(IDS.badge);
    if(!badge)return;
    let sum=0;
    for(const t of Object.values(_threads)){
      const n=t.unread && typeof t.unread[_currentUid]==="number" ? t.unread[_currentUid] : 0;
      sum += n;
    }
    if(sum>0){
      badge.textContent = sum>99? "99+" : String(sum);
      badge.classList.remove("hidden");
    }else{
      badge.textContent="0";
      badge.classList.add("hidden");
    }
  }

  /* ------------------------------------------------------------------
   * Realtime bind
   * We listen to /messages once we have a user; we *filter client-side* to
   * only keep threads where current user participates (cheap; scale low).
   * ------------------------------------------------------------------ */
  function ensureRealtime(){
    if(_rtBound)return;
    _rtBound=true;
    const ref=window.db.ref("messages");
    ref.on("child_added",snap=>{
      const tid=snap.key, val=snap.val();
      if(val.participants && val.participants[_currentUid]){
        _threads[tid]=val;
        updateHeaderUnread();
        if(!_openThreadId) renderThreadList();
      }
    });
    ref.on("child_changed",snap=>{
      const tid=snap.key, val=snap.val();
      if(val.participants && val.participants[_currentUid]){
        _threads[tid]=val;
        updateHeaderUnread();
        if(_openThreadId===tid){
          renderThreadMsgs(tid);
        }else{
          renderThreadList();
        }
      }else{
        delete _threads[tid];
        updateHeaderUnread();
        renderThreadList();
      }
    });
    ref.on("child_removed",snap=>{
      const tid=snap.key;
      delete _threads[tid];
      updateHeaderUnread();
      renderThreadList();
    });
  }

  /* ------------------------------------------------------------------
   * Public init (called by admin.js after auth + initial data load)
   * ------------------------------------------------------------------ */
  function initMessages(uid,role){
    _currentUid=uid;
    _currentRole=(role||"").toLowerCase();
    ensureOverlay(); // build once
    // header button
    const btn=document.getElementById(IDS.headerBtn);
    if(btn && !btn._msgWired){
      btn._msgWired=true;
      btn.addEventListener("click",showOverlay);
    }
    ensureRealtime();
  }

  /* ------------------------------------------------------------------
   * Escape (HTML)
   * ------------------------------------------------------------------ */
  function escapeHtml(str){
    return (str==null?"":String(str))
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;")
      .replace(/'/g,"&#39;");
  }

  /* ------------------------------------------------------------------
   * Export
   * ------------------------------------------------------------------ */
  window.messages = {
    initMessages,
    allowedRecipients,
    open: showOverlay,
    close: hideOverlay
  };
})();