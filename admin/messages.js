/* =====================================================================
 * messages.js  (minimal, defensive build)
 * ---------------------------------------------------------------------
 * Responsibilities:
 *   • Watch /messages in Realtime DB.
 *   • Keep local caches of threads + msgs (only ones user can see).
 *   • Update small header badge (#messagesBadge or custom via setBadgeEl()).
 *   • Provide overlay UI for viewing & sending messages.
 *   • Provide modal to start a new thread (recipients scoped by role).
 *
 * Hard requirements the rest of the app must provide (directly or later):
 *   window.firebase   Firebase compat namespace (already loaded globally).
 *   window._users     user directory (uid -> user obj) for name lookups.
 *   window.currentUid current signed-in uid  (set by dashboard.js after auth).
 *   window.currentRole current user role string lower (me/lead/dm/admin).
 *
 * Safe: if any above missing at load, we retry when auth fires.
 * ===================================================================== */

/* ---------------------------------------------------------------------
 * Safe Firebase handles
 * ------------------------------------------------------------------ */
function _msg_fbReady(){
  return !!(window.firebase && window.firebase.apps && window.firebase.apps.length);
}
function _msg_db(){
  if (window.db) return window.db;                       // dashboard exposed
  if (_msg_fbReady()) return window.firebase.database(); // fallback
  return null;
}
function _msg_auth(){
  if (window.auth) return window.auth;
  if (_msg_fbReady()) return window.firebase.auth();
  return null;
}

/* ---------------------------------------------------------------------
 * Role constants
 * ------------------------------------------------------------------ */
const MSG_ROLES = window.ROLES || { ME:"me", LEAD:"lead", DM:"dm", ADMIN:"admin" };

/* ---------------------------------------------------------------------
 * Local state
 * ------------------------------------------------------------------ */
let MSG_uid          = null;
let MSG_role         = MSG_ROLES.ME;
let MSG_threads      = {};      // tid -> thread rec
let MSG_msgs         = {};      // tid -> {mid:msg}
let MSG_activeTid    = null;
let MSG_overlayOpen  = false;
let MSG_threadsBound = false;
let MSG_badgeEl      = null;    // external override
const MSG_msgsBound  = {};      // tid -> true

/* =====================================================================
 * PUBLIC API (export early)
 * =================================================================== */
window.messages = {
  /** dashboard.js should call after auth */
  init: msgInit,
  /** optionally pass your badge span */
  setBadgeEl: msgSetBadgeEl,
  /** overlay controls */
  open: msgOpenOverlay,
  close: msgCloseOverlay,
  setActive: msgSetActiveThread,
  sendActiveThreadMsg: msgSendActiveThreadMsg, // form handler
  newThread: msgOpenNewThreadModal,
  closeNewThread: msgCloseNewThreadModal,
  sendNewThread: msgSendNewThread
};

/* =====================================================================
 * INIT
 * =================================================================== */
function msgInit(uid, role){
  MSG_uid  = uid || window.currentUid  || null;
  MSG_role = (role || window.currentRole || MSG_ROLES.ME || "me").toLowerCase();

  const auth = _msg_auth();
  const db   = _msg_db();

  if (!auth || !db) {
    console.warn("[messages] Firebase not ready yet; will retry on auth.");
    // attach fallback auth listener once
    _msg_installAuthFallback();
    return;
  }

  if (!MSG_threadsBound) _msg_bindThreadsRealtime();
  _msg_refreshBadge();
}

/* Fallback auth listener (runs once) --------------------------------- */
let _msg_authFallbackBound = false;
function _msg_installAuthFallback(){
  if (_msg_authFallbackBound) return;
  const auth = _msg_auth();
  if (!auth) return;
  _msg_authFallbackBound = true;
  auth.onAuthStateChanged(u=>{
    if (u && !MSG_uid) {
      msgInit(u.uid, window.currentRole || MSG_ROLES.ME);
    }
  });
}

/* Dashboard can pass its badge span ---------------------------------- */
function msgSetBadgeEl(el){
  MSG_badgeEl = el;
  _msg_refreshBadge();
}

/* =====================================================================
 * REALTIME: THREADS ROOT
 * =================================================================== */
function _msg_bindThreadsRealtime(){
  const db = _msg_db(); if (!db){console.error("[messages] no db");return;}
  MSG_threadsBound = true;
  const ref = db.ref("messages");
  ref.on("child_added",   _msg_handleThreadSnap);
  ref.on("child_changed", _msg_handleThreadSnap);
  ref.on("child_removed", s=>{
    const tid=s.key;
    delete MSG_threads[tid];
    delete MSG_msgs[tid];
    _msg_refreshBadge();
    if (MSG_overlayOpen) _msg_renderOverlay();
  });
}

/* Filter thread to what I can see ------------------------------------ */
function _msg_threadVisible(t){
  if (!MSG_uid) return false;
  if (MSG_role === MSG_ROLES.ADMIN) return true;
  return !!(t && t.participants && t.participants[MSG_uid]);
}

function _msg_handleThreadSnap(snap){
  const data = snap.val();
  if (!data) return;          // security filtered / removed
  if (!_msg_threadVisible(data)) return;

  const tid = snap.key;
  MSG_threads[tid] = data;

  // bind msgs subfeed once
  if (!MSG_msgsBound[tid]) {
    MSG_msgsBound[tid] = true;
    _msg_bindMsgsRealtime(tid);
  }

  // If no active thread pick the newest
  if (!MSG_activeTid) MSG_activeTid = tid;

  _msg_refreshBadge();
  if (MSG_overlayOpen) _msg_renderOverlay();
}

/* =====================================================================
 * REALTIME: MSGS SUBFEED
 * =================================================================== */
function _msg_bindMsgsRealtime(tid){
  const db = _msg_db(); if (!db) return;
  const ref = db.ref(`messages/${tid}/msgs`);
  MSG_msgs[tid] = MSG_msgs[tid] || {};
  ref.on("child_added",   s=>{MSG_msgs[tid][s.key]=s.val(); if(MSG_overlayOpen)_msg_renderOverlay();});
  ref.on("child_changed", s=>{MSG_msgs[tid][s.key]=s.val(); if(MSG_overlayOpen)_msg_renderOverlay();});
  ref.on("child_removed", s=>{delete MSG_msgs[tid][s.key];  if(MSG_overlayOpen)_msg_renderOverlay();});
}

/* =====================================================================
 * BADGE
 * =================================================================== */
function _msg_unreadTotal(){
  let sum=0;
  Object.values(MSG_threads).forEach(t=>{
    const n = t.unread && typeof t.unread[MSG_uid] === "number" ? t.unread[MSG_uid] : 0;
    sum += n;
  });
  return sum;
}

function _msg_refreshBadge(){
  const n = _msg_unreadTotal();

  // global dashboard helper hook
  if (typeof window.updateMessagesBadge === "function") {
    window.updateMessagesBadge(n);
  }

  // our local override element
  if (MSG_badgeEl) {
    MSG_badgeEl.textContent = n>0?String(n):"";
    MSG_badgeEl.style.display = n>0?"":"none";
  }
}

/* =====================================================================
 * OVERLAY
 * =================================================================== */
function _msg_ensureOverlay(){
  let ov=document.getElementById("msg-overlay");
  if(ov) return ov;
  ov=document.createElement("div");
  ov.id="msg-overlay";
  ov.className="msg-overlay hidden";
  ov.innerHTML=`
    <div class="msg-overlay-backdrop" data-msg-close></div>
    <div class="msg-overlay-panel" role="dialog" aria-modal="true">
      <header class="msg-overlay-header">
        <h3>Messages</h3>
        <button type="button" class="msg-overlay-close" data-msg-close aria-label="Close">×</button>
      </header>
      <div class="msg-overlay-body"><!-- injected --></div>
      <button type="button" class="msg-overlay-new" title="New Message" data-msg-new>＋</button>
    </div>`;
  document.body.appendChild(ov);

  ov.addEventListener("click",e=>{
    if (e.target.hasAttribute("data-msg-close")) {
      msgCloseOverlay();
    } else if (e.target.hasAttribute("data-msg-new")) {
      msgOpenNewThreadModal();
    }
  });

  return ov;
}

function msgOpenOverlay(){
  const ov=_msg_ensureOverlay();
  ov.classList.remove("hidden");
  MSG_overlayOpen=true;
  _msg_renderOverlay();
  _msg_markAllViewed(); // zero unread for me
}
function msgCloseOverlay(){
  const ov=_msg_ensureOverlay();
  ov.classList.add("hidden");
  MSG_overlayOpen=false;
}

/* =====================================================================
 * OVERLAY RENDER
 * =================================================================== */
function _msg_renderOverlay(){
  const ov=_msg_ensureOverlay();
  const body=ov.querySelector(".msg-overlay-body"); if(!body) return;

  const entries = Object.entries(MSG_threads)
    .sort((a,b)=>(b[1].updatedAt||0)-(a[1].updatedAt||0));

  const tList = entries.map(([tid,t])=>{
    const names=_msg_participantsHuman(t.participants||{});
    const last = t.lastMsg ? _msg_shortText(t.lastMsg.text,60) : "(no messages)";
    const unread=t.unread && t.unread[MSG_uid]?t.unread[MSG_uid]:0;
    const active=(tid===MSG_activeTid)?"active":"";
    return `
      <div class="msg-thread-tile ${active}" data-tid="${tid}">
        <div class="msg-thread-top">
          <span class="msg-thread-names">${_msg_esc(names)}</span>
          ${unread?`<span class="msg-thread-unread">${unread}</span>`:""}
        </div>
        <div class="msg-thread-last">${_msg_esc(last)}</div>
      </div>`;
  }).join("");

  let activeHtml="";
  if (MSG_activeTid && MSG_threads[MSG_activeTid]){
    const thread=MSG_threads[MSG_activeTid];
    const msgs=MSG_msgs[MSG_activeTid]||{};
    const sorted=Object.entries(msgs).sort((a,b)=>(a[1].ts||0)-(b[1].ts||0));
    activeHtml=`
      <div class="msg-thread-active" data-tid="${MSG_activeTid}">
        <div class="msg-thread-active-header">${_msg_esc(_msg_participantsHuman(thread.participants||{}))}</div>
        <div class="msg-thread-active-messages" id="msg-thread-active-messages">
          ${sorted.map(([mid,m])=>_msg_renderMsgBubble(m)).join("")}
        </div>
        <form class="msg-send-form" data-msg-send-form>
          <input type="text" id="msg-send-input" placeholder="Type a message…" autocomplete="off" />
          <button type="submit">Send</button>
        </form>
      </div>`;
  } else {
    activeHtml=`<div class="msg-no-thread">Select a thread, or tap ＋ to start one.</div>`;
  }

  body.innerHTML=`
    <div class="msg-threads-col">
      ${tList || '<div class="msg-no-threads">(No threads)</div>'}
    </div>
    <div class="msg-active-col">
      ${activeHtml}
    </div>`;

  // tile clicks
  body.querySelectorAll(".msg-thread-tile").forEach(tile=>{
    tile.addEventListener("click",()=>msgSetActiveThread(tile.dataset.tid));
  });

  // send form
  const form=body.querySelector("[data-msg-send-form]");
  if(form) form.addEventListener("submit",msgSendActiveThreadMsg);

  // autoscroll
  const box=body.querySelector("#msg-thread-active-messages");
  if(box) box.scrollTop=box.scrollHeight;
}

function _msg_renderMsgBubble(m){
  const me=(m.fromUid===MSG_uid);
  const when=m.ts?new Date(m.ts).toLocaleString():"";
  return `
    <div class="msg-bubble ${me?'me':'them'}">
      <div class="msg-bubble-text">${_msg_esc(m.text)}</div>
      <div class="msg-bubble-meta">${when}</div>
    </div>`;
}

/* =====================================================================
 * THREAD ACTIONS
 * =================================================================== */
function msgSetActiveThread(tid){
  MSG_activeTid=tid;
  // zero unread for me (local + db)
  const db=_msg_db();
  const t=MSG_threads[tid];
  if(t){
    if(!t.unread) t.unread={};
    t.unread[MSG_uid]=0;
    if(db) db.ref(`messages/${tid}/unread/${MSG_uid}`).set(0);
  }
  _msg_refreshBadge();
  if(MSG_overlayOpen)_msg_renderOverlay();
}

function msgSendActiveThreadMsg(evt){
  evt.preventDefault();
  const input=document.getElementById("msg-send-input");
  if(!input) return false;
  const txt=input.value.trim();
  if(!txt) return false;
  const tid=MSG_activeTid;
  if(!tid || !MSG_threads[tid]) return false;
  input.value="";
  _msg_sendMessage(tid,txt);
  return false;
}

async function _msg_sendMessage(tid,text){
  const db=_msg_db(); if(!db) return;
  const now=Date.now();
  const msgRef=db.ref(`messages/${tid}/msgs`).push();
  await msgRef.set({fromUid:MSG_uid,text,ts:now});

  // meta + unread
  const t=MSG_threads[tid]||{};
  const parts=t.participants||{};
  const up={};
  up[`messages/${tid}/lastMsg`]={fromUid:MSG_uid,text,ts:now};
  up[`messages/${tid}/updatedAt`]=now;
  Object.keys(parts).forEach(uid=>{
    up[`messages/${tid}/unread/${uid}`]=(uid===MSG_uid?0:((t.unread&&t.unread[uid])||0)+1);
  });
  await db.ref().update(up);
}

/* mark all threads as viewed when overlay opens ---------------------- */
function _msg_markAllViewed(){
  const db=_msg_db(); if(!db) return;
  const up={};
  Object.entries(MSG_threads).forEach(([tid,t])=>{
    if(t.unread && t.unread[MSG_uid]>0){
      up[`messages/${tid}/unread/${MSG_uid}`]=0;
      t.unread[MSG_uid]=0;
    }
  });
  if(Object.keys(up).length) db.ref().update(up);
  _msg_refreshBadge();
}

/* =====================================================================
 * NEW THREAD MODAL
 * =================================================================== */
let MSG_newModal=null;

function _msg_ensureNewModal(){
  if(MSG_newModal) return MSG_newModal;
  const m=document.createElement("div");
  m.id="msg-new-modal";
  m.className="msg-new-modal hidden";
  m.innerHTML=`
    <div class="msg-new-backdrop" data-msg-new-cancel></div>
    <div class="msg-new-panel">
      <h4>New Message</h4>
      <div id="msg-new-list"></div>
      <textarea id="msg-new-text" rows="3" placeholder="Message…"></textarea>
      <div class="msg-new-actions">
        <button type="button" data-msg-new-cancel>Cancel</button>
        <button type="button" class="msg-new-send" data-msg-new-send>Send</button>
      </div>
    </div>`;
  document.body.appendChild(m);
  m.addEventListener("click",e=>{
    if (e.target.hasAttribute("data-msg-new-cancel")) {
      msgCloseNewThreadModal();
    } else if (e.target.hasAttribute("data-msg-new-send")) {
      msgSendNewThread();
    }
  });
  MSG_newModal=m;
  return m;
}

function msgOpenNewThreadModal(){
  const m=_msg_ensureNewModal();
  _msg_populateNewModal();
  m.classList.remove("hidden");
}
function msgCloseNewThreadModal(){
  const m=_msg_ensureNewModal();
  m.classList.add("hidden");
}

function _msg_populateNewModal(){
  const list=document.getElementById("msg-new-list");
  if(!list) return;
  const opts=_msg_buildEligibleRecipients(window._users||{},MSG_uid,MSG_role);
  list.innerHTML=opts.map(o=>`
    <label class="msg-new-opt">
      <input type="checkbox" value="${_msg_escAttr(o.uid)}" />
      ${_msg_esc(o.label)}
    </label>`).join("");
  const txt=document.getElementById("msg-new-text");
  if(txt) txt.value="";
}

async function msgSendNewThread(){
  const db=_msg_db(); if(!db) return;
  const modal=MSG_newModal||document.getElementById("msg-new-modal");
  if(!modal) return;
  const checks=[...modal.querySelectorAll('#msg-new-list input[type="checkbox"]:checked')];
  if(!checks.length){ alert("Select at least one recipient."); return; }
  const txtEl=document.getElementById("msg-new-text");
  const text=(txtEl?.value||"").trim();
  if(!text){ alert("Enter a message."); return; }

  const now=Date.now();
  const parts={}; parts[MSG_uid]=true;
  checks.forEach(ch=>{parts[ch.value]=true;});

  const unread={};
  Object.keys(parts).forEach(uid=>{unread[uid]=(uid===MSG_uid?0:1);});

  const tRef=db.ref("messages").push();
  const tid=tRef.key;
  const base={
    participants:parts,
    unread,
    updatedAt:now,
    lastMsg:{fromUid:MSG_uid,text,ts:now}
  };
  await tRef.set(base);
  await db.ref(`messages/${tid}/msgs`).push({fromUid:MSG_uid,text,ts:now});

  MSG_activeTid=tid;
  msgCloseNewThreadModal();
  msgOpenOverlay();
}

/* =====================================================================
 * RECIPIENT SCOPING
 * =================================================================== */
function _msg_buildEligibleRecipients(users, uid, role){
  const arr=[];
  const me=users[uid];
  if(!users) return arr;

  if(role===MSG_ROLES.ADMIN){
    Object.entries(users).forEach(([id,u])=>{
      if(id===uid) return;
      arr.push({uid:id,label:(u.name||u.email||id)+" ("+u.role+")"});
    });
    return arr;
  }

  if(role===MSG_ROLES.DM){
    const leads = Object.entries(users).filter(([,u])=>u.role===MSG_ROLES.LEAD && u.assignedDM===uid);
    const leadIds = leads.map(([id])=>id);
    const mes = Object.entries(users).filter(([,u])=>u.role===MSG_ROLES.ME && leadIds.includes(u.assignedLead));
    leads.forEach(([id,u])=>arr.push({uid:id,label:(u.name||u.email||id)+" (Lead)"}));
    mes.forEach(([id,u])=>arr.push({uid:id,label:(u.name||u.email||id)}));
    return arr;
  }

  if(role===MSG_ROLES.LEAD){
    const dmUid = me?.assignedDM;
    if(dmUid && users[dmUid]){
      const dm=users[dmUid];
      arr.push({uid:dmUid,label:(dm.name||dm.email||dmUid)+" (DM)"});
    }
    Object.entries(users).forEach(([id,u])=>{
      if(u.role===MSG_ROLES.ME && u.assignedLead===uid){
        arr.push({uid:id,label:(u.name||u.email||id)});
      }
    });
    return arr;
  }

  // ME
  const leadUid=me?.assignedLead;
  if(leadUid && users[leadUid]){
    const lead=users[leadUid];
    arr.push({uid:leadUid,label:(lead.name||lead.email||leadUid)+" (Lead)"});
    const dmUid=lead.assignedDM;
    if(dmUid && users[dmUid]){
      const dm=users[dmUid];
      arr.push({uid:dmUid,label:(dm.name||dm.email||dmUid)+" (DM)"});
    }
  }
  return arr;
}

/* =====================================================================
 * SMALL UTILS
 * =================================================================== */
function _msg_esc(str){
  return (str||"").toString().replace(/[&<>"]/g, s=>({
    "&":"&amp;","<":"&lt;",">":"&gt;"
  }[s]||s)).replace(/"/g,"&quot;");
}
function _msg_escAttr(str){
  return _msg_esc(str).replace(/'/g,"&#39;");
}
function _msg_shortText(str,max){
  str=str||"";
  return str.length>max?str.slice(0,max-1)+"…":str;
}
function _msg_participantsHuman(partMap){
  const users=window._users||{};
  const names=[];
  Object.keys(partMap||{}).forEach(uid=>{
    const u=users[uid];
    names.push(u?.name||u?.email||uid);
  });
  return names.join(", ");
}

/* =====================================================================
 * CSS Inject (once)
 * =================================================================== */
(function _msg_injectCss(){
  if(document.getElementById("msg-overlay-css")) return;
  const css=`
    .admin-msg-btn{position:relative;}
    .admin-msg-btn .msg-badge{position:absolute;top:-6px;right:-6px;min-width:18px;padding:0 4px;height:18px;line-height:18px;font-size:11px;text-align:center;border-radius:9px;background:#ff5252;color:#fff;display:none;}

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