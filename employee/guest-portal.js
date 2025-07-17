// employee/guest-portal.js  (Unified Pitch Quality; Saved vs Live Preview)

/* =======================================================================
   Requires shared/guest-completion-util.js loaded first!
   ======================================================================= */

/* Firebase init ------------------------------------------------------- */
const firebaseConfig = {
  apiKey: "AIzaSyD9fILTNJQ0wsPftUsPkdLrhRGV9dslMzE",
  authDomain: "osls-644fd.firebaseapp.com",
  databaseURL: "https://osls-644fd-default-rtdb.firebaseio.com",
  projectId: "osls-644fd",
  storageBucket: "osls-644fd.appspot.com",
  messagingSenderId: "798578046321",
  appId: "1:798578046321:web:8758776701786a2fccf2d0",
  measurementId: "G-9HWXNSBE1T"
};
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db   = firebase.database();
const auth = firebase.auth();

/* Options ------------------------------------------------------------- */
const GP_SHOW_PREVIEW = window.GP_SHOW_PREVIEW !== false; // default true

/* DOM helpers --------------------------------------------------------- */
function qs(name){ return new URLSearchParams(window.location.search).get(name); }
function show(id){ document.getElementById(id)?.classList.remove('hidden'); }
function hide(id){ document.getElementById(id)?.classList.add('hidden'); }
function statusMsg(id,msg,cls=''){
  const el=document.getElementById(id); if(!el)return;
  el.textContent=msg; el.className='g-status'; if(cls)el.classList.add(cls);
}
function injectPrefillSummary(name,phone){
  const step2=document.getElementById('step2Form'); if(!step2)return;
  let summary=document.getElementById('prefillSummary');
  if(!summary){
    summary=document.createElement('div');
    summary.id='prefillSummary';
    summary.className='prefill-summary';
    summary.style.marginBottom='1rem';
    step2.insertBefore(summary,step2.firstChild);
  }
  summary.innerHTML=`<b>Customer:</b> ${name||'-'} &nbsp; <b>Phone:</b> ${phone||'-'}`;
}

/* Progress bar -------------------------------------------------------- */
function ensureProgressBarContainer(){
  let bar=document.getElementById('gp-progress'); if(bar)return bar;
  bar=document.createElement('div'); bar.id='gp-progress'; bar.className='gp-progress';
  bar.innerHTML=`
    <div class="gp-progress-label">
      Pitch Quality: <span id="gp-progress-pct">0%</span>
      <span id="gp-progress-preview" class="gp-progress-preview" style="display:none;">(preview: <span id="gp-progress-preview-val"></span>)</span>
    </div>
    <div class="gp-progress-bar"><div id="gp-progress-fill" class="gp-progress-fill" style="width:0%;"></div></div>
  `;
  const hook=document.getElementById('gp-progress-hook')||document.querySelector('.guest-portal-progress-hook')||document.body.firstElementChild;
  (hook?.parentNode||document.body).insertBefore(bar,hook||document.body.firstChild);
  return bar;
}
function _setBarColor(fillEl,pct){
  fillEl.className='gp-progress-fill';
  if(pct>=75)fillEl.classList.add('gp-progress-green');
  else if(pct>=40)fillEl.classList.add('gp-progress-yellow');
  else fillEl.classList.add('gp-progress-red');
}
function updateProgressBarSaved(pct){
  ensureProgressBarContainer();
  const p=Math.max(0,Math.min(100,Math.round(pct)));
  const pctEl=document.getElementById('gp-progress-pct');
  const fillEl=document.getElementById('gp-progress-fill');
  if(pctEl)pctEl.textContent=p+'%';
  if(fillEl){fillEl.style.width=p+'%';_setBarColor(fillEl,p);}
}
function updateProgressPreview(pct){
  if(!GP_SHOW_PREVIEW)return;
  const wrap=document.getElementById('gp-progress-preview');
  const valEl=document.getElementById('gp-progress-preview-val');
  if(!wrap||!valEl)return;
  if(pct==null){wrap.style.display='none';return;}
  const p=Math.max(0,Math.min(100,Math.round(pct)));
  valEl.textContent=p+'%';
  wrap.style.display='';
}

/* State --------------------------------------------------------------- */
let currentEntryKey=null;
let currentGuestObj=null; // last saved snapshot (normalized)
let _gp_bound=false;

/* Load existing ------------------------------------------------------- */
async function loadExistingGuestIfParam(){
  const key=qs('gid')||qs('entry'); if(!key)return false;
  try{
    const snap=await db.ref(`guestinfo/${key}`).get();
    const data=snap.val();
    if(data){
      currentEntryKey=key;
      currentGuestObj=window.normalizeGuestForCompletion?normalizeGuestForCompletion(data):data;
      return true;
    }
  }catch(e){console.error("guest-portal: load error",e);}
  return false;
}

/* Build temp guest from onscreen fields (for preview only) ------------ */
function buildTempGuestFromForms(){
  const g=currentGuestObj?JSON.parse(JSON.stringify(currentGuestObj)):{};
  // step1
  const nameEl=document.getElementById('custName');
  const phoneEl=document.getElementById('custPhone');
  if(nameEl)g.custName=nameEl.value.trim();
  if(phoneEl)g.custPhone=phoneEl.value.trim();
  // step2
  const stEl=document.getElementById('serviceType');
  const sitEl=document.getElementById('situation');
  const carEl=document.getElementById('evalCarrier');
  const reqEl=document.getElementById('evalRequirements');
  if(!g.evaluate)g.evaluate={};
  if(stEl)g.evaluate.serviceType=stEl.value;
  if(sitEl)g.evaluate.situation=sitEl.value.trim();
  if(carEl)g.evaluate.carrierInfo=carEl.value.trim();
  if(reqEl)g.evaluate.requirements=reqEl.value.trim();
  // step3
  const solEl=document.getElementById('solutionText');
  if(!g.solution)g.solution={};
  if(solEl)g.solution.text=solEl.value.trim();
  return g;
}
function updateProgressPreviewFromForms(){
  if(!GP_SHOW_PREVIEW)return;
  const temp=buildTempGuestFromForms();
  const comp=window.computeGuestPitchQuality?computeGuestPitchQuality(temp):{pct:0};
  // show only if diff >1% from saved
  const saved = currentGuestObj?window.computeGuestPitchQuality(currentGuestObj).pct:0;
  const diff=Math.abs(Math.round(comp.pct)-Math.round(saved));
  updateProgressPreview(diff>1?comp.pct:null);
}

/* Bind realtime listeners once --------------------------------------- */
function bindRealtimeFieldListeners(){
  if(_gp_bound)return;
  _gp_bound=true;
  const ids=['custName','custPhone','serviceType','situation','evalCarrier','evalRequirements','solutionText'];
  ids.forEach(id=>{
    const el=document.getElementById(id);
    if(!el)return;
    const evt=el.tagName==='SELECT'?'change':'input';
    el.addEventListener(evt,updateProgressPreviewFromForms);
  });
}

/* Sync UI from loaded record ------------------------------------------ */
function syncUiToLoadedGuest(){
  if(!currentGuestObj)return;
  ensureProgressBarContainer();
  // baseline saved %
  const comp=window.computeGuestPitchQuality?computeGuestPitchQuality(currentGuestObj):{pct:0};
  updateProgressBarSaved(comp.pct);
  updateProgressPreview(null);

  hide('step1Form');
  injectPrefillSummary(currentGuestObj.custName,currentGuestObj.custPhone);

  const ev=currentGuestObj.evaluate;
  const sol=currentGuestObj.solution;

  if(ev){
    const stEl=document.getElementById('serviceType');
    const sitEl=document.getElementById('situation');
    const carEl=document.getElementById('evalCarrier');
    const reqEl=document.getElementById('evalRequirements');
    if(stEl)stEl.value=ev.serviceType||'';
    if(sitEl)sitEl.value=ev.situation||'';
    if(carEl)carEl.value=ev.carrierInfo||'';
    if(reqEl)reqEl.value=ev.requirements||'';
  }
  if(sol){
    const solEl=document.getElementById('solutionText');
    if(solEl)solEl.value=sol.text||'';
  }

  if(!ev){show('step2Form');hide('step3Form');}
  else {hide('step2Form');show('step3Form');}

  bindRealtimeFieldListeners();
}

/* Auth guard ---------------------------------------------------------- */
auth.onAuthStateChanged(async user=>{
  if(!user){
    window.location.href="../login.html";
    return;
  }
  const found=await loadExistingGuestIfParam();
  if(found){syncUiToLoadedGuest();return;}

  // new
  ensureProgressBarContainer();
  updateProgressBarSaved(0);
  updateProgressPreview(null);
  show('step1Form');
  bindRealtimeFieldListeners();
});

/* Write completion to DB ---------------------------------------------- */
async function writeCompletionPct(gid,guestObj){
  const comp=window.computeGuestPitchQuality?computeGuestPitchQuality(guestObj):{pct:0};
  try{
    await db.ref(`guestinfo/${gid}/completion`).set({
      pct:Math.round(comp.pct),
      steps:comp.steps,
      fields:comp.fields,
      updatedAt:Date.now()
    });
  }catch(err){console.warn("guest-portal: completion write failed",err);}
  // update saved bar
  updateProgressBarSaved(comp.pct);
  updateProgressPreview(null);
}

/* STEP 1 --------------------------------------------------------------- */
document.getElementById('step1Form')
  .addEventListener('submit',async e=>{
    e.preventDefault();
    statusMsg('status1','', '');
    const custName=document.getElementById('custName').value.trim();
    const custPhone=document.getElementById('custPhone').value.trim();
    try{
      if(currentEntryKey){
        await db.ref(`guestinfo/${currentEntryKey}`).update({
          custName,custPhone,updatedAt:Date.now()
        });
      }else{
        const refPush=await db.ref('guestinfo').push({
          custName,custPhone,
          submittedAt:Date.now(),
          userUid:auth.currentUser?.uid||null,
          status:"new"
        });
        currentEntryKey=refPush.key;
      }
      if(!currentGuestObj)currentGuestObj={};
      currentGuestObj.custName=custName;
      currentGuestObj.custPhone=custPhone;

      statusMsg('status1','Saved.','success');
      await writeCompletionPct(currentEntryKey,currentGuestObj);

      hide('step1Form');show('step2Form');
      injectPrefillSummary(custName,custPhone);
      bindRealtimeFieldListeners();
    }catch(err){
      statusMsg('status1','Error: '+err.message,'error');
    }
  });

/* STEP 2 --------------------------------------------------------------- */
document.getElementById('step2Form')
  .addEventListener('submit',async e=>{
    e.preventDefault();
    statusMsg('status2','', '');
    const serviceType=document.getElementById('serviceType').value;
    const situation=document.getElementById('situation').value.trim();
    const carrierInfo=document.getElementById('evalCarrier').value.trim();
    const requirements=document.getElementById('evalRequirements').value.trim();
    if(!currentEntryKey){
      statusMsg('status2','Missing guest record.','error');return;
    }
    try{
      const now=Date.now();
      await db.ref(`guestinfo/${currentEntryKey}`).update({
        evaluate:{serviceType,situation,carrierInfo,requirements},
        status:"working",
        updatedAt:now
      });
      if(!currentGuestObj)currentGuestObj={};
      currentGuestObj.evaluate={serviceType,situation,carrierInfo,requirements};
      currentGuestObj.status="working";
      statusMsg('status2','Saved.','success');
      await writeCompletionPct(currentEntryKey,currentGuestObj);
      hide('step2Form');show('step3Form');
      bindRealtimeFieldListeners();
    }catch(err){
      statusMsg('status2','Error: '+err.message,'error');
    }
  });

/* STEP 3 --------------------------------------------------------------- */
document.getElementById('step3Form')
  .addEventListener('submit',async e=>{
    e.preventDefault();
    statusMsg('status3','', '');
    const solutionText=document.getElementById('solutionText').value.trim();
    if(!currentEntryKey){
      statusMsg('status3','Missing guest record.','error');return;
    }
    try{
      const now=Date.now();
      await db.ref(`guestinfo/${currentEntryKey}`).update({
        solution:{text:solutionText,completedAt:now},
        status:"proposal",
        updatedAt:now
      });
      if(!currentGuestObj)currentGuestObj={};
      currentGuestObj.solution={text:solutionText,completedAt:now};
      currentGuestObj.status="proposal";
      statusMsg('status3','Saved.','success');
      await writeCompletionPct(currentEntryKey,currentGuestObj);
    }catch(err){
      statusMsg('status3','Error: '+err.message,'error');
    }
  });

/* Manual recompute ---------------------------------------------------- */
window.gpRecomputeCompletion=async function(gid){
  const key=gid||currentEntryKey; if(!key)return;
  const snap=await db.ref(`guestinfo/${key}`).get();
  const data=snap.val()||{};
  currentGuestObj=window.normalizeGuestForCompletion?normalizeGuestForCompletion(data):data;
  await writeCompletionPct(key,currentGuestObj);
};

/* Inline CSS (if not in stylesheet) ----------------------------------- */
(function injectGpProgressCss(){
  if(document.getElementById('gp-progress-css'))return;
  const css=`
    .gp-progress{width:100%;margin:1rem auto 1.5rem;max-width:480px;text-align:center;font-family:inherit;}
    .gp-progress-label{margin-bottom:.25rem;font-weight:600;}
    .gp-progress-preview{margin-left:.5em;font-weight:400;opacity:.8;font-size:.9em;}
    .gp-progress-bar{width:100%;height:8px;border-radius:4px;background:rgba(255,255,255,.15);overflow:hidden;position:relative;}
    .gp-progress-fill{height:100%;width:0%;transition:width .25s;background:#82caff;}
    .gp-progress-fill.gp-progress-green{background:#00c853;}
    .gp-progress-fill.gp-progress-yellow{background:#ffb300;}
    .gp-progress-fill.gp-progress-red{background:#ff5252;}
  `;
  const tag=document.createElement('style');tag.id='gp-progress-css';tag.textContent=css;document.head.appendChild(tag);
})();