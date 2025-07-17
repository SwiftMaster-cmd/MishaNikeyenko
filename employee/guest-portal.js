/* ==========================================================================
 * OSL Guest Portal  –  Autosave, Weighted Pitch, Revertable Steps
 * ========================================================================== */

/* --------------------------------------------------------------------------
 * Firebase init (guarded)
 * ----------------------------------------------------------------------- */
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

/* --------------------------------------------------------------------------
 * Tunables
 * ----------------------------------------------------------------------- */
const AUTO_STATUS_ESCALATE = true;       // auto bump status based on data
const AUTOSAVE_DEBOUNCE_MS = 600;        // wait after blur/change group
const AUTOSAVE_IDLE_MS     = 3000;       // type idle (no blur) -> autosave
const COMPLETION_DEBOUNCE_MS = 900;      // write /completion after save

/* --------------------------------------------------------------------------
 * Pitch Weights (adjust to taste; totals auto-sum)
 * ----------------------------------------------------------------------- */
const PITCH_WEIGHTS = {
  // Step 1
  custName:      8,
  custPhone:     7,

  // Step 2 (core pillars first 5 = "bundle")
  currentCarrier:12,
  numLines:      8,
  coverageZip:   8,
  deviceStatus:  8,
  finPath:       12,

  // Optional extras (collapsed / details)
  billPain:      4,
  dataNeed:      4,
  hotspotNeed:   2,
  intlNeed:      2,

  // Legacy (0 pts – historical notes)
  serviceType:   0,
  situation:     0,
  carrierInfo:   0,
  requirements:  0,

  // Step 3
  solutionText:  25
};

/* Tier groupings for coaching chips */
const TIER_A_FIELDS = ["currentCarrier","numLines","coverageZip","deviceStatus","finPath"]; // Must
const TIER_B_FIELDS = ["billPain","dataNeed","hotspotNeed","intlNeed"];                     // Should

/* Field -> step */
const FIELD_STEP = {
  custName:"step1", custPhone:"step1",
  currentCarrier:"step2", numLines:"step2", coverageZip:"step2",
  deviceStatus:"step2", finPath:"step2", billPain:"step2",
  dataNeed:"step2", hotspotNeed:"step2", intlNeed:"step2",
  serviceType:"step2", situation:"step2", carrierInfo:"step2", requirements:"step2",
  solutionText:"step3"
};

/* Status -> expected steps (only used if you need stage %) */
const STATUS_STEPS = {
  new:["step1"],
  working:["step1","step2"],
  proposal:["step1","step2","step3"],
  sold:["step1","step2","step3"]
};

/* --------------------------------------------------------------------------
 * Utilities
 * ----------------------------------------------------------------------- */
const $  = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
function qs(name){ return new URLSearchParams(window.location.search).get(name); }
function show(id){ document.getElementById(id)?.classList.remove('hidden'); }
function hide(id){ document.getElementById(id)?.classList.add('hidden'); }
function statusMsg(id,msg,cls=''){
  const el=document.getElementById(id); if(!el)return;
  el.textContent=msg;
  el.className='g-status';
  if(cls)el.classList.add(cls);
}

function detectStatus(g){
  const s=(g?.status||"").toLowerCase();
  if (s) return s;
  if (g?.sale) return "sold";
  if (g?.solution && g.solution.text) return "proposal";
  if (g?.evaluate && hasAnyEvalData(g.evaluate)) return "working";
  return "new";
}
function normGuest(g){
  const out = g ? JSON.parse(JSON.stringify(g)) : {};
  out.evaluate = out.evaluate || {};
  out.solution = out.solution || {};
  return out;
}
function hasVal(v){
  if (v==null) return false;
  if (typeof v==="string") return v.trim()!=="";
  if (typeof v==="number") return true;
  if (typeof v==="boolean") return v; // only true counts
  if (Array.isArray(v)) return v.length>0;
  if (typeof v==="object") return Object.keys(v).length>0;
  return false;
}
function hasAnyEvalData(e){
  if (!e) return false;
  return (
    hasVal(e.currentCarrier) ||
    hasVal(e.numLines)       ||
    hasVal(e.coverageZip)    ||
    hasVal(e.deviceStatus)   ||
    hasVal(e.finPath)        ||
    hasVal(e.billPain)       ||
    hasVal(e.dataNeed)       ||
    hasVal(e.hotspotNeed)    ||
    hasVal(e.intlNeed)       ||
    hasVal(e.serviceType)    ||
    hasVal(e.situation)      ||
    hasVal(e.carrierInfo)    ||
    hasVal(e.requirements)
  );
}

/* --------------------------------------------------------------------------
 * Field accessors (guest object)
 * ----------------------------------------------------------------------- */
function getFieldValue(g, key){
  const e=g?.evaluate||{};
  const sol=g?.solution||{};
  switch(key){
    case "custName":      return g?.custName;
    case "custPhone":     return g?.custPhone;

    case "currentCarrier":return e.currentCarrier ?? e.carrierInfo ?? "";
    case "numLines":      return e.numLines;
    case "coverageZip":   return e.coverageZip;
    case "deviceStatus":  return e.deviceStatus;
    case "finPath":       return e.finPath;
    case "billPain":      return e.billPain;
    case "dataNeed":      return e.dataNeed;
    case "hotspotNeed":   return e.hotspotNeed;
    case "intlNeed":      return e.intlNeed;

    case "serviceType":   return e.serviceType;
    case "situation":     return e.situation;
    case "carrierInfo":   return e.carrierInfo;
    case "requirements":  return e.requirements;

    case "solutionText":  return sol.text;
    default:              return undefined;
  }
}

/* --------------------------------------------------------------------------
 * Pitch computation
 * ----------------------------------------------------------------------- */
function computePitchFull(g, weights=PITCH_WEIGHTS){
  const steps={step1:{earned:0,max:0},step2:{earned:0,max:0},step3:{earned:0,max:0}};
  const fields={};
  let earnedFull=0, fullMax=0;
  for (const [key,wt] of Object.entries(weights)){
    const st=FIELD_STEP[key]||"step1";
    steps[st].max += wt;
    fullMax += wt;
    const v=getFieldValue(g,key);
    const ok=hasVal(v);
    if (ok) { steps[st].earned+=wt; earnedFull+=wt; }
    fields[key]={ok,wt};
  }
  const pctFull = fullMax? Math.round(earnedFull/fullMax*100):0;
  return {pctFull, earnedFull, fullMax, steps, fields};
}
function computePitchStage(g, weights=PITCH_WEIGHTS){
  const s=detectStatus(g);
  const inc=STATUS_STEPS[s]||["step1"];
  const comp=computePitchFull(g,weights);
  let stageMax=0, stageEarn=0;
  inc.forEach(st=>{stageMax+=comp.steps[st].max; stageEarn+=comp.steps[st].earned;});
  const pctStage = stageMax? Math.round(stageEarn/stageMax*100):0;
  return {...comp,status:s,pctStage,stageMax,stageEarn};
}

/* --------------------------------------------------------------------------
 * Prefill summary (Step 2+)
 * ----------------------------------------------------------------------- */
function injectPrefillSummary(name,phone){
  const step2=$("#step2Form"); if(!step2)return;
  let summary=$("#prefillSummary");
  if(!summary){
    summary=document.createElement('div');
    summary.id='prefillSummary';
    summary.className='prefill-summary';
    summary.style.marginBottom='1rem';
    step2.insertBefore(summary,step2.firstChild);
  }
  summary.innerHTML=`<b>Customer:</b> ${name||'-'} &nbsp; <b>Phone:</b> ${phone||'-'}`;
}

/* --------------------------------------------------------------------------
 * Progress bar
 * ----------------------------------------------------------------------- */
function ensureProgressBar(){
  let bar=$("#gp-progress"); if(bar)return bar;
  bar=document.createElement('div');
  bar.id='gp-progress';
  bar.className='gp-progress';
  bar.innerHTML=`
    <div class="gp-progress-label">
      Pitch Quality: <span id="gp-progress-pct">0%</span>
      <span id="gp-progress-preview" class="gp-progress-preview" style="display:none;">(preview: <span id="gp-progress-preview-val"></span>)</span>
    </div>
    <div class="gp-progress-bar">
      <div id="gp-progress-fill" class="gp-progress-fill" style="width:0%;"></div>
    </div>
  `;
  const hook=$("#gp-progress-hook")||document.querySelector('.guest-portal-progress-hook')||document.body.firstElementChild;
  (hook?.parentNode||document.body).insertBefore(bar,hook||document.body.firstChild);
  return bar;
}
function _progressColor(fillEl,p){
  fillEl.className='gp-progress-fill';
  if(p>=75)fillEl.classList.add('gp-progress-green');
  else if(p>=40)fillEl.classList.add('gp-progress-yellow');
  else fillEl.classList.add('gp-progress-red');
}
function setProgressSaved(p){
  ensureProgressBar();
  const pctEl=$("#gp-progress-pct");
  const fillEl=$("#gp-progress-fill");
  const pct=Math.max(0,Math.min(100,Math.round(p)));
  if(pctEl)pctEl.textContent=pct+"%";
  if(fillEl){fillEl.style.width=pct+"%";_progressColor(fillEl,pct);}
}
function setProgressPreview(pOrNull){
  const wrap=$("#gp-progress-preview");
  const valEl=$("#gp-progress-preview-val");
  if(!wrap||!valEl)return;
  if(pOrNull==null){wrap.style.display='none';return;}
  const pct=Math.max(0,Math.min(100,Math.round(pOrNull)));
  valEl.textContent=pct+"%";
  wrap.style.display='';
}

/* --------------------------------------------------------------------------
 * Step Navigation
 * ----------------------------------------------------------------------- */
function ensureStepNav(){
  let nav=$("#gp-step-nav"); if(nav)return nav;
  nav=document.createElement('div');
  nav.id='gp-step-nav';
  nav.className='gp-step-nav';
  nav.innerHTML=`
    <button type="button" data-step="step1">1. Customer</button>
    <button type="button" data-step="step2">2. Evaluate</button>
    <button type="button" data-step="step3">3. Solution</button>
  `;
  const bar=$("#gp-progress")||ensureProgressBar();
  bar.parentNode.insertBefore(nav,bar.nextSibling);
  nav.addEventListener('click',e=>{
    const btn=e.target.closest('button[data-step]'); if(!btn)return;
    gotoStep(btn.dataset.step);
  });
  return nav;
}
function markStepActive(step){
  const nav=$("#gp-step-nav"); if(!nav)return;
  [...nav.querySelectorAll('button')].forEach(btn=>{
    btn.classList.toggle('active',btn.dataset.step===step);
  });
}

/* --------------------------------------------------------------------------
 * Revert link binding (if spans exist in HTML)
 * ----------------------------------------------------------------------- */
function ensureRevertLinks(){
  const rev1=$("#gp-revert-step1");
  const rev2=$("#gp-revert-step2");
  if(rev1)rev1.onclick=()=>revertTo("step1");
  if(rev2)rev2.onclick=()=>revertTo("step2");
}

/* --------------------------------------------------------------------------
 * Collapsible "extra eval" support (optional)
 * If your HTML already wraps extras in <details.gp-extra>, skip.
 * This is non-destructive; it won't double-wrap.
 * ----------------------------------------------------------------------- */
function ensureEvalExtrasWrap(){
  const frm=$("#step2Form"); if(!frm)return;
  if(frm.querySelector('.gp-extra')) return; // already wrapped

  // Identify nodes after the first 5 bundle questions (currentCarrier..finPath)
  const extraIds = [
    'billPain','dataNeed','hotspotNeed','intlNeed',
    'serviceType','situation','evalCarrier','evalRequirements'
  ];
  const extras = extraIds.map(id=>document.getElementById(id)?.closest('.glabel')||null).filter(Boolean);
  if(!extras.length) return;

  const det=document.createElement('details');
  det.className='gp-extra';
  det.id='gp-eval-extra';
  det.innerHTML=`<summary>Show Extra Questions (optional)</summary><div class="gp-extra-inner"></div>`;
  const inner=det.querySelector('.gp-extra-inner');

  // insert det before first extra element
  const firstExtra=extras[0];
  frm.insertBefore(det, firstExtra);

  extras.forEach(node=>inner.appendChild(node));
}

/* --------------------------------------------------------------------------
 * Live preview & autosave binding
 * ----------------------------------------------------------------------- */
let _liveBound=false;
let _idleTO=null;
let _autosaveTO=null;
let _completionTO=null;
function bindLivePreview(){
  if(_liveBound)return;
  _liveBound=true;
  const ids=[
    // step1
    'custName','custPhone',
    // bundle (top 5)
    'currentCarrierSel','numLines','coverageZip','deviceStatus','finPath',
    // extras
    'billPain','dataNeed','hotspotNeed','intlNeed',
    'serviceType','situation','evalCarrier','evalRequirements',
    // step3
    'solutionText'
  ];
  ids.forEach(id=>{
    const el=document.getElementById(id); if(!el)return;
    const type=el.tagName==="SELECT"||el.type==="number"?"change":"input";
    el.addEventListener(type,handleLiveInput,{passive:true});
    el.addEventListener('blur',handleFieldBlur,{passive:true});
  });
}

/* Called on keystroke/change – update preview but don't save yet */
function handleLiveInput(){
  // preview % from form data
  const live = buildGuestFromForms();
  const comp = computePitchFull(live);
  const savedPct = currentGuestObj? computePitchFull(currentGuestObj).pctFull : 0;
  const diff = Math.abs(comp.pctFull - savedPct);
  setProgressPreview(diff>1?comp.pctFull:null);
  updateNbqChips(live);

  // idle autosave if user pauses typing
  if(_idleTO) clearTimeout(_idleTO);
  _idleTO = setTimeout(()=>commitAutosaveFromDom(), AUTOSAVE_IDLE_MS);
}

/* Called when user leaves a field – commit sooner */
function handleFieldBlur(){
  commitAutosaveFromDom();
}

/* Build guest object from current form field values */
function buildGuestFromForms(){
  const g = currentGuestObj? JSON.parse(JSON.stringify(currentGuestObj)) : {status:"new",evaluate:{},solution:{}};
  g.evaluate = g.evaluate || {};
  g.solution = g.solution || {};

  // Step1
  const nameEl=$("#custName"); if(nameEl)g.custName=nameEl.value.trim();
  const phoneEl=$("#custPhone"); if(phoneEl)g.custPhone=phoneEl.value.trim();

  // Structured Step2 bundle
  const curEl=$("#currentCarrierSel"); if(curEl)g.evaluate.currentCarrier=curEl.value;
  const linesEl=$("#numLines"); if(linesEl)g.evaluate.numLines=linesEl.value?Number(linesEl.value):null;
  const zipEl=$("#coverageZip"); if(zipEl)g.evaluate.coverageZip=zipEl.value.trim();
  const devEl=$("#deviceStatus"); if(devEl)g.evaluate.deviceStatus=devEl.value;
  const finEl=$("#finPath"); if(finEl)g.evaluate.finPath=finEl.value;

  // extras
  const billEl=$("#billPain"); if(billEl)g.evaluate.billPain=billEl.value.trim();
  const dataEl=$("#dataNeed"); if(dataEl)g.evaluate.dataNeed=dataEl.value;
  const hotEl=$("#hotspotNeed"); if(hotEl){const v=hotEl.value; g.evaluate.hotspotNeed=(v===""?null:(v==="true")); }
  const intlEl=$("#intlNeed"); if(intlEl){const v=intlEl.value; g.evaluate.intlNeed=(v===""?null:(v==="true")); }

  // legacy free text
  const stEl=$("#serviceType"); if(stEl)g.evaluate.serviceType=stEl.value;
  const sitEl=$("#situation"); if(sitEl)g.evaluate.situation=sitEl.value.trim();
  const carEl=$("#evalCarrier"); if(carEl)g.evaluate.carrierInfo=carEl.value.trim();
  const reqEl=$("#evalRequirements"); if(reqEl)g.evaluate.requirements=reqEl.value.trim();

  // Step3
  const solEl=$("#solutionText"); if(solEl) { g.solution.text=solEl.value.trim(); }

  // escalate status if configured
  if (AUTO_STATUS_ESCALATE) {
    let next = detectStatus(g); // will derive from data if no explicit
    g.status = next;
  } else {
    g.status = currentGuestObj?.status || detectStatus(g);
  }
  return g;
}

/* Debounced autosave aggregator */
function commitAutosaveFromDom(){
  if(_idleTO){clearTimeout(_idleTO);_idleTO=null;}
  if(_autosaveTO) clearTimeout(_autosaveTO);
  _autosaveTO = setTimeout(doAutosaveFromDom, AUTOSAVE_DEBOUNCE_MS);
}
async function doAutosaveFromDom(){
  _autosaveTO=null;
  const g = buildGuestFromForms();

  // create record if needed
  if(!currentEntryKey){
    const refPush = await db.ref('guestinfo').push({
      custName:g.custName||"",
      custPhone:g.custPhone||"",
      submittedAt:Date.now(),
      userUid:auth.currentUser?.uid||null,
      status:detectStatus(g) || "new",
      evaluate:g.evaluate||{},
      solution:g.solution||null
    });
    currentEntryKey=refPush.key;
    currentGuestObj=normGuest(g);
    statusMsg('status1','Saved.','success');
  }else{
    // patch update (write minimal)
    const now=Date.now();
    const updates={};
    updates[`guestinfo/${currentEntryKey}/custName`] = g.custName||"";
    updates[`guestinfo/${currentEntryKey}/custPhone`] = g.custPhone||"";
    updates[`guestinfo/${currentEntryKey}/evaluate`] = g.evaluate||{};
    if (hasVal(g.solution?.text)) {
      updates[`guestinfo/${currentEntryKey}/solution`] = {text:g.solution.text,completedAt: currentGuestObj?.solution?.completedAt || now};
    } else {
      updates[`guestinfo/${currentEntryKey}/solution`] = null;
    }
    updates[`guestinfo/${currentEntryKey}/status`] = detectStatus(g);
    updates[`guestinfo/${currentEntryKey}/updatedAt`] = now;
    try {
      await db.ref().update(updates);
      statusMsg('status1','Saved.','success');
      statusMsg('status2','Saved.','success');
      statusMsg('status3','Saved.','success');
    } catch(err){
      console.warn("autosave update failed",err);
      statusMsg('status1','Autosave error','error');
    }
    currentGuestObj = normGuest(g);
  }

  // update saved progress bar
  const comp = computePitchFull(currentGuestObj);
  setProgressSaved(comp.pctFull);
  setProgressPreview(null);
  updateNbqChips(currentGuestObj);

  // schedule completion doc write separately
  if(_completionTO) clearTimeout(_completionTO);
  _completionTO = setTimeout(()=>writeCompletionPct(currentEntryKey,currentGuestObj), COMPLETION_DEBOUNCE_MS);

  // adjust UI step highlight
  const s=detectStatus(currentGuestObj);
  markStepActive(s==="new"?"step1":(s==="working"?"step2":"step3"));
}

/* --------------------------------------------------------------------------
 * Next Best Question (coaching chips)
 * ----------------------------------------------------------------------- */
function ensureNbqContainer(){
  let c=$("#gp-nbq"); if(c)return c;
  c=document.createElement('div');
  c.id='gp-nbq';
  c.className='gp-nbq';
  const hook=$("#gp-step-nav")||$("#gp-progress");
  hook.parentNode.insertBefore(c,hook.nextSibling);
  c.addEventListener('click',e=>{
    const btn=e.target.closest('button[data-field]'); if(!btn)return;
    focusField(btn.dataset.field);
  });
  return c;
}
function fieldToInputId(field){
  switch(field){
    case "custName":return "custName";
    case "custPhone":return "custPhone";
    case "currentCarrier":return "currentCarrierSel";
    case "numLines":return "numLines";
    case "coverageZip":return "coverageZip";
    case "deviceStatus":return "deviceStatus";
    case "finPath":return "finPath";
    case "billPain":return "billPain";
    case "dataNeed":return "dataNeed";
    case "hotspotNeed":return "hotspotNeed";
    case "intlNeed":return "intlNeed";
    case "solutionText":return "solutionText";
    default:return null;
  }
}
function focusField(field){
  const id=fieldToInputId(field); if(!id)return;
  const el=document.getElementById(id); if(!el)return;
  // jump to correct step
  const st=FIELD_STEP[field]; if(st)gotoStep(st);
  el.focus({preventScroll:false});
  el.scrollIntoView({behavior:"smooth",block:"center"});
}
function fieldLabelShort(f){
  switch(f){
    case "currentCarrier":return "Ask carrier";
    case "numLines":return "# lines";
    case "coverageZip":return "ZIP";
    case "deviceStatus":return "Devices paid?";
    case "finPath":return "Postpaid / Prepaid?";
    case "billPain":return "Bill $";
    case "dataNeed":return "Data need";
    case "hotspotNeed":return "Hotspot?";
    case "intlNeed":return "Intl?";
    case "solutionText":return "Build offer";
    case "custName":return "Name";
    case "custPhone":return "Phone";
    default:return f;
  }
}
function updateNbqChips(guestForEval){
  const c=ensureNbqContainer();
  const comp=computePitchFull(guestForEval);
  const missing=[];
  const pushMissing=(arr)=>arr.forEach(f=>{if(!comp.fields[f])return; if(!comp.fields[f].ok)missing.push(f);});
  pushMissing(TIER_A_FIELDS);
  pushMissing(TIER_B_FIELDS);
  if(comp.steps.step2.earned >= (comp.steps.step2.max*0.6)) pushMissing(["solutionText"]);
  const top=missing.slice(0,3);
  if(!top.length){ c.innerHTML=""; return; }
  const btns=top.map(f=>{
    const wt=PITCH_WEIGHTS[f]||0;
    const lbl=fieldLabelShort(f);
    const tier=TIER_A_FIELDS.includes(f)?"high":(TIER_B_FIELDS.includes(f)?"med":"low");
    return `<button type="button" data-field="${f}" class="nbq-chip tier-${tier}">${lbl} (+${wt})</button>`;
  }).join("");
  c.innerHTML=btns;
}

/* --------------------------------------------------------------------------
 * Step show/hide
 * ----------------------------------------------------------------------- */
function gotoStep(step){
  markStepActive(step);
  const s1=$("#step1Form"),s2=$("#step2Form"),s3=$("#step3Form");
  if(s1) (step==="step1")?s1.classList.remove('hidden'):s1.classList.add('hidden');
  if(s2) (step==="step2")?s2.classList.remove('hidden'):s2.classList.add('hidden');
  if(s3) (step==="step3")?s3.classList.remove('hidden'):s3.classList.add('hidden');
}

/* --------------------------------------------------------------------------
 * Revert (clear downstream data & downgrade status)
 * ----------------------------------------------------------------------- */
async function revertTo(step){
  if(!currentEntryKey)return;
  const now=Date.now();
  const ref=db.ref(`guestinfo/${currentEntryKey}`);
  if(step==="step1"){
    if(!confirm("Revert to Step 1? Evaluation & Solution will be cleared."))return;
    await ref.update({evaluate:null,solution:null,status:"new",updatedAt:now});
    currentGuestObj.evaluate={};
    delete currentGuestObj.solution;
    currentGuestObj.status="new";
    syncUiToLoadedGuest(); gotoStep("step1");
    setProgressPreview(null); await writeCompletionPct(currentEntryKey,currentGuestObj);
  }else if(step==="step2"){
    if(!confirm("Revert to Step 2? Solution will be cleared."))return;
    await ref.update({solution:null,status:"working",updatedAt:now});
    delete currentGuestObj.solution;
    currentGuestObj.status="working";
    syncUiToLoadedGuest(); gotoStep("step2");
    setProgressPreview(null); await writeCompletionPct(currentEntryKey,currentGuestObj);
  }
}
window.gpRevertTo = revertTo;

/* --------------------------------------------------------------------------
 * State
 * ----------------------------------------------------------------------- */
let currentEntryKey=null;
let currentGuestObj=null;

/* --------------------------------------------------------------------------
 * Load existing guest by ?gid or ?entry
 * ----------------------------------------------------------------------- */
async function loadExistingGuestIfParam(){
  const key=qs('gid')||qs('entry'); if(!key)return false;
  try{
    const snap=await db.ref(`guestinfo/${key}`).get();
    const data=snap.val();
    if(data){
      currentEntryKey=key;
      currentGuestObj=normGuest(data);
      return true;
    }
  }catch(e){console.error("guest-portal loadExisting error",e);}
  return false;
}

/* --------------------------------------------------------------------------
 * Write completion snapshot (/completion) – called after autosaves
 * ----------------------------------------------------------------------- */
async function writeCompletionPct(gid,g){
  if(!gid) return;
  const comp=computePitchFull(g);
  try{
    await db.ref(`guestinfo/${gid}/completion`).set({
      pct:comp.pctFull,
      steps:comp.steps,
      fields:comp.fields,
      updatedAt:Date.now()
    });
  }catch(err){console.warn("completion write failed",err);}
  setProgressPreview(null);
  setProgressSaved(comp.pctFull);
  updateNbqChips(g);
}

/* --------------------------------------------------------------------------
 * Sync UI from loaded guest record
 * ----------------------------------------------------------------------- */
function syncUiToLoadedGuest(){
  ensureProgressBar();
  ensureStepNav();
  ensureRevertLinks();
  ensureEvalExtrasWrap();
  bindLivePreview();

  const g=currentGuestObj||{};
  const comp=computePitchFull(g);
  setProgressSaved(comp.pctFull);
  setProgressPreview(null);
  updateNbqChips(g);

  // Step nav active by status
  const s=detectStatus(g);
  markStepActive(s==="new"?"step1":(s==="working"?"step2":"step3"));

  // Step1 fields
  const nEl=$("#custName"); if(nEl)nEl.value=g.custName||"";
  const pEl=$("#custPhone"); if(pEl)pEl.value=g.custPhone||"";

  // Step2 structured bundle + extras
  const e=g.evaluate||{};
  const curEl=$("#currentCarrierSel"); if(curEl)curEl.value=e.currentCarrier||"";
  const linesEl=$("#numLines"); if(linesEl)linesEl.value=(e.numLines!=null?e.numLines:"");
  const zipEl=$("#coverageZip"); if(zipEl)zipEl.value=e.coverageZip||"";
  const devEl=$("#deviceStatus"); if(devEl)devEl.value=e.deviceStatus||"";
  const finEl=$("#finPath"); if(finEl)finEl.value=e.finPath||"";
  const billEl=$("#billPain"); if(billEl)billEl.value=e.billPain||"";
  const dataEl=$("#dataNeed"); if(dataEl)dataEl.value=e.dataNeed||"";
  const hotEl=$("#hotspotNeed"); if(hotEl)hotEl.value=(e.hotspotNeed==null?"":String(!!e.hotspotNeed));
  const intlEl=$("#intlNeed"); if(intlEl)intlEl.value=(e.intlNeed==null?"":String(!!e.intlNeed));

  // legacy free text
  const stEl=$("#serviceType"); if(stEl)stEl.value=e.serviceType||"";
  const sitEl=$("#situation"); if(sitEl)sitEl.value=e.situation||"";
  const carEl=$("#evalCarrier"); if(carEl)carEl.value=e.carrierInfo||"";
  const reqEl=$("#evalRequirements"); if(reqEl)reqEl.value=e.requirements||"";

  // Step3
  const sol=g.solution||{};
  const solEl=$("#solutionText"); if(solEl)solEl.value=sol.text||"";

  injectPrefillSummary(g.custName,g.custPhone);

  // Show/hide forms (all viewable via nav; default active based on status)
  gotoStep(s==="new"?"step1":(s==="working"?"step2":"step3"));
}

/* --------------------------------------------------------------------------
 * Auth guard
 * ----------------------------------------------------------------------- */
auth.onAuthStateChanged(async user=>{
  if(!user){ window.location.href="../login.html"; return; }

  // structural DOM extras before load
  ensureProgressBar();
  ensureStepNav();
  ensureEvalExtrasWrap();
  ensureRevertLinks();
  bindLivePreview();

  const found=await loadExistingGuestIfParam();
  if(found){ syncUiToLoadedGuest(); return; }

  // new record start @ step1 (not yet created in DB; created on first autosave)
  currentGuestObj = { status:"new", evaluate:{}, solution:{} };
  setProgressSaved(0);
  updateNbqChips(currentGuestObj);
  gotoStep("step1");
});

/* --------------------------------------------------------------------------
 * Manual submit fallbacks (still supported)
 * ----------------------------------------------------------------------- */
document.getElementById('step1Form').addEventListener('submit',async e=>{
  e.preventDefault();
  await doAutosaveFromDom(); // ensures record created & saved
  gotoStep("step2");
});
document.getElementById('step2Form').addEventListener('submit',async e=>{
  e.preventDefault();
  await doAutosaveFromDom();
  gotoStep("step3");
});
document.getElementById('step3Form').addEventListener('submit',async e=>{
  e.preventDefault();
  await doAutosaveFromDom();
  gotoStep("step3");
});

/* --------------------------------------------------------------------------
 * Manual recompute global (for console)
 * ----------------------------------------------------------------------- */
window.gpRecomputeCompletion = async function(gid){
  const key=gid||currentEntryKey; if(!key)return;
  const snap=await db.ref(`guestinfo/${key}`).get();
  const data=snap.val()||{};
  currentGuestObj=normGuest(data);
  await writeCompletionPct(key,currentGuestObj);
};

/* --------------------------------------------------------------------------
 * Minimal CSS injection safety (if not already loaded in main CSS file)
 * ----------------------------------------------------------------------- */
(function injectCssIfMissing(){
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
    .gp-step-nav{display:flex;justify-content:center;gap:.5rem;margin:.25rem auto 1rem;max-width:480px;}
    .gp-step-nav button{padding:.25rem .75rem;font-size:.9rem;border-radius:4px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.05);cursor:pointer;}
    .gp-step-nav button.active{background:rgba(130,202,255,.25);border-color:rgba(130,202,255,.6);}
    .gp-pts{opacity:.6;font-weight:400;font-size:.85em;margin-left:.25em;}
    .gp-injected{display:block;margin-top:.75rem;}
    .gp-nbq{display:flex;justify-content:center;flex-wrap:wrap;gap:.5rem;margin:-.5rem auto 1rem;max-width:480px;text-align:center;}
    .nbq-chip{padding:.25rem .75rem;font-size:.85rem;border-radius:999px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.05);cursor:pointer;}
    .nbq-chip.tier-high{border-color:#ffb300;color:#ffb300;}
    .nbq-chip.tier-med{border-color:#82caff;color:#82caff;}
    .nbq-chip.tier-low{border-color:rgba(255,255,255,.35);color:rgba(255,255,255,.85);}
    .gp-revert-link{font-size:.8rem;opacity:.75;margin-left:.5rem;cursor:pointer;text-decoration:underline;}
    .gp-extra{margin-top:1.25rem;width:100%;}
    .gp-extra>summary{list-style:none;cursor:pointer;padding:.5rem .75rem;margin-bottom:.5rem;font-size:.95rem;font-weight:600;color:var(--accent,#4daaff);background:rgba(30,144,255,.08);border:1px solid rgba(30,144,255,.3);border-radius:12px;position:relative;}
    .gp-extra>summary::-webkit-details-marker{display:none;}
    .gp-extra>summary::after{content:"\\25BC";position:absolute;right:.75rem;top:50%;transform:translateY(-50%) rotate(-90deg);transition:transform .15s;font-size:.8em;opacity:.75;}
    .gp-extra[open]>summary::after{transform:translateY(-50%) rotate(0deg);}
    .gp-extra .gp-extra-inner{margin-top:.75rem;display:flex;flex-direction:column;gap:1.25rem;}
  `;
  const tag=document.createElement('style');tag.id='gp-progress-css';tag.textContent=css;document.head.appendChild(tag);
})();

/* --------------------------------------------------------------------------
 * DOM ready guard: wire revert links if HTML includes them
 * ----------------------------------------------------------------------- */
document.addEventListener("DOMContentLoaded",ensureRevertLinks);