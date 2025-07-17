/* messages.js  -----------------------------------------------------------
 * Lightweight role-scoped messaging overlay for Admin Dashboard.
 * ---------------------------------------------------------------------- */

(function(){
  const ROLES = window.ROLES || { ME:"me", LEAD:"lead", DM:"dm", ADMIN:"admin" };
  const db    = window.db    || firebase.database();
  const auth  = firebase.auth();

  /* --------------------------------------------------------------------
   * Local state
   * ------------------------------------------------------------------ */
  let currentUid   = null;
  let currentRole  = ROLES.ME;
  let threadsCache = {};      // tid -> thread obj (live)
  let msgsCache    = {};      // tid -> {msgid:msg}
  let overlayOpen  = false;

  /* badge el (created when dashboard.js calls messages.injectButtonBadge) */
  let _badgeEl = null;

  /* --------------------------------------------------------------------
   * Init called from dashboard.js after auth; safe to call multiple times.
   * ------------------------------------------------------------------ */
  function initMessages(uid, role){
    currentUid  = uid;
    currentRole = (role||ROLES.ME).toLowerCase();
    bindThreadsRealtime();
  }

  /* Dashboard helper sets external badge reference -------------------- */
  function setBadgeEl(el){ _badgeEl = el; refreshHeaderBadge(); }

  /* --------------------------------------------------------------------
   * Realtime listeners
   * NOTE: top-level messages .read is auth != null, so we can subscribe.
   * Each child’s per-thread .read will protect contents; unauthorized
   * children arrive as null (ignored).
   * ------------------------------------------------------------------ */
  let _threadsBound = false;
  function bindThreadsRealtime(){
    if(_threadsBound || !currentUid) return;
    _threadsBound = true;
    const ref = db.ref("messages");

    ref.on("child_added",   snap => handleThreadSnap(snap));
    ref.on("child_changed", snap => handleThreadSnap(snap));
    ref.on("child_removed", snap => {
      delete threadsCache[snap.key];
      delete msgsCache[snap.key];
      refreshHeaderBadge();
      if(overlayOpen) renderOverlay();
    });
  }

  function handleThreadSnap(snap){
    const tid  = snap.key;
    const data = snap.val();

    // If we can't see the data (security filtered) ignore.
    if(!data) return;

    // Show only if participant OR admin view? We relaxed .read but
    // per-thread .read already enforces participant|admin. So if we got here,
    // we’re authorized; keep it.
    threadsCache[tid] = data;

    // Bind msgs subfeed if not yet
    if(!msgsCache[tid]) bindMsgsRealtime(tid);

    refreshHeaderBadge();
    if(overlayOpen) renderOverlay();
  }

  function bindMsgsRealtime(tid){
    const ref = db.ref("messages/"+tid+"/msgs");
    msgsCache[tid] = msgsCache[tid] || {};
    ref.on("child_added", snap=>{
      msgsCache[tid][snap.key]=snap.val();
      if(overlayOpen) renderOverlay();
    });
    ref.on("child_changed", snap=>{
      msgsCache[tid][snap.key]=snap.val();
      if(overlayOpen) renderOverlay();
    });
    ref.on("child_removed", snap=>{
      delete msgsCache[tid][snap.key];
      if(overlayOpen) renderOverlay();
    });
  }

  /* --------------------------------------------------------------------
   * Compute unread count for current user (sum of per-thread unread)
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
    if(!_badgeEl) return;
    const n = unreadTotal();
    _badgeEl.textContent = n>0 ? String(n) : "";
    _badgeEl.style.display = n>0 ? "" : "none";
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
      <div class="msg-overlay-backdrop" onclick="window.messages.closeOverlay()"></div>
      <div class="msg-overlay-panel" role="dialog" aria-modal="true">
        <header class="msg-overlay-header">
          <h3>Messages</h3>
          <button type="button" class="msg-overlay-close" onclick="window.messages.closeOverlay()" aria-label="Close">×</button>
        </header>
        <div class="msg-overlay-body">
          <!-- thread list injected here -->
        </div>
        <button type="button" class="msg-overlay-new" title="New Message" onclick="window.messages.openNewThreadModal()">＋</button>
      </div>
    `;
    document.body.appendChild(ov);
    return ov;
  }

  function openOverlay(){
    const ov = ensureOverlay();
    ov.classList.remove("hidden");
    overlayOpen = true;
    renderOverlay();
    markAllViewed(); // mark threads seen (zero unread)
  }
  function closeOverlay(){
    const ov = ensureOverlay();
    ov.classList.add("hidden");
    overlayOpen = false;
  }

  /* --------------------------------------------------------------------
   * Render overlay body (threads list + active thread messages)
   * ------------------------------------------------------------------ */
  let activeThreadId = null;

  function renderOverlay(){
    const ov = ensureOverlay();
    const body = ov.querySelector(".msg-overlay-body");
    if(!body) return;

    // Build thread tiles
    const threadEntries = Object.entries(threadsCache)
      .sort((a,b)=>(b[1].updatedAt||0)-(a[1].updatedAt||0));

    const threadListHtml = threadEntries.map(([tid,t])=>{
      const partNames = participantsHuman(t.participants||{});
      const last = t.lastMsg ? shortText(t.lastMsg.text, 60) : "(no messages)";
      const unread = t.unread && t.unread[currentUid] ? t.unread[currentUid] : 0;
      const activeCls = (tid===activeThreadId)?"active":"";
      return `
        <div class="msg-thread-tile ${activeCls}" data-tid="${tid}" onclick="window.messages.setActiveThread('${tid}')">
          <div class="msg-thread-top">
            <span class="msg-thread-names">${esc(partNames)}</span>
            ${unread?`<span class="msg-thread-unread">${unread}</span>`:""}
          </div>
          <div class="msg-thread-last">${esc(last)}</div>
        </div>`;
    }).join("");

    // Active thread content
    let threadMsgsHtml = "";
    if(activeThreadId && threadsCache[activeThreadId]){
      const thread = threadsCache[activeThreadId];
      const msgs   = msgsCache[activeThreadId] || {};
      const sorted = Object.entries(msgs).sort((a,b)=>(a[1].ts||0)-(b[1].ts||0));
      threadMsgsHtml = `
        <div class="msg-thread-active" data-tid="${activeThreadId}">
          <div class="msg-thread-active-header">${esc(participantsHuman(thread.participants||{}))}</div>
          <div class="msg-thread-active-messages" id="msg-thread-active-messages">
            ${sorted.map(([mid,m])=>renderMsgBubble(m)).join("")}
          </div>
          <form class="msg-send-form" onsubmit="return window.messages.sendActiveThreadMsg(event)">
            <input type="text" id="msg-send-input" placeholder="Type a message…" autocomplete="off" />
            <button type="submit">Send</button>
          </form>
        </div>`;
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

    // scroll active message area to bottom
    const box = body.querySelector("#msg-thread-active-messages");
    if(box) box.scrollTop = box.scrollHeight;
  }

  function renderMsgBubble(m){
    const isMe = m.fromUid === currentUid;
    const when = m.ts ? new Date(m.ts).toLocaleString() : "";
    return `
      <div class="msg-bubble ${isMe?'me':'them'}">
        <div class="msg-bubble-text">${esc(m.text)}</div>
        <div class="msg-bubble-meta">${when}</div>
      </div>`;
  }

  /* --------------------------------------------------------------------
   * Helpers
   * ------------------------------------------------------------------ */
  function esc(str){ return (str||"").toString().replace(/[&<>"]/g,s=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[s])); }
  function shortText(str,max){ str=str||""; return str.length>max?str.slice(0,max-1)+"…":str; }

  function participantsHuman(partMap){
    const users = window._users || {};
    const names = [];
    Object.keys(partMap||{}).forEach(uid=>{
      const u = users[uid];
      names.push(u?.name || u?.email || uid);
    });
    return names.join(", ");
  }

  /* --------------------------------------------------------------------
   * Thread selection & send
   * ------------------------------------------------------------------ */
  function setActiveThread(tid){
    activeThreadId = tid;
    // reset unread for me
    if(threadsCache[tid]){
      const ref = db.ref(`messages/${tid}/unread/${currentUid}`);
      ref.set(0);
    }
    renderOverlay();
    refreshHeaderBadge();
  }

  async function sendActiveThreadMsg(evt){
    evt.preventDefault();
    const input = document.getElementById("msg-send-input");
    if(!input) return false;
    const text = input.value.trim();
    if(!text) return false;
    const tid  = activeThreadId;
    if(!tid || !threadsCache[tid]) return false;
    input.value = "";

    await sendMessage(tid, text);
    return false;
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

    // update lastMsg + updatedAt
    const up = {};
    up[`messages/${tid}/lastMsg`] = { fromUid: currentUid, text, ts: now };
    up[`messages/${tid}/updatedAt`] = now;

    // unread++ for all OTHER participants
    const t = threadsCache[tid] || {};
    const parts = t.participants || {};
    Object.keys(parts).forEach(uid=>{
      if(uid === currentUid) return;
      const cur = (t.unread && t.unread[uid]) || 0;
      up[`messages/${tid}/unread/${uid}`] = cur + 1;
    });

    await db.ref().update(up);
  }

  /* Mark all as viewed when overlay opens -------------------------------- */
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
  let _newModal = null;
  function openNewThreadModal(){
    const users = window._users || {};
    const opts  = buildEligibleRecipients(users,currentUid,currentRole);
    if(!_newModal) _newModal = buildNewModal();
    populateNewModal(opts);
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
      <div class="msg-new-backdrop" onclick="window.messages.closeNewThreadModal()"></div>
      <div class="msg-new-panel">
        <h4>New Message</h4>
        <div id="msg-new-list"></div>
        <textarea id="msg-new-text" rows="3" placeholder="Message…"></textarea>
        <div class="msg-new-actions">
          <button type="button" onclick="window.messages.closeNewThreadModal()">Cancel</button>
          <button type="button" class="msg-new-send" onclick="window.messages.sendNewThread()">Send</button>
        </div>
      </div>`;
    document.body.appendChild(m);
    return m;
  }

  function populateNewModal(opts){
    const list = document.getElementById("msg-new-list");
    if(!list) return;
    list.innerHTML = opts.map(o=>`
      <label class="msg-new-opt">
        <input type="checkbox" value="${o.uid}" />
        ${esc(o.label)}
      </label>`).join("");
    const txt = document.getElementById("msg-new-text");
    if(txt) txt.value="";
  }

  function buildEligibleRecipients(users, uid, role){
    const arr = [];
    const me = users[uid];
    // everybody?--we scope: Admin sees all; DM sees all leads + mes under them; lead sees its mes + DM; me sees own lead + DM.
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
      const mes   = Object.entries(users).filter(([,u])=>u.role===ROLES.ME && leads.some(([lid])=>lid===u.assignedLead));
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
    const textEl = document.getElementById("msg-new-text");
    const text   = (textEl?.value||"").trim();
    if(!text){ alert("Enter a message."); return; }

    const now = Date.now();
    const parts = {};
    parts[currentUid] = true;
    checkEls.forEach(ch=>{ parts[ch.value] = true; });

    const tRef = db.ref("messages").push();
    const tid  = tRef.key;

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

    // Create thread, then push msg
    await tRef.set(base);
    await db.ref(`messages/${tid}/msgs`).push({
      fromUid: currentUid,
      text,
      ts: now
    });

    // Show new thread
    activeThreadId = tid;
    closeNewThreadModal();
    openOverlay();
  }

  /* --------------------------------------------------------------------
   * Public API
   * ------------------------------------------------------------------ */
  window.messages = {
    init: initMessages,
    setBadgeEl,
    openOverlay,
    closeOverlay,
    setActiveThread,
    sendActiveThreadMsg,
    openNewThreadModal,
    closeNewThreadModal,
    sendNewThread
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
      .msg-overlay-header{display:flex;align-items:center;justify-content:space-between;padding:.5rem 1rem;border-bottom:1px solid rgba(255,255,255,.1);}
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
      .msg-thread-active-header{text-align:center;font-weight:600;margin-bottom:.25rem;}
      .msg-thread-active-messages{flex:1;overflow-y:auto;padding:.25rem;}
      .msg-bubble{max-width:80%;margin-bottom:.5rem;padding:.5rem .75rem;border-radius:12px;line-height:1.3;font-size:.95rem;position:relative;}
      .msg-bubble.me{margin-left:auto;background:#1e90ff;color:#fff;}
      .msg-bubble.them{margin-right:auto;background:rgba(255,255,255,.1);}
      .msg-bubble-meta{text-align:right;font-size:.7rem;opacity:.7;margin-top:2px;}

      .msg-send-form{display:flex;gap:.5rem;margin-top:.5rem;}
      .msg-send-form input{flex:1;padding:.5rem;border-radius:8px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.05);color:#fff;}
      .msg-send-form button{padding:.5rem 1rem;border:none;border-radius:8px;background:#1e90ff;color:#fff;cursor:pointer;font-weight:600;}

      .msg-overlay-new{position:absolute;right:1rem;bottom:1rem;width:44px;height:44px;border-radius:50%;background:#47c971;border:none;color:#fff;font-size:1.5rem;line-height:1;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.6);}

      /* new-thread modal */
      .msg-new-modal.hidden{display:none!important;}
      .msg-new-modal{position:fixed;inset:0;z-index:1100;color:#fff;font-family:inherit;}
      .msg-new-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.7);}
      .msg-new-panel{position:relative;width:90%;max-width:400px;margin:10vh auto;padding:1rem;background:rgba(25,26,32,.95);border:1px solid rgba(255,255,255,.1);border-radius:12px;display:flex;flex-direction:column;gap:1rem;}
      #msg-new-list{max-height:200px;overflow-y:auto;font-size:.95rem;line-height:1.3;}
      .msg-new-opt{display:block;margin-bottom:.25rem;}
      #msg-new-text{width:100%;min-height:4rem;padding:.5rem;border-radius:8px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.05);color:#fff;}
      .msg-new-actions{text-align:right;display:flex;justify-content:flex-end;gap:.5rem;}
      .msg-new-actions button{padding:.5rem 1rem;border-radius:8px;border:none;cursor:pointer;font-weight:600;}
      .msg-new-actions .msg-new-send{background:#1e90ff;color:#fff;}
    `;
    const tag=document.createElement("style");
    tag.id="msg-overlay-css";
    tag.textContent=css;
    document.head.appendChild(tag);
  })();

})(); // IIFE end