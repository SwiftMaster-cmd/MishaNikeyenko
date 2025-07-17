/* ========================================================================
   messages.js
   Lightweight role-scoped messaging overlay for OSL Admin Dashboard.
   ------------------------------------------------------------------------
   Data Model:
     messages
       {tid}
         title: <string optional>
         participants/{uid}: true
         unread/{uid}: <number>
         lastMsg: { fromUid, text, ts }
         updatedAt: <ms>
         msgs/{msgid}: { fromUid, text, ts }
   ------------------------------------------------------------------------
   Integration: dashboard.js calls messages.init(uid, role) & .setBadgeEl(el).
   You must include a header button with id="messagesBtn" + span#messagesBadge.
   ===================================================================== */

(function(){
  "use strict";

  /* --------------------------------------------------------------------
   * Config
   * ------------------------------------------------------------------ */
  const CFG = {
    MAX_MSG_LEN: 4000,
    ALLOW_ME_RENAME_THREAD: false   // set true to let associates rename
  };

  const ROLES = window.ROLES || { ME:"me", LEAD:"lead", DM:"dm", ADMIN:"admin" };

  /* --------------------------------------------------------------------
   * Firebase handles (we rely on dashboard.js to have booted)
   * ------------------------------------------------------------------ */
  const db   = (window.db   ? window.db   : firebase.database());
  const auth = (window.auth ? window.auth : firebase.auth());

  /* --------------------------------------------------------------------
   * Local state
   * ------------------------------------------------------------------ */
  let currentUid   = null;
  let currentRole  = ROLES.ME;
  let threadsCache = {};      // tid -> thread obj (live)
  let msgsCache    = {};      // tid -> {msgid:msg}
  let overlayOpen  = false;
  let activeThreadId = null;

  /* search filter state */
  let _filterTerm = "";

  /* new-thread modal cache */
  let _newModal = null;

  /* add-people modal cache */
  let _addModal = null;

  /* rename modal */
  let _renameModal = null;

  /* header badge element (optional from dashboard) */
  let _badgeEl = null;

  /* throttle re-render */
  let _renderTO = null;
  function scheduleRender(delay=10){
    if(!_renderTO){
      _renderTO = setTimeout(()=>{
        _renderTO = null;
        if(overlayOpen) renderOverlay();
        refreshHeaderBadge();
      },delay);
    }
  }

  /* --------------------------------------------------------------------
   * INIT (called by dashboard.js after auth + initial load)
   * Safe to call multiple times; rebinds if uid changes.
   * ------------------------------------------------------------------ */
  let _threadsBound = false;
  function init(uid, role){
    if (!uid) return;
    const roleLower = (role||ROLES.ME).toLowerCase();
    const uidChanged  = (currentUid !== uid);
    const roleChanged = (currentRole !== roleLower);

    currentUid  = uid;
    currentRole = roleLower;

    if (uidChanged) {
      // clear caches if user changed
      threadsCache = {};
      msgsCache    = {};
      _threadsBound = false; // rebind for new user
    }

    bindThreadsRealtime(); // idempotent
    scheduleRender();
  }

  /* Called by dashboard to hand us the badge span */
  function setBadgeEl(el){
    _badgeEl = el;
    refreshHeaderBadge();
  }

  /* --------------------------------------------------------------------
   * Realtime listeners
   * ------------------------------------------------------------------ */
  function bindThreadsRealtime(){
    if(_threadsBound || !currentUid) return;
    _threadsBound = true;
    const ref = db.ref("messages");

    ref.on("child_added",   snap => handleThreadSnap(snap));
    ref.on("child_changed", snap => handleThreadSnap(snap));
    ref.on("child_removed", snap => {
      delete threadsCache[snap.key];
      delete msgsCache[snap.key];
      if(activeThreadId === snap.key) activeThreadId = null;
      scheduleRender();
    });
  }

  function handleThreadSnap(snap){
    const tid  = snap.key;
    const data = snap.val();

    // If security denied read, snap.val() may be null; ignore.
    if(!data) return;

    // Participant gating: If thread doesn't include me (and I'm not Admin), skip.
    if (currentRole !== ROLES.ADMIN) {
      const parts = data.participants || {};
      if (!parts[currentUid]) return;
    }

    threadsCache[tid] = data;

    // Bind msgs subfeed if not yet
    if(!msgsCache[tid]) bindMsgsRealtime(tid);

    scheduleRender();
  }

  function bindMsgsRealtime(tid){
    const ref = db.ref("messages/"+tid+"/msgs");
    msgsCache[tid] = msgsCache[tid] || {};
    ref.on("child_added", snap=>{
      msgsCache[tid][snap.key]=snap.val();
      scheduleRender();
    });
    ref.on("child_changed", snap=>{
      msgsCache[tid][snap.key]=snap.val();
      scheduleRender();
    });
    ref.on("child_removed", snap=>{
      delete msgsCache[tid][snap.key];
      scheduleRender();
    });
  }

  /* --------------------------------------------------------------------
   * Badge / unread
   * ------------------------------------------------------------------ */
  function unreadTotal(){
    let sum = 0;
    Object.values(threadsCache).forEach(t=>{
      const n = t.unread && typeof t.unread[currentUid] === "number" ? t.unread[currentUid] : 0;
      sum += n;
    });
    return sum;
  }

  function refreshHeaderBadge(){
    const n = unreadTotal();

    /* prefer dashboard helper if present */
    if (typeof window.updateMessagesBadge === "function"){
      window.updateMessagesBadge(n);
    }

    /* local fallback */
    if(_badgeEl){
      _badgeEl.textContent = n>0 ? String(n) : "";
      _badgeEl.style.display = n>0 ? "" : "none";
    }
  }

  /* --------------------------------------------------------------------
   * Overlay creation / teardown
   * ------------------------------------------------------------------ */
  function ensureOverlay(){
    let ov = document.getElementById("msg-overlay");
    if(ov) return ov;
    ov = document.createElement("div");
    ov.id = "msg-overlay";
    ov.className = "msg-overlay hidden";
    ov.innerHTML = `
      <div class="msg-overlay-backdrop" data-close="1"></div>
      <div class="msg-overlay-panel" role="dialog" aria-modal="true">
        <header class="msg-overlay-header">
          <h3>Messages</h3>
          <input type="text" id="msg-search" placeholder="Search…" class="msg-overlay-search" />
          <button type="button" class="msg-overlay-close" data-close="1" aria-label="Close">×</button>
        </header>
        <div class="msg-overlay-body">
          <!-- thread list + active thread injected -->
        </div>
        <button type="button" class="msg-overlay-new" title="New Message" data-new="1">＋</button>
      </div>
    `;
    document.body.appendChild(ov);

    /* event delegation */
    ov.addEventListener("click", (e)=>{
      if (e.target.dataset.close) { closeOverlay(); }
      else if (e.target.dataset.new) { openNewThreadModal(); }
    });
    const searchEl = ov.querySelector("#msg-search");
    if (searchEl){
      searchEl.addEventListener("input", ()=>{
        _filterTerm = searchEl.value.trim().toLowerCase();
        renderOverlay(); // immediate filter
      });
    }
    return ov;
  }

  function openOverlay(){
    const ov = ensureOverlay();
    ov.classList.remove("hidden");
    overlayOpen = true;
    renderOverlay();
    markAllViewed(); // zero unread for me
  }
  function closeOverlay(){
    const ov = ensureOverlay();
    ov.classList.add("hidden");
    overlayOpen = false;
    _filterTerm = "";
  }

  /* --------------------------------------------------------------------
   * Render overlay
   * ------------------------------------------------------------------ */
  function renderOverlay(){
    const ov = ensureOverlay();
    const body = ov.querySelector(".msg-overlay-body");
    if(!body) return;

    // Sync search input (if we reopened or changed)
    const searchEl = ov.querySelector("#msg-search");
    if (searchEl && searchEl.value.trim().toLowerCase() !== _filterTerm){
      searchEl.value = _filterTerm;
    }

    const threadEntries = Object.entries(threadsCache)
      .sort((a,b)=>(b[1].updatedAt||0)-(a[1].updatedAt||0))
      .filter(([tid,t])=>{
        if(!_filterTerm) return true;
        const title = threadTitle(tid, t).toLowerCase();
        const last  = (t.lastMsg?.text||"").toLowerCase();
        return title.includes(_filterTerm) || last.includes(_filterTerm);
      });

    const threadListHtml = threadEntries.map(([tid,t])=>{
      const title = threadTitle(tid, t);
      const last  = t.lastMsg ? shortText(t.lastMsg.text, 60) : "(no messages)";
      const unread = t.unread && t.unread[currentUid] ? t.unread[currentUid] : 0;
      const activeCls = (tid===activeThreadId)?"active":"";
      return `
        <div class="msg-thread-tile ${activeCls}" data-tid="${tid}">
          <div class="msg-thread-top">
            <span class="msg-thread-names">${esc(title)}</span>
            ${unread?`<span class="msg-thread-unread">${unread}</span>`:""}
          </div>
          <div class="msg-thread-last">${esc(last)}</div>
        </div>`;
    }).join("");

    // Active thread content
    let threadMsgsHtml = "";
    if(activeThreadId && threadsCache[activeThreadId]){
      const thread = threadsCache[activeThreadId];
      const msgs   = msgsCache[activeThreadId];
      threadMsgsHtml = renderActiveThread(thread, msgs);
    } else {
      threadMsgsHtml = `<div class="msg-no-thread">Select a thread, or tap ＋ to start one.</div>`;
    }

    body.innerHTML = `
      <div class="msg-threads-col">
        ${threadListHtml || '<div class="msg-no-threads">(No threads)</div>'}
      </div>
      <div class="msg-active-col">
        ${threadMsgsHtml}
      </div>
    `;

    /* click to change active thread (delegate) */
    body.querySelector(".msg-threads-col")?.addEventListener("click", threadTileClickOnce);

    /* send form events wired inside renderActiveThread */
    wireActiveThreadControls();

    /* scroll to bottom */
    const box = body.querySelector("#msg-thread-active-messages");
    if(box) box.scrollTop = box.scrollHeight;
  }

  function threadTileClickOnce(e){
    const tile = e.target.closest("[data-tid]");
    if(!tile) return;
    setActiveThread(tile.dataset.tid);
  }

  function renderActiveThread(thread, msgsObj){
    const tid = activeThreadId;
    if (!msgsObj) {
      // We haven't yet received msgs feed -> spinner
      return `
        <div class="msg-thread-active" data-tid="${tid}">
          <div class="msg-thread-active-header">${esc(threadTitle(tid,thread))}</div>
          <div class="msg-thread-active-messages msg-thread-loading" id="msg-thread-active-messages">
            Loading messages…
          </div>
        </div>`;
    }

    const sorted = Object.entries(msgsObj).sort((a,b)=>(a[1].ts||0)-(b[1].ts||0));

    const canRename = canRenameThread();
    const canAdd    = canAddPeople();

    return `
      <div class="msg-thread-active" data-tid="${tid}">
        <div class="msg-thread-active-header">
          <span class="msg-thread-title">${esc(threadTitle(tid,thread))}</span>
          ${canRename?`<button type="button" class="msg-thread-rename-btn" title="Rename" data-rename="1">✎</button>`:""}
          ${canAdd?`<button type="button" class="msg-thread-add-btn" title="Add People" data-add="1">＋</button>`:""}
        </div>
        <div class="msg-thread-active-messages" id="msg-thread-active-messages">
          ${sorted.map(([mid,m])=>renderMsgBubble(m)).join("")}
        </div>
        <form class="msg-send-form" id="msg-send-form">
          <textarea id="msg-send-input" rows="1" placeholder="Type a message… (Enter to send, Shift+Enter = newline)" autocomplete="off"></textarea>
          <button type="submit">Send</button>
        </form>
      </div>`;
  }

  function wireActiveThreadControls(){
    const activeCol = document.querySelector(".msg-active-col");
    if(!activeCol) return;

    /* send form */
    const form = activeCol.querySelector("#msg-send-form");
    const input= activeCol.querySelector("#msg-send-input");
    if(form){
      form.addEventListener("submit", sendActiveThreadMsg);
    }
    if(input){
      input.addEventListener("keydown", e=>{
        if(e.key==="Enter" && !e.shiftKey){
          e.preventDefault();
          form?.dispatchEvent(new Event("submit", {cancelable:true}));
        }
      });
      // auto-grow
      input.addEventListener("input", autoGrowTextarea);
      autoGrowTextarea({target:input});
    }

    const renameBtn = activeCol.querySelector("[data-rename]");
    if(renameBtn){
      renameBtn.addEventListener("click", ()=>openRenameThreadModal(activeThreadId));
    }
    const addBtn = activeCol.querySelector("[data-add]");
    if(addBtn){
      addBtn.addEventListener("click", ()=>openAddPeopleModal(activeThreadId));
    }
  }

  function autoGrowTextarea(e){
    const ta = e.target;
    if(!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  }

  function renderMsgBubble(m){
    const isMe = m.fromUid === currentUid;
    const when = m.ts ? new Date(m.ts) : null;
    const whenShort = when ? when.toLocaleString() : "";
    const whenFull  = when ? when.toISOString() : "";
    return `
      <div class="msg-bubble ${isMe?'me':'them'}" title="${esc(whenFull)}">
        <div class="msg-bubble-text">${escMulti(m.text)}</div>
        <div class="msg-bubble-meta">${esc(whenShort)}</div>
      </div>`;
  }

  /* Convert \n to <br> but preserve escaping */
  function escMulti(str){
    return esc(str).replace(/\n/g,"<br>");
  }

  /* --------------------------------------------------------------------
   * Text helpers
   * ------------------------------------------------------------------ */
  function esc(str){ return (str||"").toString().replace(/[&<>"]/g,s=>({ "&":"&amp;","<":"&lt;",">":"&gt;" }[s]||"")); }
  function shortText(str,max){ str=str||""; return str.length>max?str.slice(0,max-1)+"…":str; }

  /* Title fallback */
  function threadTitle(tid, t){
    if (t?.title) return t.title;
    return participantsHuman(t?.participants||{});
  }

  function participantsHuman(partMap){
    const users = window._users || {};
    const names = [];
    Object.keys(partMap||{}).forEach(uid=>{
      const u = users[uid];
      names.push(u?.name || u?.email || displayUid(uid));
    });
    return names.join(", ");
  }

  function displayUid(uid){
    return uid.slice(0,6)+"…";
  }

  /* --------------------------------------------------------------------
   * Thread selection
   * ------------------------------------------------------------------ */
  function setActiveThread(tid){
    if(!threadsCache[tid]) return;
    activeThreadId = tid;
    // reset unread for me
    const ref = db.ref(`messages/${tid}/unread/${currentUid}`);
    ref.set(0);
    scheduleRender();
  }

  /* --------------------------------------------------------------------
   * Send message in active thread
   * ------------------------------------------------------------------ */
  async function sendActiveThreadMsg(evt){
    evt.preventDefault();
    const input = document.getElementById("msg-send-input");
    if(!input) return false;
    const raw = input.value;
    const text = sanitizeMsg(raw);
    if(!text) return false;

    const tid  = activeThreadId;
    if(!tid || !threadsCache[tid]) return false;
    input.value = "";
    autoGrowTextarea({target:input});

    await sendMessage(tid, text);
    return false;
  }

  function sanitizeMsg(str){
    str = (str||"").trim();
    if(!str) return "";
    if(str.length > CFG.MAX_MSG_LEN){
      str = str.slice(0, CFG.MAX_MSG_LEN);
    }
    return str;
  }

  /* --------------------------------------------------------------------
   * Create / send message
   * ------------------------------------------------------------------ */
  async function sendMessage(tid, text){
    const now = Date.now();
    const msgRef = db.ref(`messages/${tid}/msgs`).push();
    await msgRef.set({
      fromUid: currentUid,
      text,
      ts: now
    });

    // update lastMsg + updatedAt; unread increments
    const updates = {};
    updates[`messages/${tid}/lastMsg`]   = { fromUid: currentUid, text, ts: now };
    updates[`messages/${tid}/updatedAt`] = now;

    const t = threadsCache[tid] || {};
    const parts = t.participants || {};
    Object.keys(parts).forEach(uid=>{
      if(uid === currentUid){
        updates[`messages/${tid}/unread/${uid}`] = 0;
      }else{
        // safest is server increment; fall back to cached + 1 if rules don't allow increment
        updates[`messages/${tid}/unread/${uid}`] = firebase.database.ServerValue.increment ? firebase.database.ServerValue.increment(1)
                                                                                           : ((t.unread?.[uid]||0)+1);
      }
    });

    await db.ref().update(updates);
  }

  /* --------------------------------------------------------------------
   * Mark all threads as viewed when overlay opens
   * ------------------------------------------------------------------ */
  function markAllViewed(){
    const up = {};
    Object.entries(threadsCache).forEach(([tid,t])=>{
      if(t.unread && t.unread[currentUid]){
        up[`messages/${tid}/unread/${currentUid}`] = 0;
      }
    });
    if(Object.keys(up).length) db.ref().update(up);
  }

  /* --------------------------------------------------------------------
   * New Thread Modal
   * ------------------------------------------------------------------ */
  function openNewThreadModal(){
    const users = window._users || {};
    const opts  = buildEligibleRecipients(users,currentUid,currentRole);
    if(!_newModal) _newModal = buildNewModal();
    populateNewModal(_newModal, opts);
    _newModal.classList.remove("hidden");
  }
  function closeNewThreadModal(){
    if(_newModal) _newModal.classList.add("hidden");
  }

  function buildNewModal(){
    const m = document.createElement("div");
    m.id = "msg-new-modal";
    m.className = "msg-new-modal hidden";
    m.innerHTML = `
      <div class="msg-new-backdrop" data-close="1"></div>
      <div class="msg-new-panel">
        <h4>New Message</h4>
        <label class="msg-new-title-lbl">Title (optional)
          <input type="text" id="msg-new-title" maxlength="120" placeholder="Thread title…" />
        </label>
        <div id="msg-new-list"></div>
        <textarea id="msg-new-text" rows="3" placeholder="Message…"></textarea>
        <div class="msg-new-actions">
          <button type="button" data-close="1">Cancel</button>
          <button type="button" class="msg-new-send" data-send="1">Send</button>
        </div>
      </div>`;
    document.body.appendChild(m);

    /* events */
    m.addEventListener("click",(e)=>{
      if(e.target.dataset.close){ closeNewThreadModal(); }
      else if(e.target.dataset.send){ sendNewThread(); }
    });

    return m;
  }

  function populateNewModal(modal, opts){
    if(!modal) return;
    const list = modal.querySelector("#msg-new-list");
    if(list){
      list.innerHTML = opts.map(o=>`
        <label class="msg-new-opt">
          <input type="checkbox" value="${o.uid}" />
          ${esc(o.label)}
        </label>`).join("");
    }
    const txt = modal.querySelector("#msg-new-text");
    if(txt) txt.value="";
    const titleEl = modal.querySelector("#msg-new-title");
    if(titleEl) titleEl.value="";
  }

  function buildEligibleRecipients(users, uid, role){
    const arr = [];
    const me = users?.[uid];

    if(!users) return arr;

    if(role === ROLES.ADMIN){
      Object.entries(users).forEach(([id,u])=>{
        if(id===uid) return;
        arr.push({uid:id,label:(u.name||u.email||id)+" ("+u.role+")"});
      });
      return arr;
    }

    if(role === ROLES.DM){
      const leads = Object.entries(users).filter(([,u])=>u.role===ROLES.LEAD && u.assignedDM===uid);
      const leadIds = leads.map(([lid])=>lid);
      const mes   = Object.entries(users).filter(([,u])=>u.role===ROLES.ME && leadIds.includes(u.assignedLead));
      leads.forEach(([id,u])=>arr.push({uid:id,label:(u.name||u.email||id)+" (Lead)"}));
      mes.forEach(([id,u])=>arr.push({uid:id,label:(u.name||u.email||id)+" (Associate)"}));
      return arr;
    }

    if(role === ROLES.LEAD){
      // my DM
      Object.entries(users).forEach(([id,u])=>{
        if(u.role===ROLES.DM && me?.assignedDM===id){
          arr.push({uid:id,label:(u.name||u.email||id)+" (DM)"});
        }
      });
      // my MEs
      Object.entries(users).forEach(([id,u])=>{
        if(u.role===ROLES.ME && u.assignedLead===uid){
          arr.push({uid:id,label:(u.name||u.email||id)});
        }
      });
      return arr;
    }

    // ME: my Lead + my Lead's DM (if any)
    Object.entries(users).forEach(([id,u])=>{
      if(u.role===ROLES.LEAD && me?.assignedLead===id){
        arr.push({uid:id,label:(u.name||u.email||id)+" (Lead)"});
        // also DM over that lead?
        const dmUid = u.assignedDM;
        if(dmUid && users[dmUid]){
          const dm = users[dmUid];
          arr.push({uid:dmUid,label:(dm.name||dm.email||dmUid)+" (DM)"});
        }
      }
    });
    return arr;
  }

  async function sendNewThread(){
    const modal = _newModal || document.getElementById("msg-new-modal");
    if(!modal) return;
    const checkEls = [...modal.querySelectorAll('input[type="checkbox"]:checked')];
    if(!checkEls.length){ alert("Select at least one recipient."); return; }
    const textEl = modal.querySelector("#msg-new-text");
    const titleEl= modal.querySelector("#msg-new-title");
    const rawText   = textEl?.value || "";
    const rawTitle  = titleEl?.value || "";
    const text      = sanitizeMsg(rawText);
    const title     = rawTitle.trim().slice(0,120); // safe

    if(!text){ alert("Enter a message."); return; }

    const now = Date.now();
    const parts = {};
    parts[currentUid] = true;
    checkEls.forEach(ch=>{ parts[ch.value] = true; });

    // Reuse existing thread if exact same participant set (ignore order)
    const existingTid = findThreadWithParticipants(parts);
    let tid;
    if(existingTid){
      tid = existingTid;
    }else{
      const tRef = db.ref("messages").push();
      tid = tRef.key;

      const unread = {};
      Object.keys(parts).forEach(uid=>{
        unread[uid] = (uid===currentUid?0:1); // others unread 1 (first msg)
      });

      const base = {
        participants: parts,
        unread,
        updatedAt: now,
        lastMsg: { fromUid: currentUid, text, ts: now }
      };
      if(title) base.title = title;

      await db.ref("messages/"+tid).set(base);
    }

    // push msg (for reused thread we still send)
    await db.ref(`messages/${tid}/msgs`).push({
      fromUid: currentUid,
      text,
      ts: now
    });

    if(existingTid){
      // need to update lastMsg & unread increments
      await db.ref().update({
        [`messages/${tid}/lastMsg`]: { fromUid: currentUid, text, ts: now },
        [`messages/${tid}/updatedAt`]: now
      });
    }

    // Show new/used thread
    activeThreadId = tid;
    closeNewThreadModal();
    openOverlay();
  }

  function findThreadWithParticipants(partsObj){
    const want = Object.keys(partsObj).sort().join(",");
    for(const [tid,t] of Object.entries(threadsCache)){
      const have = Object.keys(t.participants||{}).sort().join(",");
      if(have===want) return tid;
    }
    return null;
  }

  /* --------------------------------------------------------------------
   * Add People to thread
   * ------------------------------------------------------------------ */
  function openAddPeopleModal(tid){
    const thread = threadsCache[tid];
    if(!thread) return;
    const users = window._users || {};
    const eligible = buildEligibleRecipients(users,currentUid,currentRole)
      .filter(o=>!thread.participants?.[o.uid]); // only non-members
    if(!eligible.length){ alert("No additional eligible recipients."); return; }
    if(!_addModal) _addModal = buildAddModal();
    populateAddModal(_addModal,tid,eligible);
    _addModal.classList.remove("hidden");
  }
  function closeAddPeopleModal(){
    if(_addModal) _addModal.classList.add("hidden");
  }
  function buildAddModal(){
    const m = document.createElement("div");
    m.id = "msg-add-modal";
    m.className = "msg-add-modal hidden";
    m.innerHTML = `
      <div class="msg-add-backdrop" data-close="1"></div>
      <div class="msg-add-panel">
        <h4>Add People</h4>
        <div id="msg-add-list"></div>
        <div class="msg-add-actions">
          <button type="button" data-close="1">Cancel</button>
          <button type="button" class="msg-add-send" data-add="1">Add</button>
        </div>
      </div>`;
    document.body.appendChild(m);

    m.addEventListener("click",(e)=>{
      if(e.target.dataset.close){ closeAddPeopleModal(); }
      else if(e.target.dataset.add){ addSelectedPeopleToThread(); }
    });

    return m;
  }
  function populateAddModal(m,tid,opts){
    if(!m) return;
    m.dataset.tid = tid;
    const list = m.querySelector("#msg-add-list");
    if(list){
      list.innerHTML = opts.map(o=>`
        <label class="msg-add-opt">
          <input type="checkbox" value="${o.uid}" />
          ${esc(o.label)}
        </label>`).join("");
    }
  }
  async function addSelectedPeopleToThread(){
    const m = _addModal || document.getElementById("msg-add-modal");
    if(!m) return;
    const tid = m.dataset.tid;
    const thread = threadsCache[tid];
    if(!thread) return;

    const checked = [...m.querySelectorAll('input[type="checkbox"]:checked')];
    if(!checked.length){ closeAddPeopleModal(); return; }

    const up={};
    checked.forEach(ch=>{
      const uid = ch.value;
      up[`messages/${tid}/participants/${uid}`] = true;
      up[`messages/${tid}/unread/${uid}`] = 1;  // unread first msg
    });
    up[`messages/${tid}/updatedAt`] = Date.now();

    await db.ref().update(up);
    closeAddPeopleModal();
    scheduleRender();
  }

  function canAddPeople(){
    if(currentRole===ROLES.ADMIN) return true;
    if(currentRole===ROLES.DM) return true;
    if(currentRole===ROLES.LEAD) return true;
    return false; // ME can't add
  }

  /* --------------------------------------------------------------------
   * Rename Thread
   * ------------------------------------------------------------------ */
  function canRenameThread(){
    if(currentRole===ROLES.ADMIN) return true;
    if(currentRole===ROLES.DM) return true;
    if(currentRole===ROLES.LEAD) return true;
    return CFG.ALLOW_ME_RENAME_THREAD;
  }
  function openRenameThreadModal(tid){
    const thread = threadsCache[tid];
    if(!thread) return;
    if(!_renameModal) _renameModal = buildRenameModal();
    populateRenameModal(_renameModal, tid, thread.title||"");
    _renameModal.classList.remove("hidden");
  }
  function closeRenameThreadModal(){
    if(_renameModal) _renameModal.classList.add("hidden");
  }
  function buildRenameModal(){
    const m = document.createElement("div");
    m.id = "msg-rename-modal";
    m.className = "msg-rename-modal hidden";
    m.innerHTML = `
      <div class="msg-rename-backdrop" data-close="1"></div>
      <div class="msg-rename-panel">
        <h4>Rename Thread</h4>
        <input type="text" id="msg-rename-input" maxlength="120" />
        <div class="msg-rename-actions">
          <button type="button" data-close="1">Cancel</button>
          <button type="button" class="msg-rename-save" data-save="1">Save</button>
        </div>
      </div>`;
    document.body.appendChild(m);
    m.addEventListener("click",(e)=>{
      if(e.target.dataset.close){ closeRenameThreadModal(); }
      else if(e.target.dataset.save){ saveRenameThread(); }
    });
    return m;
  }
  function populateRenameModal(m,tid,title){
    if(!m) return;
    m.dataset.tid = tid;
    const inp = m.querySelector("#msg-rename-input");
    if(inp){
      inp.value = title;
      setTimeout(()=>inp.focus(),50);
    }
  }
  async function saveRenameThread(){
    const m = _renameModal || document.getElementById("msg-rename-modal");
    if(!m) return;
    const tid = m.dataset.tid;
    const inp = m.querySelector("#msg-rename-input");
    const title = (inp?.value||"").trim().slice(0,120);
    await db.ref(`messages/${tid}/title`).set(title);
    await db.ref(`messages/${tid}/updatedAt`).set(Date.now());
    closeRenameThreadModal();
    scheduleRender();
  }

  /* --------------------------------------------------------------------
   * Public API
   * ------------------------------------------------------------------ */
  window.messages = {
    init,
    setBadgeEl,
    openOverlay,
    closeOverlay,
    setActiveThread,
    sendActiveThreadMsg,
    openNewThreadModal,
    closeNewThreadModal,
    sendNewThread,
    openAddPeopleModal,
    closeAddPeopleModal,
    openRenameThreadModal,
    closeRenameThreadModal
  };

  /* --------------------------------------------------------------------
   * Minimal CSS injection
   * ------------------------------------------------------------------ */
  (function injectCss(){
    if(document.getElementById("msg-overlay-css")) return;
    const css=`
      .admin-msg-btn{position:relative;}
      .admin-msg-badge{position:absolute;top:-6px;right:-6px;min-width:18px;padding:0 4px;height:18px;line-height:18px;font-size:11px;text-align:center;border-radius:9px;background:#ff5252;color:#fff;display:none;}

      .msg-overlay.hidden{display:none!important;}
      .msg-overlay{position:fixed;inset:0;z-index:1000;font-family:inherit;color:#fff;}
      .msg-overlay-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.6);}
      .msg-overlay-panel{position:relative;width:95%;max-width:900px;height:90%;max-height:600px;margin:4vh auto;background:rgba(25,26,32,.95);border:1px solid rgba(255,255,255,.1);border-radius:12px;display:flex;flex-direction:column;overflow:hidden;}
      .msg-overlay-header{display:flex;align-items:center;gap:.5rem;justify-content:space-between;padding:.5rem 1rem;border-bottom:1px solid rgba(255,255,255,.1);}
      .msg-overlay-header h3{margin-right:auto;}
      .msg-overlay-search{flex:1;max-width:240px;padding:.25rem .5rem;border-radius:8px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.05);color:#fff;font-size:.9rem;}
      .msg-overlay-close{background:none;border:none;color:#fff;font-size:1.25rem;cursor:pointer;line-height:1;}

      .msg-overlay-body{flex:1;display:grid;grid-template-columns:minmax(160px,30%) 1fr;overflow:hidden;}
      .msg-threads-col{border-right:1px solid rgba(255,255,255,.1);overflow-y:auto;padding:.5rem;}
      .msg-active-col{position:relative;overflow:hidden;padding:.5rem;display:flex;flex-direction:column;}

      .msg-thread-tile{padding:.5rem;border-radius:8px;cursor:pointer;margin-bottom:.25rem;background:rgba(255,255,255,.05);}
      .msg-thread-tile.active{background:rgba(130,202,255,.15);border:1px solid rgba(130,202,255,.4);}
      .msg-thread-top{display:flex;justify-content:space-between;align-items:center;font-size:.9rem;font-weight:600;}
      .msg-thread-unread{background:#ff5252;color:#fff;font-size:.75rem;padding:0 .4rem;border-radius:8px;line-height:1.2;}
      .msg-thread-last{font-size:.8rem;opacity:.75;margin-top:2px;}

      .msg-thread-active{display:flex;flex-direction:column;height:100%;}
      .msg-thread-active-header{text-align:center;font-weight:600;margin-bottom:.25rem;display:flex;align-items:center;justify-content:center;gap:.25rem;}
      .msg-thread-active-header .msg-thread-rename-btn,
      .msg-thread-active-header .msg-thread-add-btn{background:none;border:none;color:#fff;font-size:.9rem;cursor:pointer;line-height:1;padding:0 .25rem;}
      .msg-thread-title{max-width:80%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}

      .msg-thread-active-messages{flex:1;overflow-y:auto;padding:.25rem;}
      .msg-thread-active-messages.msg-thread-loading{text-align:center;opacity:.8;padding-top:2rem;}

      .msg-bubble{max-width:80%;margin-bottom:.5rem;padding:.5rem .75rem;border-radius:12px;line-height:1.3;font-size:.95rem;position:relative;word-break:break-word;white-space:pre-wrap;}
      .msg-bubble.me{margin-left:auto;background:#1e90ff;color:#fff;}
      .msg-bubble.them{margin-right:auto;background:rgba(255,255,255,.1);}
      .msg-bubble-meta{text-align:right;font-size:.7rem;opacity:.7;margin-top:2px;}

      .msg-send-form{display:flex;gap:.5rem;margin-top:.5rem;}
      .msg-send-form textarea{flex:1;padding:.5rem;border-radius:8px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.05);color:#fff;resize:none;font-family:inherit;font-size:.95rem;line-height:1.25;}
      .msg-send-form button{padding:.5rem 1rem;border:none;border-radius:8px;background:#1e90ff;color:#fff;cursor:pointer;font-weight:600;}

      .msg-overlay-new{position:absolute;right:1rem;bottom:1rem;width:44px;height:44px;border-radius:50%;background:#47c971;border:none;color:#fff;font-size:1.5rem;line-height:1;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.6);}

      /* new-thread modal */
      .msg-new-modal.hidden{display:none!important;}
      .msg-new-modal{position:fixed;inset:0;z-index:1100;color:#fff;font-family:inherit;}
      .msg-new-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.7);}
      .msg-new-panel{position:relative;width:90%;max-width:400px;margin:10vh auto;padding:1rem;background:rgba(25,26,32,.95);border:1px solid rgba(255,255,255,.1);border-radius:12px;display:flex;flex-direction:column;gap:1rem;}
      .msg-new-title-lbl{font-size:.9rem;display:block;}
      #msg-new-title{width:100%;padding:.5rem;border-radius:8px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.05);color:#fff;}
      #msg-new-list{max-height:200px;overflow-y:auto;font-size:.95rem;line-height:1.3;}
      .msg-new-opt{display:block;margin-bottom:.25rem;font-size:.95rem;}
      #msg-new-text{width:100%;min-height:4rem;padding:.5rem;border-radius:8px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.05);color:#fff;}
      .msg-new-actions{text-align:right;display:flex;justify-content:flex-end;gap:.5rem;}
      .msg-new-actions button{padding:.5rem 1rem;border-radius:8px;border:none;cursor:pointer;font-weight:600;}
      .msg-new-actions .msg-new-send{background:#1e90ff;color:#fff;}

      /* add-people modal */
      .msg-add-modal.hidden{display:none!important;}
      .msg-add-modal{position:fixed;inset:0;z-index:1110;color:#fff;font-family:inherit;}
      .msg-add-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.7);}
      .msg-add-panel{position:relative;width:90%;max-width:320px;margin:15vh auto;padding:1rem;background:rgba(25,26,32,.95);border:1px solid rgba(255,255,255,.1);border-radius:12px;display:flex;flex-direction:column;gap:1rem;}
      #msg-add-list{max-height:180px;overflow-y:auto;font-size:.95rem;}
      .msg-add-opt{display:block;margin-bottom:.25rem;}
      .msg-add-actions{text-align:right;display:flex;justify-content:flex-end;gap:.5rem;}
      .msg-add-actions button{padding:.5rem 1rem;border-radius:8px;border:none;cursor:pointer;font-weight:600;}
      .msg-add-actions .msg-add-send{background:#47c971;color:#fff;}

      /* rename modal */
      .msg-rename-modal.hidden{display:none!important;}
      .msg-rename-modal{position:fixed;inset:0;z-index:1120;color:#fff;font-family:inherit;}
      .msg-rename-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.7);}
      .msg-rename-panel{position:relative;width:90%;max-width:300px;margin:20vh auto;padding:1rem;background:rgba(25,26,32,.95);border:1px solid rgba(255,255,255,.1);border-radius:12px;display:flex;flex-direction:column;gap:1rem;}
      #msg-rename-input{width:100%;padding:.5rem;border-radius:8px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.05);color:#fff;}
      .msg-rename-actions{text-align:right;display:flex;justify-content:flex-end;gap:.5rem;}
      .msg-rename-actions button{padding:.5rem 1rem;border-radius:8px;border:none;cursor:pointer;font-weight:600;}
      .msg-rename-actions .msg-rename-save{background:#1e90ff;color:#fff;}
    `;
    const tag=document.createElement("style");
    tag.id="msg-overlay-css";
    tag.textContent=css;
    document.head.appendChild(tag);
  })();

  /* --------------------------------------------------------------------
   * Late header wiring fallback (if dashboard loaded before we did)
   * ------------------------------------------------------------------ */
  document.addEventListener("DOMContentLoaded",()=>{
    const badge = document.getElementById("messagesBadge");
    if(badge) setBadgeEl(badge);
    const btn = document.getElementById("messagesBtn");
    if(btn){
      btn.addEventListener("click", ()=>openOverlay());
    }
    /* if auth already ready (dashboard loaded first), init now */
    const user = auth.currentUser;
    if(user){
      const myRole = (window.currentRole || ROLES.ME);
      init(user.uid, myRole);
    }
  });

})(); // IIFE end