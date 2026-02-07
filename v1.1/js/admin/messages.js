/* =====================================================================
 * messages.js  (defensive + backward-compat)
 * =================================================================== */

(function(){
  const MSG_DEBUG = false; // flip true for verbose console logs

  function dlog(...args){ if(MSG_DEBUG) console.log("[messages]",...args); }

  /* --------------------------------------------------------------- */
  /* Firebase handles (compat)                                       */
  /* --------------------------------------------------------------- */
  function fbReady(){ return !!(window.firebase && window.firebase.apps && window.firebase.apps.length); }
  function db(){ return window.db || (fbReady() ? window.firebase.database() : null); }
  function auth(){ return window.auth || (fbReady() ? window.firebase.auth() : null); }

  /* --------------------------------------------------------------- */
  /* Roles                                                           */
  /* --------------------------------------------------------------- */
  const ROLES = window.ROLES || {ME:"me",LEAD:"lead",DM:"dm",ADMIN:"admin"};

  /* --------------------------------------------------------------- */
  /* State                                                           */
  /* --------------------------------------------------------------- */
  let uid=null;
  let role=ROLES.ME;
  let threads={};          // tid -> thread rec
  let msgs={};             // tid -> {mid:msg}
  let activeTid=null;
  let overlayOpen=false;
  let threadsBound=false;
  const msgsBound={};      // tid bool
  let badgeEl=null;
  let newModal=null;

  /* --------------------------------------------------------------- */
  /* Public API skeleton (populated at end; compat names included)   */
  /* --------------------------------------------------------------- */
  const API = {
    init,
    setBadgeEl,
    open: openOverlay,
    close: closeOverlay,
    setActive: setActiveThread,
    sendActiveThreadMsg,  // form handler
    newThread: openNewThreadModal,
    closeNewThread: closeNewThreadModal,
    sendNewThread
  };
  /* Backward compat aliases (old dashboard calls) */
  API.openOverlay           = openOverlay;
  API.closeOverlay          = closeOverlay;
  API.setActiveThread       = setActiveThread;
  API.sendActiveThreadMsg   = sendActiveThreadMsg;
  API.openNewThreadModal    = openNewThreadModal;
  API.closeNewThreadModal   = closeNewThreadModal;
  API.sendNewThread         = sendNewThread;

  window.messages = API;

  /* --------------------------------------------------------------- */
  /* Init                                                            */
  /* --------------------------------------------------------------- */
  function init(u, r){
    uid  = u  || window.currentUid  || uid;
    role = (r || window.currentRole || role || ROLES.ME).toLowerCase();
    dlog("init", {uid,role});

    const a = auth(), database=db();
    if(!a || !database){
      dlog("firebase not ready; waiting for auth");
      installAuthFallback();
      return;
    }
    if(!threadsBound) bindThreadsRealtime();
    refreshBadge();
  }

  let authFallbackBound=false;
  function installAuthFallback(){
    if(authFallbackBound) return;
    const a=auth(); if(!a) return;
    authFallbackBound=true;
    a.onAuthStateChanged(user=>{
      if(user){
        dlog("auth fallback fired");
        init(user.uid, window.currentRole || role);
      }
    });
  }

  function setBadgeEl(el){
    badgeEl=el;
    refreshBadge();
  }

  /* --------------------------------------------------------------- */
  /* Realtime: /messages root                                        */
  /* --------------------------------------------------------------- */
  function bindThreadsRealtime(){
    const database=db(); if(!database){dlog("no db");return;}
    threadsBound=true;
    const ref=database.ref("messages");
    ref.on("child_added",   handleThreadSnap);
    ref.on("child_changed", handleThreadSnap);
    ref.on("child_removed", s=>{
      delete threads[s.key];
      delete msgs[s.key];
      refreshBadge();
      if(overlayOpen) renderOverlay();
    });
    dlog("threads bound");
  }

  function threadVisible(t){
    if(!uid) return false;
    if(role===ROLES.ADMIN) return true;
    return !!(t && t.participants && t.participants[uid]);
  }

  function handleThreadSnap(snap){
    const data=snap.val();
    if(!data){dlog("thread snap null (no access?)",snap.key);return;}
    if(!threadVisible(data)){dlog("not visible",snap.key);return;}
    const tid=snap.key;
    threads[tid]=data;
    if(!msgsBound[tid]){
      msgsBound[tid]=true;
      bindMsgsRealtime(tid);
    }
    if(!activeTid) activeTid=tid;
    refreshBadge();
    if(overlayOpen) renderOverlay();
  }

  /* --------------------------------------------------------------- */
  /* Realtime: /messages/{tid}/msgs                                  */
  /* --------------------------------------------------------------- */
  function bindMsgsRealtime(tid){
    const database=db(); if(!database)return;
    msgs[tid]=msgs[tid]||{};
    const ref=database.ref(`messages/${tid}/msgs`);
    ref.on("child_added",   s=>{msgs[tid][s.key]=s.val(); if(overlayOpen)renderOverlay();});
    ref.on("child_changed", s=>{msgs[tid][s.key]=s.val(); if(overlayOpen)renderOverlay();});
    ref.on("child_removed", s=>{delete msgs[tid][s.key];  if(overlayOpen)renderOverlay();});
    dlog("msgs bound",tid);
  }

  /* --------------------------------------------------------------- */
  /* Badge                                                           */
  /* --------------------------------------------------------------- */
  function unreadTotal(){
    let sum=0;
    Object.values(threads).forEach(t=>{
      const n=t.unread && typeof t.unread[uid]==="number"?t.unread[uid]:0;
      sum+=n;
    });
    return sum;
  }
  function refreshBadge(){
    const n=unreadTotal();
    if(typeof window.updateMessagesBadge==="function"){
      try{ window.updateMessagesBadge(n); }catch(_){}
    }
    if(badgeEl){
      badgeEl.textContent = n>0?String(n):"";
      badgeEl.style.display = n>0?"" :"none";
    }
  }

  /* --------------------------------------------------------------- */
  /* Overlay                                                          */
  /* --------------------------------------------------------------- */
  function ensureOverlay(){
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
        <div class="msg-overlay-body"></div>
        <button type="button" class="msg-overlay-new" title="New Message" data-msg-new>＋</button>
      </div>`;
    document.body.appendChild(ov);
    ov.addEventListener("click",e=>{
      if(e.target.hasAttribute("data-msg-close"))      closeOverlay();
      else if(e.target.hasAttribute("data-msg-new"))   openNewThreadModal();
    });
    return ov;
  }

  function openOverlay(){
    const ov=ensureOverlay();
    ov.classList.remove("hidden");
    overlayOpen=true;
    renderOverlay();
    markAllViewed();
  }
  function closeOverlay(){
    const ov=ensureOverlay();
    ov.classList.add("hidden");
    overlayOpen=false;
  }

  /* --------------------------------------------------------------- */
  /* Overlay render                                                   */
  /* --------------------------------------------------------------- */
  function renderOverlay(){
    const ov=ensureOverlay();
    const body=ov.querySelector(".msg-overlay-body");
    if(!body) return;

    const entries=Object.entries(threads).sort((a,b)=>(b[1].updatedAt||0)-(a[1].updatedAt||0));
    const listHtml=entries.map(([tid,t])=>{
      const names=participantsHuman(t.participants||{});
      const last = t.lastMsg ? shortText(t.lastMsg.text,60) : "(no messages)";
      const unread=t.unread && t.unread[uid]?t.unread[uid]:0;
      const active=(tid===activeTid)?"active":"";
      return `
        <div class="msg-thread-tile ${active}" data-tid="${tid}">
          <div class="msg-thread-top">
            <span class="msg-thread-names">${esc(names)}</span>
            ${unread?`<span class="msg-thread-unread">${unread}</span>`:""}
          </div>
          <div class="msg-thread-last">${esc(last)}</div>
        </div>`;
    }).join("");

    let activeHtml="";
    if(activeTid && threads[activeTid]){
      const t=threads[activeTid];
      const m=msgs[activeTid]||{};
      const sorted=Object.entries(m).sort((a,b)=>(a[1].ts||0)-(b[1].ts||0));
      activeHtml=`
        <div class="msg-thread-active" data-tid="${activeTid}">
          <div class="msg-thread-active-header">${esc(participantsHuman(t.participants||{}))}</div>
          <div class="msg-thread-active-messages" id="msg-thread-active-messages">
            ${sorted.map(([mid,msg])=>renderMsgBubble(msg)).join("")}
          </div>
          <form class="msg-send-form" data-msg-send-form>
            <input type="text" id="msg-send-input" placeholder="Type a message…" autocomplete="off" />
            <button type="submit">Send</button>
          </form>
        </div>`;
    }else{
      activeHtml=`<div class="msg-no-thread">Select a thread, or tap ＋ to start one.</div>`;
    }

    body.innerHTML=`
      <div class="msg-threads-col">
        ${listHtml || '<div class="msg-no-threads">(No threads)</div>'}
      </div>
      <div class="msg-active-col">
        ${activeHtml}
      </div>`;

    // tile clicks
    body.querySelectorAll(".msg-thread-tile").forEach(el=>{
      el.addEventListener("click",()=>setActiveThread(el.dataset.tid));
    });

    // send form
    const form=body.querySelector("[data-msg-send-form]");
    if(form) form.addEventListener("submit",sendActiveThreadMsg);

    // autoscroll
    const box=body.querySelector("#msg-thread-active-messages");
    if(box) box.scrollTop=box.scrollHeight;
  }

  function renderMsgBubble(m){
    const isMe=(m.fromUid===uid);
    const when=m.ts?new Date(m.ts).toLocaleString():"";
    return `
      <div class="msg-bubble ${isMe?'me':'them'}">
        <div class="msg-bubble-text">${esc(m.text)}</div>
        <div class="msg-bubble-meta">${when}</div>
      </div>`;
  }

  /* --------------------------------------------------------------- */
  /* Thread actions                                                   */
  /* --------------------------------------------------------------- */
  function setActiveThread(tid){
    activeTid=tid;
    // zero unread
    const database=db();
    const t=threads[tid];
    if(t){
      if(!t.unread) t.unread={};
      t.unread[uid]=0;
      if(database) database.ref(`messages/${tid}/unread/${uid}`).set(0);
    }
    refreshBadge();
    if(overlayOpen) renderOverlay();
  }

  function sendActiveThreadMsg(evt){
    evt.preventDefault();
    const input=document.getElementById("msg-send-input");
    if(!input) return false;
    const text=input.value.trim();
    if(!text) return false;
    const tid=activeTid;
    if(!tid || !threads[tid]) return false;
    input.value="";
    sendMessage(tid,text);
    return false;
  }

  async function sendMessage(tid,text){
    const database=db(); if(!database){console.error("[messages] send: no db");return;}
    const now=Date.now();
    const msgRef=database.ref(`messages/${tid}/msgs`).push();
    await msgRef.set({fromUid:uid,text,ts:now});
    const t=threads[tid]||{};
    const parts=t.participants||{};
    const up={};
    up[`messages/${tid}/lastMsg`]={fromUid:uid,text,ts:now};
    up[`messages/${tid}/updatedAt`]=now;
    Object.keys(parts).forEach(p=>{
      const cur=(t.unread&&t.unread[p])||0;
      up[`messages/${tid}/unread/${p}`]=(p===uid?0:cur+1);
    });
    await database.ref().update(up);
  }

  /* mark all viewed when overlay opens */
  function markAllViewed(){
    const database=db(); if(!database)return;
    const up={};
    Object.entries(threads).forEach(([tid,t])=>{
      if(t.unread && t.unread[uid]>0){
        up[`messages/${tid}/unread/${uid}`]=0;
        t.unread[uid]=0;
      }
    });
    if(Object.keys(up).length) database.ref().update(up);
    refreshBadge();
  }

  /* --------------------------------------------------------------- */
  /* New thread modal                                                 */
  /* --------------------------------------------------------------- */
  function ensureNewModal(){
    if(newModal) return newModal;
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
      if(e.target.hasAttribute("data-msg-new-cancel")) closeNewThreadModal();
      else if(e.target.hasAttribute("data-msg-new-send")) sendNewThread();
    });
    newModal=m;
    return m;
  }

  function openNewThreadModal(){
    const m=ensureNewModal();
    populateNewModal();
    m.classList.remove("hidden");
  }
  function closeNewThreadModal(){
    const m=ensureNewModal();
    m.classList.add("hidden");
  }

  function populateNewModal(){
    const list=document.getElementById("msg-new-list");
    if(!list) return;
    const opts=buildEligibleRecipients(window._users||{},uid,role);
    list.innerHTML=opts.map(o=>`
      <label class="msg-new-opt">
        <input type="checkbox" value="${escAttr(o.uid)}" />
        ${esc(o.label)}
      </label>`).join("");
    const txt=document.getElementById("msg-new-text");
    if(txt) txt.value="";
  }

  async function sendNewThread(){
    const database=db(); if(!database){console.error("[messages] sendNewThread: no db");return;}
    const modal=newModal||document.getElementById("msg-new-modal");
    if(!modal) return;
    const checks=[...modal.querySelectorAll('#msg-new-list input[type="checkbox"]:checked')];
    if(!checks.length){ alert("Select at least one recipient."); return; }
    const txtEl=document.getElementById("msg-new-text");
    const text=(txtEl?.value||"").trim();
    if(!text){ alert("Enter a message."); return; }

    const now=Date.now();
    const parts={}; parts[uid]=true;
    checks.forEach(ch=>{parts[ch.value]=true;});
    const unread={}; Object.keys(parts).forEach(p=>unread[p]=(p===uid?0:1));

    const tRef=database.ref("messages").push();
    const tid=tRef.key;
    const base={
      participants:parts,
      unread,
      updatedAt:now,
      lastMsg:{fromUid:uid,text,ts:now}
    };
    await tRef.set(base);
    await database.ref(`messages/${tid}/msgs`).push({fromUid:uid,text,ts:now});

    activeTid=tid;
    closeNewThreadModal();
    openOverlay();
  }

  /* --------------------------------------------------------------- */
  /* Recipient scoping                                                */
  /* --------------------------------------------------------------- */
  function buildEligibleRecipients(users,u,r){
    const arr=[];
    const me=users[u];
    if(!users) return arr;
    if(r===ROLES.ADMIN){
      Object.entries(users).forEach(([id,usr])=>{
        if(id===u)return;
        arr.push({uid:id,label:(usr.name||usr.email||id)+" ("+usr.role+")"});
      });
      return arr;
    }
    if(r===ROLES.DM){
      const leads=Object.entries(users).filter(([,usr])=>usr.role===ROLES.LEAD && usr.assignedDM===u);
      const leadIds=leads.map(([id])=>id);
      const mes=Object.entries(users).filter(([,usr])=>usr.role===ROLES.ME && leadIds.includes(usr.assignedLead));
      leads.forEach(([id,usr])=>arr.push({uid:id,label:(usr.name||usr.email||id)+" (Lead)"}));
      mes.forEach(([id,usr])=>arr.push({uid:id,label:(usr.name||usr.email||id)}));
      return arr;
    }
    if(r===ROLES.LEAD){
      const dmUid=me?.assignedDM;
      if(dmUid && users[dmUid]){
        const dm=users[dmUid];
        arr.push({uid:dmUid,label:(dm.name||dm.email||dmUid)+" (DM)"});
      }
      Object.entries(users).forEach(([id,usr])=>{
        if(usr.role===ROLES.ME && usr.assignedLead===u){
          arr.push({uid:id,label:(usr.name||usr.email||id)});
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

  /* --------------------------------------------------------------- */
  /* Utils                                                            */
  /* --------------------------------------------------------------- */
  function esc(str){
    return (str||"").toString()
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;");
  }
  function escAttr(str){ return esc(str).replace(/'/g,"&#39;"); }
  function shortText(str,max){ str=str||""; return str.length>max?str.slice(0,max-1)+"…":str; }
  function participantsHuman(partMap){
    const users=window._users||{};
    const names=[];
    Object.keys(partMap||{}).forEach(id=>{
      const u=users[id];
      names.push(u?.name||u?.email||id);
    });
    return names.join(", ");
  }

  /* --------------------------------------------------------------- */
  /* CSS injection once                                               */
  /* --------------------------------------------------------------- */
  (function injectCss(){
    if(document.getElementById("msg-overlay-css"))return;
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

})(); // end IIFE