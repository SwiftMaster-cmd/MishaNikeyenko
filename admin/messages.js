// messages.js  -- Mgmt-tier Messaging (Admin ⇄ DM ⇄ TL)

// Expect global window.db (firebase.database()) and window.auth from admin.js.
// We'll still allow explicit init(db, auth) call; if omitted, we fall back to globals.

(function(){
  const ROLES = window.ROLES || { ME:"me", LEAD:"lead", DM:"dm", ADMIN:"admin" };
  const MESSAGES_ROOT = "messages";

  /* ------------------------------------------------------------------
   * State
   * ---------------------------------------------------------------- */
  let _db        = null;
  let _auth      = null;
  let _currentUid= null;
  let _currentRole=ROLES.ME;
  let _usersGetter = null;   // function returning users map (we'll pull from window._users)
  let _threads   = {};       // threadId -> threadObj
  let _msgsCache = {};       // threadId -> {msgId:msg}
  let _rtBound   = false;
  let _badgeEl   = null;
  let _btnEl     = null;

  /* ------------------------------------------------------------------
   * Init (call after auth known)
   * ---------------------------------------------------------------- */
  function init(db, auth, usersGetterFn){
    _db   = db   || window.db;
    _auth = auth || window.auth;
    _usersGetter = usersGetterFn || (()=>window._users||{});

    _btnEl   = document.getElementById("messagesBtn");
    _badgeEl = document.getElementById("messagesBadge");
    if (_btnEl) _btnEl.addEventListener("click", openMessagesModal);

    if (_auth?.currentUser) {
      bootstrapForUser(_auth.currentUser);
    } else if (auth) {
      auth.onAuthStateChanged(u=>{ if(u) bootstrapForUser(u); });
    }
  }

  function bootstrapForUser(user){
    _currentUid = user.uid;
    const users=_usersGetter();
    const meRec=users?.[_currentUid];
    _currentRole = (meRec?.role||ROLES.ME).toLowerCase();
    bindRealtime();
  }

  /* ------------------------------------------------------------------
   * Realtime listeners
   * ---------------------------------------------------------------- */
  function bindRealtime(){
    if (_rtBound || !_db) return;
    _rtBound = true;
    const ref = _db.ref(MESSAGES_ROOT);
    // listen for threads meta changes
    ref.on("child_added", s=>{handleThreadSnapshot(s);});
    ref.on("child_changed", s=>{handleThreadSnapshot(s);});
    ref.on("child_removed", s=>{delete _threads[s.key]; updateBadge();});
  }

  function handleThreadSnapshot(snap){
    const id = snap.key;
    const val= snap.val()||{};
    _threads[id]=val;

    // Bind messages substream for this thread (once)
    if (!_msgsCache[id]) {
      _msgsCache[id]={};
      _db.ref(`${MESSAGES_ROOT}/${id}/msgs`).limitToLast(100).on("child_added", ms=>{
        _msgsCache[id][ms.key]=ms.val();
        updateThreadComputed(id);
      });
      _db.ref(`${MESSAGES_ROOT}/${id}/msgs`).on("child_changed", ms=>{
        _msgsCache[id][ms.key]=ms.val();
        updateThreadComputed(id);
      });
      _db.ref(`${MESSAGES_ROOT}/${id}/msgs`).on("child_removed", ms=>{
        delete _msgsCache[id][ms.key];
        updateThreadComputed(id);
      });
    }

    updateThreadComputed(id);
  }

  function updateThreadComputed(threadId){
    const t = _threads[threadId];
    if (!t) return;
    // compute unread if missing
    if (!t.unread) t.unread={};
    if (typeof t.unread[_currentUid] !== "number") {
      const msgs=_msgsCache[threadId]||{};
      let count=0;
      for (const m of Object.values(msgs)){
        if(!m.readBy || !m.readBy[_currentUid]) count++;
      }
      t.unread[_currentUid]=count;
    }
    updateBadge();
    // if modal open, rerender
    if (document.getElementById("messagesModal")) renderModalContent();
  }

  /* ------------------------------------------------------------------
   * Badge
   * ---------------------------------------------------------------- */
  function updateBadge(){
    if(!_badgeEl)return;
    let tot=0;
    const users=_usersGetter();
    for (const [tid,t] of Object.entries(_threads)){
      if(!threadVisibleToUser(tid,t,users)) continue;
      const n = (t.unread && typeof t.unread[_currentUid]==="number")?t.unread[_currentUid]:0;
      tot += n;
    }
    if (tot>0){
      _badgeEl.style.display="inline-block";
      _badgeEl.textContent = tot>99?"99+":String(tot);
      if (_btnEl) _btnEl.setAttribute("aria-label",`Messages (${tot} unread)`);
    } else {
      _badgeEl.style.display="none";
      _badgeEl.textContent="0";
      if (_btnEl) _btnEl.setAttribute("aria-label","Messages (0 unread)");
    }
  }

  /* ------------------------------------------------------------------
   * Permissions: which threads user can see?
   *   - Admin sees all.
   *   - Others see threads where participants/uid true OR roles/uid exists.
   * ---------------------------------------------------------------- */
  function threadVisibleToUser(id, thread, users){
    if (_currentRole===ROLES.ADMIN) return true;
    if (thread?.participants && thread.participants[_currentUid]) return true;
    if (thread?.roles && thread.roles[_currentUid]) return true;
    return false;
  }

  /* ------------------------------------------------------------------
   * Compute display name for a thread
   *   - 1:1 show other participant name
   *   - multi show "Group (n)"
   * ---------------------------------------------------------------- */
  function threadDisplayName(id, thread, users){
    const parts = thread?.participants? Object.keys(thread.participants):[];
    const others = parts.filter(u=>u!==_currentUid);
    if (others.length===1){
      const u=users?.[others[0]];
      return u?.name || u?.email || "Conversation";
    }
    // fallback: lastMsg.from + count
    return `Group (${parts.length})`;
  }

  /* ------------------------------------------------------------------
   * Modal UI
   * ---------------------------------------------------------------- */
  function openMessagesModal(){
    ensureModalShell();
    renderModalContent();
    showModal();
  }

  function ensureModalShell(){
    if (document.getElementById("messagesModal")) return;
    const root = document.getElementById("messagesModalRoot") || document.body;
    const wrap=document.createElement("div");
    wrap.id="messagesModal";
    wrap.innerHTML=`
      <div class="msg-modal-backdrop" data-msg-close></div>
      <div class="msg-modal">
        <header class="msg-modal-hdr">
          <h3>Messages</h3>
          <button type="button" class="msg-modal-close" data-msg-close>&times;</button>
        </header>
        <div class="msg-modal-body">
          <!-- thread list or thread view injected -->
        </div>
      </div>`;
    root.appendChild(wrap);
    wrap.addEventListener("click",e=>{
      if (e.target.matches("[data-msg-close]")) closeModal();
    });
    injectMsgCss();
  }

  function renderModalContent(){
    const root=document.querySelector("#messagesModal .msg-modal-body");
    if(!root)return;
    if(_openThreadId){
      renderThreadView(root,_openThreadId);
    }else{
      renderThreadList(root);
    }
  }

  function showModal(){
    const m=document.getElementById("messagesModal");
    if(m)m.classList.add("msg-modal-open");
  }
  function closeModal(){
    const m=document.getElementById("messagesModal");
    if(m)m.classList.remove("msg-modal-open");
    _openThreadId=null;
  }

  /* ------------------------------------------------------------------
   * Thread list view
   * ---------------------------------------------------------------- */
  function renderThreadList(root){
    const users=_usersGetter();
    // gather visible threads
    const arr = Object.entries(_threads)
      .filter(([id,t])=>threadVisibleToUser(id,t,users))
      .map(([id,t])=>[id,t]);
    // sort by updatedAt desc
    arr.sort((a,b)=>(b[1].updatedAt||0) - (a[1].updatedAt||0));

    const rows = arr.map(([id,t])=>{
      const name = threadDisplayName(id,t,users);
      const last = t.lastMsg?.text || "";
      const when = t.updatedAt ? new Date(t.updatedAt).toLocaleString() : "";
      const unread = t.unread?.[_currentUid]||0;
      return `
        <div class="msg-thread-row" data-tid="${id}">
          <div class="mtr-top">
            <span class="mtr-name">${escapeHtml(name)}</span>
            ${unread?`<span class="mtr-unread">${unread>99?"99+":unread}</span>`:""}
          </div>
          <div class="mtr-sub">${escapeHtml(last)}</div>
          <div class="mtr-when">${when}</div>
        </div>`;
    }).join("") || `<div class="msg-empty">No messages.</div>`;

    root.innerHTML=`
      <div class="msg-list">${rows}</div>
      <div class="msg-compose-bar">
        <button type="button" id="msgComposeBtn" class="msg-compose-btn">+ New Message</button>
      </div>
    `;

    root.querySelectorAll(".msg-thread-row").forEach(row=>{
      row.addEventListener("click",()=>{
        const tid=row.dataset.tid;
        openThread(tid);
      });
    });
    root.querySelector("#msgComposeBtn")?.addEventListener("click",openComposeDialog);
  }

  /* ------------------------------------------------------------------
   * Compose dialog
   * ---------------------------------------------------------------- */
  function openComposeDialog(){
    const users=_usersGetter();
    const mgmtEntries = Object.entries(users||{})
      .filter(([uid,u])=>{
        const r=(u.role||"").toLowerCase();
        return r===ROLES.ADMIN||r===ROLES.DM||r===ROLES.LEAD;
      });
    const opts = mgmtEntries.map(([uid,u])=>
      `<option value="${uid}" ${uid===_currentUid?"disabled":""}>${escapeHtml(u.name||u.email||uid)} (${u.role})</option>`
    ).join("");
    const root=document.querySelector("#messagesModal .msg-modal-body");
    if(!root)return;
    root.innerHTML=`
      <div class="msg-compose-form">
        <label>Select recipient(s)</label>
        <select id="msgComposeTo" multiple size="6">${opts}</select>
        <label>Message</label>
        <textarea id="msgComposeText" rows="3" placeholder="Type a message…"></textarea>
        <div class="msg-compose-actions">
          <button type="button" id="msgComposeSend" class="msg-send-btn">Send</button>
          <button type="button" id="msgComposeCancel" class="msg-cancel-btn">Cancel</button>
        </div>
      </div>`;
    document.getElementById("msgComposeSend")?.addEventListener("click",()=>{
      const toSel=document.getElementById("msgComposeTo");
      const txtEl=document.getElementById("msgComposeText");
      const sel=[...toSel.options].filter(o=>o.selected && !o.disabled).map(o=>o.value);
      const txt=txtEl.value.trim();
      if(!sel.length){alert("Select at least one recipient.");return;}
      if(!txt){alert("Enter a message.");return;}
      sendNewThreadMessage(sel,txt);
    });
    document.getElementById("msgComposeCancel")?.addEventListener("click",renderModalContent);
  }

  /* ------------------------------------------------------------------
   * Send new thread message
   * ---------------------------------------------------------------- */
  async function sendNewThreadMessage(recipientUids,text){
    const allUids=[...new Set([_currentUid,...recipientUids])].sort();
    const tid=allUids.join("__");
    const users=_usersGetter();
    const roles={};
    const participants={};
    allUids.forEach(u=>{
      participants[u]=true;
      roles[u]=(users?.[u]?.role||"").toLowerCase();
    });
    const now=Date.now();
    const msgRef=_db.ref(`${MESSAGES_ROOT}/${tid}/msgs`).push();
    const msgPayload={fromUid:_currentUid,text,ts:now,readBy:{[_currentUid]:true}};
    const threadMeta={
      participants,roles,
      lastMsg:{text,fromUid:_currentUid,ts:now},
      updatedAt:now
    };
    const updates={};
    updates[`${MESSAGES_ROOT}/${tid}`]=threadMeta;
    updates[`${MESSAGES_ROOT}/${tid}/msgs/${msgRef.key}`]=msgPayload;
    // set unread counts
    allUids.forEach(u=>{
      updates[`${MESSAGES_ROOT}/${tid}/unread/${u}`]= (u===_currentUid?0:1);
    });
    await _db.ref().update(updates);
    _openThreadId=tid;
    renderModalContent();
  }

  /* ------------------------------------------------------------------
   * Open existing thread view
   * ---------------------------------------------------------------- */
  let _openThreadId=null;
  function openThread(tid){
    _openThreadId=tid;
    renderModalContent();
    markThreadRead(tid);
  }

  function renderThreadView(root,tid){
    const t=_threads[tid]||{};
    const users=_usersGetter();
    const name=threadDisplayName(tid,t,users);
    const msgs=_msgsCache[tid]||{};
    const arr=Object.entries(msgs).sort((a,b)=>(a[1].ts||0)-(b[1].ts||0));
    const rows=arr.map(([mid,m])=>{
      const me=(m.fromUid===_currentUid);
      const sender=users?.[m.fromUid];
      const label=sender?(sender.name||sender.email||m.fromUid):m.fromUid;
      const when=m.ts?new Date(m.ts).toLocaleString():"";
      return`
        <div class="msg-bubble ${me?"me":"them"}">
          <div class="msg-bubble-hdr">${escapeHtml(label)} • ${when}</div>
          <div class="msg-bubble-txt">${escapeHtml(m.text)}</div>
        </div>`;
    }).join("");
    root.innerHTML=`
      <div class="msg-thread-view">
        <div class="msg-thread-view-hdr">
          <button type="button" class="msg-back-btn" id="msgThreadBack">← Back</button>
          <span class="msg-thread-name">${escapeHtml(name)}</span>
        </div>
        <div class="msg-thread-scroller" id="msgThreadScroll">${rows||"<div class='msg-empty'>No messages yet.</div>"}</div>
        <div class="msg-thread-compose">
          <textarea id="msgThreadInput" rows="2" placeholder="Type a message…"></textarea>
          <button type="button" id="msgThreadSend">Send</button>
        </div>
      </div>`;
    document.getElementById("msgThreadBack")?.addEventListener("click",()=>{
      _openThreadId=null;
      renderModalContent();
    });
    document.getElementById("msgThreadSend")?.addEventListener("click",()=>{
      const txt=document.getElementById("msgThreadInput").value.trim();
      if(!txt)return;
      sendMessageToThread(tid,txt);
    });
    // scroll to bottom
    const sc=document.getElementById("msgThreadScroll");
    if(sc) sc.scrollTop=sc.scrollHeight;
  }

  /* ------------------------------------------------------------------
   * Send message to existing thread
   * ---------------------------------------------------------------- */
  async function sendMessageToThread(tid,text){
    const now=Date.now();
    const msgRef=_db.ref(`${MESSAGES_ROOT}/${tid}/msgs`).push();
    const payload={fromUid:_currentUid,text,ts:now,readBy:{[_currentUid]:true}};
    const updates={};
    updates[`${MESSAGES_ROOT}/${tid}/msgs/${msgRef.key}`]=payload;
    updates[`${MESSAGES_ROOT}/${tid}/lastMsg`]={text,fromUid:_currentUid,ts:now};
    updates[`${MESSAGES_ROOT}/${tid}/updatedAt`]=now;
    // increment unread for others
    const t=_threads[tid]; const parts=t?.participants?Object.keys(t.participants):[];
    parts.forEach(u=>{
      const pRef=_db.ref(`${MESSAGES_ROOT}/${tid}/unread/${u}`);
      if(u===_currentUid){
        updates[`${MESSAGES_ROOT}/${tid}/unread/${u}`]=0;
      }else{
        // We'll use transaction for safety
        pRef.transaction(cur=> (typeof cur==="number"?cur+1:1) );
      }
    });
    await _db.ref().update(updates);
    const input=document.getElementById("msgThreadInput");
    if(input) input.value="";
  }

  /* ------------------------------------------------------------------
   * Mark thread read
   * ---------------------------------------------------------------- */
  async function markThreadRead(tid){
    const updates={};
    updates[`${MESSAGES_ROOT}/${tid}/unread/${_currentUid}`]=0;
    // mark each message read
    const msgs=_msgsCache[tid]||{};
    for(const [mid,] of Object.entries(msgs)){
      updates[`${MESSAGES_ROOT}/${tid}/msgs/${mid}/readBy/${_currentUid}`]=true;
    }
    await _db.ref().update(updates);
  }

  /* ------------------------------------------------------------------
   * Utilities
   * ---------------------------------------------------------------- */
  function escapeHtml(str){
    return (str==null?"":String(str))
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;")
      .replace(/'/g,"&#39;");
  }

  /* ------------------------------------------------------------------
   * Minimal CSS injection
   * ---------------------------------------------------------------- */
  function injectMsgCss(){
    if(document.getElementById("messages-css"))return;
    const css=`
      .msg-modal-open{display:block;}
      #messagesModal{position:fixed;z-index:9999;inset:0;display:none;}
      #messagesModal.msg-modal-open{display:block;}
      .msg-modal-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.6);}
      .msg-modal{position:absolute;top:5%;left:50%;transform:translateX(-50%);width:90%;max-width:480px;max-height:90%;overflow:hidden;background:rgba(25,26,32,.95);border:1px solid rgba(255,255,255,.15);border-radius:8px;display:flex;flex-direction:column;}
      .msg-modal-hdr{display:flex;justify-content:space-between;align-items:center;padding:.75rem 1rem;border-bottom:1px solid rgba(255,255,255,.1);}
      .msg-modal-hdr h3{font-size:1.1rem;margin:0;}
      .msg-modal-close{background:none;border:none;color:#fff;font-size:1.25rem;line-height:1;cursor:pointer;}
      .msg-modal-body{flex:1;overflow-y:auto;padding:0;}

      .msg-list{display:flex;flex-direction:column;padding:.5rem;}
      .msg-thread-row{padding:.75rem 1rem;border-bottom:1px solid rgba(255,255,255,.08);cursor:pointer;}
      .msg-thread-row:hover{background:rgba(255,255,255,.05);}
      .mtr-top{display:flex;justify-content:space-between;align-items:center;font-weight:600;}
      .mtr-unread{background:#ff5252;color:#fff;font-size:.75rem;line-height:1;padding:0 .35rem;border-radius:8px;margin-left:.5rem;}
      .mtr-sub{font-size:.9rem;opacity:.8;margin-top:.25rem;}
      .mtr-when{font-size:.75rem;opacity:.6;margin-top:.25rem;}

      .msg-compose-bar{padding:.5rem 1rem;text-align:center;border-top:1px solid rgba(255,255,255,.08);}
      .msg-compose-btn{padding:.5rem 1.25rem;font-weight:600;border-radius:4px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.05);color:#fff;cursor:pointer;}
      .msg-compose-btn:hover{background:rgba(255,255,255,.15);}

      .msg-compose-form{padding:1rem;display:flex;flex-direction:column;gap:.75rem;}
      .msg-compose-form select,
      .msg-compose-form textarea{width:100%;padding:.5rem;border-radius:4px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.05);color:#fff;font-size:1rem;}
      .msg-compose-actions{text-align:right;display:flex;justify-content:flex-end;gap:.5rem;}
      .msg-send-btn{padding:.5rem 1rem;font-weight:600;background:#00c853;border:none;border-radius:4px;color:#000;cursor:pointer;}
      .msg-cancel-btn{padding:.5rem 1rem;font-weight:600;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.25);border-radius:4px;color:#fff;cursor:pointer;}

      .msg-thread-view{display:flex;flex-direction:column;height:100%;}
      .msg-thread-view-hdr{display:flex;align-items:center;gap:.5rem;padding:.5rem 1rem;border-bottom:1px solid rgba(255,255,255,.08);}
      .msg-back-btn{background:none;border:none;color:#1e90ff;cursor:pointer;font-size:1rem;}
      .msg-thread-name{font-weight:600;}
      .msg-thread-scroller{flex:1;overflow-y:auto;padding:1rem;display:flex;flex-direction:column;gap:.75rem;}
      .msg-thread-compose{display:flex;gap:.5rem;padding:.75rem 1rem;border-top:1px solid rgba(255,255,255,.08);}
      .msg-thread-compose textarea{flex:1;padding:.5rem;border-radius:4px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.05);color:#fff;font-size:1rem;resize:vertical;min-height:2.5em;}
      .msg-thread-compose button{padding:.5rem 1rem;font-weight:600;border-radius:4px;background:#1e90ff;border:none;color:#fff;cursor:pointer;}

      .msg-bubble{max-width:80%;padding:.5rem .75rem;border-radius:8px;line-height:1.3;font-size:.95rem;}
      .msg-bubble-hdr{font-size:.75rem;font-weight:600;margin-bottom:.25rem;opacity:.8;}
      .msg-bubble-txt{white-space:pre-wrap;word-break:break-word;}
      .msg-bubble.me{margin-left:auto;background:#1e90ff;color:#fff;}
      .msg-bubble.them{margin-right:auto;background:rgba(255,255,255,.1);}
    `;
    const tag=document.createElement("style");
    tag.id="messages-css";
    tag.textContent=css;
    document.head.appendChild(tag);
  }

  /* ------------------------------------------------------------------
   * Public API
   * ---------------------------------------------------------------- */
  window.messages = {
    init,
    open: openMessagesModal,
    sendNewThreadMessage,
    sendMessageToThread,
    markThreadRead
  };
})();