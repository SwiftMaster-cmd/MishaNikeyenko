/* =======================================================================
 * employee/guest-portal.js  (Full-Denomination Weighted Pitch Quality)
 * -----------------------------------------------------------------------
 * No field is hard-required for submit, BUT each has a weight. The overall
 * Pitch Quality % is the % of *total possible points across ALL questions*
 * that are earned by the current answers. Therefore, completing Step 1
 * will only earn a small % (its weights) and cannot "max out" the bar.
 *
 * Live preview updates as user types; saved % updates after each submit.
 * Completion object is written to guestinfo/<gid>/completion.
 * =======================================================================
 */

/* -----------------------------------------------------------------------
 * Firebase init
 * -------------------------------------------------------------------- */
const firebaseConfig = {
  apiKey: "AIzaSyD9fILTNJQ0wsPkdLrhRGV9dslMzE",
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

/* -----------------------------------------------------------------------
 * Options
 * -------------------------------------------------------------------- */
const GP_SHOW_PREVIEW = window.GP_SHOW_PREVIEW !== false; // default true

/* -----------------------------------------------------------------------
 * Field Weight Config  (EDIT ME)
 * -------------------------------------------------------------------- */
const GP_FIELD_CONFIG = (()=>{
  // Allow override before load: window.GP_FIELD_CONFIG_OVERRIDE
  const o = window.GP_FIELD_CONFIG_OVERRIDE || {};
  const base = {
    custName:     {step:"step1", weight:10,  minLen:1},
    custPhone:    {step:"step1", weight:10,  minLen:7},
    serviceType:  {step:"step2", weight:20,  required:true},
    situation:    {step:"step2", weight:15,  minLen:10},
    carrierInfo:  {step:"step2", weight:25,  required:true, minLen:3},
    requirements: {step:"step2", weight:10,  minLen:3},
    solutionText: {step:"step3", weight:20,  minLen:5}
  };
  return {...base, ...o};
})();

/* Utility: sum total weight */
const GP_TOTAL_WEIGHT = Object.values(GP_FIELD_CONFIG)
  .reduce((sum,cfg)=>sum + Number(cfg.weight||0), 0) || 1;

/* -----------------------------------------------------------------------
 * Normalization
 * -------------------------------------------------------------------- */
function normalizeGuest(raw){
  const g = raw && typeof raw==="object" ? {...raw} : {};
  // ensure nested objects
  g.evaluate = g.evaluate && typeof g.evaluate==="object" ? {...g.evaluate} : {};
  g.solution = g.solution && typeof g.solution==="object" ? {...g.solution} : {};

  // cascade legacy top-level -> evaluate
  if (g.serviceType && !g.evaluate.serviceType) g.evaluate.serviceType = g.serviceType;
  if (g.situation   && !g.evaluate.situation)   g.evaluate.situation   = g.situation;

  // status inference if missing
  if (!g.status) {
    if (g.sale) g.status="sold";
    else if (g.solution && (g.solution.text||g.solution.completedAt)) g.status="proposal";
    else if (g.evaluate && (g.evaluate.serviceType||g.evaluate.situation||g.evaluate.carrierInfo||g.evaluate.requirements)) g.status="working";
    else g.status="new";
  }
  g.status = (g.status||"new").toLowerCase();
  return g;
}

/* -----------------------------------------------------------------------
 * Scoring
 * -------------------------------------------------------------------- */

/** Return {value:rawString, len:length, present:boolean} */
function _valInfo(v){
  if (v == null) return {value:"",len:0,present:false};
  if (typeof v === "string") {
    const s=v.trim();
    return {value:s,len:s.length,present:s.length>0};
  }
  if (typeof v === "object") {
    // Accept object -> if any leaf non-empty treat present
    for (const k in v){
      const inf=_valInfo(v[k]);
      if (inf.present) return {value:String(v[k]),len:inf.len,present:true};
    }
    return {value:"",len:0,present:false};
  }
  // number/boolean -> count as present
  const s=String(v);
  return {value:s,len:s.length,present:true};
}

/** Score a single field given config. Returns {earned,max,filled,partial} */
function scoreField(info,cfg){
  const max = Number(cfg.weight||0);
  if (!info.present) return {earned:0,max,filled:false,partial:false};
  // quality by length threshold (optional)
  const minLen = Number(cfg.minLen||0);
  if (minLen>0 && info.len < minLen) {
    // half credit if present but short
    return {earned:max*0.5,max,filled:true,partial:true};
  }
  return {earned:max,max,filled:true,partial:false};
}

/**
 * computeFullPitchQuality(guest) -> {
 *   pct, earned, max,
 *   fields:{custName:{earned,max,...}, ...},
 *   steps:{step1:{earned,max,pct},...}
 * }
 */
function computeFullPitchQuality(guest){
  const g = normalizeGuest(guest);
  const fieldsOut = {};
  const stepsAgg  = {};
  let earned=0;

  function stepAgg(step,addEarned,addMax){
    if(!stepsAgg[step]) stepsAgg[step]={earned:0,max:0};
    stepsAgg[step].earned += addEarned;
    stepsAgg[step].max    += addMax;
  }

  for (const [field,cfg] of Object.entries(GP_FIELD_CONFIG)){
    let raw;
    switch(field){
      case "custName":     raw=g.custName;break;
      case "custPhone":    raw=g.custPhone;break;
      case "serviceType":  raw=g.evaluate.serviceType;break;
      case "situation":    raw=g.evaluate.situation;break;
      case "carrierInfo":  raw=g.evaluate.carrierInfo;break;
      case "requirements": raw=g.evaluate.requirements;break;
      case "solutionText": raw=g.solution.text;break;
      default:             raw=g[field];break;
    }
    const info = _valInfo(raw);
    const res  = scoreField(info,cfg);
    fieldsOut[field] = {
      earned:res.earned,
      max:res.max,
      filled:res.filled,
      partial:res.partial,
      required:!!cfg.required,
      len:info.len
    };
    earned += res.earned;
    stepAgg(cfg.step||"step1",res.earned,res.max);
  }

  // finalize steps
  for (const s in stepsAgg){
    const st=stepsAgg[s];
    st.pct = st.max? Math.round(st.earned/st.max*100) : 0;
  }

  const max = GP_TOTAL_WEIGHT;
  const pct = max? Math.round(earned/max*100) : 0;

  return {pct,earned,max,fields:fieldsOut,steps:stepsAgg,status:g.status};
}

/* -----------------------------------------------------------------------
 * Global (export) so dashboard guestinfo.js can reuse same calc
 * -------------------------------------------------------------------- */
window.computeFullPitchQuality = computeFullPitchQuality;
window.normalizeGuestPortal    = normalizeGuest; // export if needed

/* -----------------------------------------------------------------------
 * Progress bar UI helpers
 * -------------------------------------------------------------------- */
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

/* -----------------------------------------------------------------------
 * State
 * -------------------------------------------------------------------- */
let currentEntryKey=null;   // guestinfo/<key>
let currentGuestObj=null;   // normalized snapshot
let _gp_bound=false;        // form listeners bound

/* -----------------------------------------------------------------------
 * Load existing record by ?gid or legacy ?entry
 * -------------------------------------------------------------------- */
async function loadExistingGuestIfParam(){
  const key=qs('gid')||qs('entry'); if(!key)return false;
  try{
    const snap=await db.ref(`guestinfo/${key}`).get();
    const data=snap.val();
    if(data){
      currentEntryKey=key;
      currentGuestObj=normalizeGuest(data);
      return true;
    }
  }catch(e){console.error("guest-portal: load error",e);}
  return false;
}

/* -----------------------------------------------------------------------
 * Build temp guest from current form field values (for preview only)
 * -------------------------------------------------------------------- */
function buildTempGuestFromForms(){
  const g=currentGuestObj?JSON.parse(JSON.stringify(currentGuestObj)):{};

  // Step1
  const nameEl=document.getElementById('custName');
  const phoneEl=document.getElementById('custPhone');
  if(nameEl)g.custName=nameEl.value.trim();
  if(phoneEl)g.custPhone=phoneEl.value.trim();

  // Step2
  const stEl=document.getElementById('serviceType');
  const sitEl=document.getElementById('situation');
  const carEl=document.getElementById('evalCarrier');
  const reqEl=document.getElementById('evalRequirements');
  if(!g.evaluate)g.evaluate={};
  if(stEl)g.evaluate.serviceType=stEl.value;
  if(sitEl)g.evaluate.situation=sitEl.value.trim();
  if(carEl)g.evaluate.carrierInfo=carEl.value.trim();
  if(reqEl)g.evaluate.requirements=reqEl.value.trim();

  // Step3
  const solEl=document.getElementById('solutionText');
  if(!g.solution)g.solution={};
  if(solEl)g.solution.text=solEl.value.trim();

  return normalizeGuest(g);
}

/* -----------------------------------------------------------------------
 * Live preview updater (debounced-ish via input/change)
 * -------------------------------------------------------------------- */
function updateProgressPreviewFromForms(){
  if(!GP_SHOW_PREVIEW)return;
  const temp=buildTempGuestFromForms();
  const comp=computeFullPitchQuality(temp);
  // Show only if >1% diff from saved baseline
  const saved = currentGuestObj ? computeFullPitchQuality(currentGuestObj).pct : 0;
  const diff  = Math.abs(Math.round(comp.pct) - Math.round(saved));
  updateProgressPreview(diff>1?comp.pct:null);
}

/* -----------------------------------------------------------------------
 * Bind realtime form listeners once
 * -------------------------------------------------------------------- */
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

/* -----------------------------------------------------------------------
 * Sync UI from loaded record
 * -------------------------------------------------------------------- */
function syncUiToLoadedGuest(){
  if(!currentGuestObj)return;
  ensureProgressBarContainer();
  const comp=computeFullPitchQuality(currentGuestObj);
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

  // Show next needed step
  if(!ev || (!ev.serviceType && !ev.situation && !ev.carrierInfo && !ev.requirements)){
    show('step2Form');hide('step3Form');
  } else {
    hide('step2Form');show('step3Form');
  }

  bindRealtimeFieldListeners();
}

/* -----------------------------------------------------------------------
 * Auth guard
 * -------------------------------------------------------------------- */
auth.onAuthStateChanged(async user=>{
  if(!user){
    window.location.href="../login.html";
    return;
  }
  const found=await loadExistingGuestIfParam();
  if(found){syncUiToLoadedGuest();return;}

  // new record flow
  ensureProgressBarContainer();
  updateProgressBarSaved(0);
  updateProgressPreview(null);
  show('step1Form');
  bindRealtimeFieldListeners();
});

/* -----------------------------------------------------------------------
 * Write (recompute) completion to DB
 * -------------------------------------------------------------------- */
async function writeCompletionPct(gid,guestObj){
  const comp=computeFullPitchQuality(normalizeGuest(guestObj));
  try{
    await db.ref(`guestinfo/${gid}/completion`).set({
      pct:Math.round(comp.pct),
      earned:comp.earned,
      max:comp.max,
      steps:comp.steps||{},
      fields:comp.fields||{},
      updatedAt:Date.now()
    });
  }catch(err){console.warn("guest-portal: completion write failed",err);}
  updateProgressBarSaved(comp.pct);
  updateProgressPreview(null);
}

/* -----------------------------------------------------------------------
 * STEP 1 submit
 * -------------------------------------------------------------------- */
const step1El=document.getElementById('step1Form');
if(step1El){
  step1El.addEventListener('submit',async e=>{
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
      currentGuestObj.status=currentGuestObj.status||"new";
      currentGuestObj=normalizeGuest(currentGuestObj);

      statusMsg('status1','Saved.','success');
      await writeCompletionPct(currentEntryKey,currentGuestObj);

      hide('step1Form');show('step2Form');
      injectPrefillSummary(custName,custPhone);
      bindRealtimeFieldListeners();
    }catch(err){
      statusMsg('status1','Error: '+err.message,'error');
    }
  });
}

/* -----------------------------------------------------------------------
 * STEP 2 submit
 * -------------------------------------------------------------------- */
const step2El=document.getElementById('step2Form');
if(step2El){
  step2El.addEventListener('submit',async e=>{
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
      currentGuestObj=normalizeGuest(currentGuestObj);

      statusMsg('status2','Saved.','success');
      await writeCompletionPct(currentEntryKey,currentGuestObj);
      hide('step2Form');show('step3Form');
      bindRealtimeFieldListeners();
    }catch(err){
      statusMsg('status2','Error: '+err.message,'error');
    }
  });
}

/* -----------------------------------------------------------------------
 * STEP 3 submit
 * -------------------------------------------------------------------- */
const step3El=document.getElementById('step3Form');
if(step3El){
  step3El.addEventListener('submit',async e=>{
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
      currentGuestObj=normalizeGuest(currentGuestObj);

      statusMsg('status3','Saved.','success');
      await writeCompletionPct(currentEntryKey,currentGuestObj);
    }catch(err){
      statusMsg('status3','Error: '+err.message,'error');
    }
  });
}

/* -----------------------------------------------------------------------
 * Manual recompute (debug helper)
 * -------------------------------------------------------------------- */
window.gpRecomputeCompletion=async function(gid){
  const key=gid||currentEntryKey; if(!key)return;
  const snap=await db.ref(`guestinfo/${key}`).get();
  const data=snap.val()||{};
  currentGuestObj=normalizeGuest(data);
  await writeCompletionPct(key,currentGuestObj);
};

/* -----------------------------------------------------------------------
 * Inline CSS (if not in stylesheet)
 * -------------------------------------------------------------------- */
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
  const tag=document.createElement('style');
  tag.id='gp-progress-css';
  tag.textContent=css;
  document.head.appendChild(tag);
})();