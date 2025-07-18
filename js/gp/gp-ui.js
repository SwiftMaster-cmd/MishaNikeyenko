/* gp-ui.js ==================================================================
 * UI utilities for the OSL Guest Portal.
 * NO FIREBASE CALLS. NO DATA PERSISTENCE.
 *
 * LOAD ORDER: gp-core.js → gp-ui.js → gp-app.js
 * -------------------------------------------------------------------------- */

(function(global){

  /* Shortcuts -------------------------------------------------------------- */
  const $  = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  /* gpCore shims (in case loaded earlier than gp-core) --------------------- */
  const _core = global.gpCore || {};
  const FIELD_STEP    = _core.FIELD_STEP    || {};
  const TIER_A_FIELDS = _core.TIER_A_FIELDS || [];
  const TIER_B_FIELDS = _core.TIER_B_FIELDS || [];
  const PITCH_WEIGHTS = _core.PITCH_WEIGHTS || {};
  const fmtPhone      = _core.formatDigits10 || (s=>s||"");

  /* ------------------------------------------------------------------------
   * Status message helper (expects .g-status elements by id)
   * ---------------------------------------------------------------------- */
  function statusMsg(id, msg, cls=""){
    const el = document.getElementById(id);
    if(!el) return;
    el.textContent = msg;
    el.className   = "g-status";
    if (cls) el.classList.add(cls);
  }

  /* ------------------------------------------------------------------------
   * Prefill summary (Step 2+)
   * ---------------------------------------------------------------------- */
  function injectPrefillSummary(name, phone){
    const step2 = $("#step2Form"); if(!step2) return;
    let summary = $("#prefillSummary");
    if(!summary){
      summary = document.createElement("div");
      summary.id = "prefillSummary";
      summary.className = "prefill-summary";
      summary.style.marginBottom = "1rem";
      step2.insertBefore(summary, step2.firstChild);
    }
    const dispPhone = phone ? fmtPhone(phone) : "-";
    summary.innerHTML = `<b>Customer:</b> ${name||"-"} &nbsp; <b>Phone:</b> ${dispPhone}`;
  }

  /* ------------------------------------------------------------------------
   * Progress bar
   * ---------------------------------------------------------------------- */
  function ensureProgressBar(){
    let bar = $("#gp-progress"); if(bar) return bar;
    bar = document.createElement("div");
    bar.id = "gp-progress";
    bar.className = "gp-progress";
    bar.innerHTML = `
      <div class="gp-progress-label">
        Pitch Quality: <span id="gp-progress-pct">0%</span>
        <span id="gp-progress-preview" class="gp-progress-preview" style="display:none;">(preview: <span id="gp-progress-preview-val"></span>)</span>
      </div>
      <div class="gp-progress-bar">
        <div id="gp-progress-fill" class="gp-progress-fill" style="width:0%;"></div>
      </div>`;
    const hook = $("#gp-progress-hook") || document.querySelector(".guest-portal-progress-hook") || document.body.firstElementChild;
    (hook?.parentNode || document.body).insertBefore(bar, hook || document.body.firstChild);
    return bar;
  }

  function _progressColor(fillEl, p){
    fillEl.className = "gp-progress-fill";
    if (p >= 75)      fillEl.classList.add("gp-progress-green");
    else if (p >= 40) fillEl.classList.add("gp-progress-yellow");
    else              fillEl.classList.add("gp-progress-red");
  }

  function setProgressSaved(p){
    ensureProgressBar();
    const pctEl  = $("#gp-progress-pct");
    const fillEl = $("#gp-progress-fill");
    const pct    = Math.max(0, Math.min(100, Math.round(p)));
    if (pctEl)  pctEl.textContent = pct + "%";
    if (fillEl){ fillEl.style.width = pct + "%"; _progressColor(fillEl, pct); }
  }

  function setProgressPreview(pOrNull){
    const wrap  = $("#gp-progress-preview");
    const valEl = $("#gp-progress-preview-val");
    if(!wrap || !valEl) return;
    if (pOrNull == null){
      wrap.style.display = "none";
      return;
    }
    const pct = Math.max(0, Math.min(100, Math.round(pOrNull)));
    valEl.textContent   = pct + "%";
    wrap.style.display  = "";
  }

  /* ------------------------------------------------------------------------
   * Step Navigation  (forwarded to gp-app via _navCb)
   * ---------------------------------------------------------------------- */
  let _navCb = null; // set by bindLiveEvents(opts.onNav)

  function ensureStepNav(){
    let nav = $("#gp-step-nav"); if(nav) return nav;
    nav = document.createElement("div");
    nav.id = "gp-step-nav";
    nav.className = "gp-step-nav";
    nav.innerHTML = `
      <button type="button" data-step="step1">1. Customer</button>
      <button type="button" data-step="step2">2. Evaluate</button>
      <button type="button" data-step="step3">3. Solution</button>`;
    const bar = $("#gp-progress") || ensureProgressBar();
    bar.parentNode.insertBefore(nav, bar.nextSibling);
    nav.addEventListener("click", e=>{
      const btn = e.target.closest("button[data-step]");
      if(!btn) return;
      const step = btn.dataset.step;
      if (_navCb){
        try{ _navCb(step); }catch(err){ console.warn("[gp-ui] navCb error",err); }
      }else{
        // fallback toggle if gp-app not yet bound
        gotoStep(step);
      }
    });
    return nav;
  }

  function markStepActive(step){
    const nav = $("#gp-step-nav"); if(!nav) return;
    [...nav.querySelectorAll("button")].forEach(btn=>{
      btn.classList.toggle("active", btn.dataset.step === step);
    });
  }

  /* ------------------------------------------------------------------------
   * Revert link binding (optional spans in markup)
   * ---------------------------------------------------------------------- */
  function ensureRevertLinks(){
    const rev1 = $("#gp-revert-step1");
    const rev2 = $("#gp-revert-step2");
    if (rev1) rev1.onclick = ()=>global.gpRevertTo?.("step1");
    if (rev2) rev2.onclick = ()=>global.gpRevertTo?.("step2");
  }

  /* ------------------------------------------------------------------------
   * Collapsible "extra eval" wrapper (if not already present)
   * ---------------------------------------------------------------------- */
  function ensureEvalExtrasWrap(){
    const frm = $("#step2Form"); if(!frm) return;
    if (frm.querySelector(".gp-extra")) return; // already wrapped

    const extraIds = [
      "billPain","dataNeed","hotspotNeed","intlNeed",
      "serviceType","situation","evalCarrier","evalRequirements"
    ];
    const extras = extraIds
      .map(id => document.getElementById(id)?.closest(".glabel") || null)
      .filter(Boolean);
    if (!extras.length) return;

    const det = document.createElement("details");
    det.className = "gp-extra";
    det.id = "gp-eval-extra";
    det.innerHTML = `<summary>Show Extra Questions (optional)</summary><div class="gp-extra-inner"></div>`;
    const inner = det.querySelector(".gp-extra-inner");

    const firstExtra = extras[0];
    frm.insertBefore(det, firstExtra);
    extras.forEach(node => inner.appendChild(node));
  }

  /* ------------------------------------------------------------------------
   * Field <-> domain mapping helpers used by NBQ and focusField
   * ---------------------------------------------------------------------- */
  function fieldToInputId(field){
    switch(field){
      case "custName":       return "custName";
      case "custPhone":      return "custPhone";
      case "currentCarrier": return "currentCarrierSel";
      case "numLines":       return "numLines";
      case "coverageZip":    return "coverageZip";
      case "deviceStatus":   return "deviceStatus";
      case "finPath":        return "finPath";
      case "billPain":       return "billPain";
      case "dataNeed":       return "dataNeed";
      case "hotspotNeed":    return "hotspotNeed";
      case "intlNeed":       return "intlNeed";
      case "solutionText":   return "solutionText";
      default:               return null;
    }
  }

  function focusField(field){
    const id = fieldToInputId(field); if(!id) return;
    const el = document.getElementById(id); if(!el) return;
    const st = FIELD_STEP[field];
    if (st) gotoStep(st);
    el.focus({preventScroll:false});
    el.scrollIntoView({behavior:"smooth",block:"center"});
  }

  function fieldLabelShort(f){
    switch(f){
      case "currentCarrier": return "Ask carrier";
      case "numLines":       return "# lines";
      case "coverageZip":    return "ZIP";
      case "deviceStatus":   return "Devices paid?";
      case "finPath":        return "Postpaid / Prepaid?";
      case "billPain":       return "Bill $";
      case "dataNeed":       return "Data need";
      case "hotspotNeed":    return "Hotspot?";
      case "intlNeed":       return "Intl?";
      case "solutionText":   return "Build offer";
      case "custName":       return "Name";
      case "custPhone":      return "Phone";
      default:               return f;
    }
  }

  /* ------------------------------------------------------------------------
   * NBQ chips
   * ---------------------------------------------------------------------- */
  function ensureNbqContainer(){
    let c = $("#gp-nbq"); if(c) return c;
    c = document.createElement("div");
    c.id = "gp-nbq";
    c.className = "gp-nbq";
    const hook = $("#gp-step-nav") || $("#gp-progress");
    hook.parentNode.insertBefore(c, hook.nextSibling);
    c.addEventListener("click", e=>{
      const btn = e.target.closest("button[data-field]"); if(!btn) return;
      focusField(btn.dataset.field);
    });
    return c;
  }

  function updateNbqChips(guestObj){
    const c = ensureNbqContainer();
    const comp = _core.computePitchFull ? _core.computePitchFull(guestObj) : {steps:{step2:{earned:0,max:1}},fields:{}};
    const missing = [];

    const pushMissing = arr => arr.forEach(f=>{
      if(!comp.fields[f]) return;
      if(!comp.fields[f].ok) missing.push(f);
    });

    pushMissing(TIER_A_FIELDS);
    pushMissing(TIER_B_FIELDS);

    // Only ask for solution once Step2 is reasonably complete
    if (comp.steps.step2 && comp.steps.step2.max &&
        comp.steps.step2.earned >= (comp.steps.step2.max * 0.6)){
      pushMissing(["solutionText"]);
    }

    const top = missing.slice(0,3);
    if(!top.length){ c.innerHTML=""; return; }
    const btns = top.map(f=>{
      const wt   = PITCH_WEIGHTS[f] || 0;
      const lbl  = fieldLabelShort(f);
      const tier = TIER_A_FIELDS.includes(f) ? "high" :
                   (TIER_B_FIELDS.includes(f) ? "med" : "low");
      return `<button type="button" data-field="${f}" class="nbq-chip tier-${tier}">${lbl} (+${wt})</button>`;
    }).join("");
    c.innerHTML = btns;
  }

  /* ------------------------------------------------------------------------
   * Step show/hide
   * ---------------------------------------------------------------------- */
  function gotoStep(step){
    markStepActive(step);
    const s1=$("#step1Form"), s2=$("#step2Form"), s3=$("#step3Form");
    if(s1) (step==="step1") ? s1.classList.remove("hidden") : s1.classList.add("hidden");
    if(s2) (step==="step2") ? s2.classList.remove("hidden") : s2.classList.add("hidden");
    if(s3) (step==="step3") ? s3.classList.remove("hidden") : s3.classList.add("hidden");
  }

  /* ------------------------------------------------------------------------
   * Field list + event binding (autosave hooks)
   * gpUI.bindLiveEvents({onInput, onBlur, onNav})
   * Defers until core Step1 field exists if called too early.
   * ---------------------------------------------------------------------- */
  let _liveBound = false;
  function _doBind(opts){
    if(_liveBound) return;
    _liveBound = true;
    if (typeof opts.onNav === "function") _navCb = opts.onNav;

    const ids = [
      "custName","custPhone",
      "currentCarrierSel","numLines","coverageZip","deviceStatus","finPath",
      "billPain","dataNeed","hotspotNeed","intlNeed",
      "serviceType","situation","evalCarrier","evalRequirements",
      "solutionText"
    ];
    ids.forEach(id=>{
      const el = document.getElementById(id); if(!el) return;
      const type = el.tagName==="SELECT"||el.type==="number" ? "change" : "input";
      if (opts.onInput) el.addEventListener(type, opts.onInput, {passive:true});
      if (opts.onBlur)  el.addEventListener("blur", opts.onBlur, {passive:true});
    });
  }
  function bindLiveEvents(opts={}){
    // If fields already present, bind immediately; else defer to DOM ready.
    if (document.getElementById("custName")){
      _doBind(opts);
    }else{
      document.addEventListener("DOMContentLoaded", ()=>_doBind(opts), {once:true});
    }
  }

  /* ------------------------------------------------------------------------
   * Read current DOM field values into a *raw* object (no scoring)
   * ---------------------------------------------------------------------- */
  function readDomFields(){
    const get = id => { const el=document.getElementById(id); return el?el.value:""; };
    const raw = {
      custName: get("custName").trim(),
      custPhone: get("custPhone").trim(),
      currentCarrier: get("currentCarrierSel"),
      numLines: (v=>v===""?null:Number(v))(get("numLines")),
      coverageZip: get("coverageZip").trim(),
      deviceStatus: get("deviceStatus"),
      finPath: get("finPath"),
      billPain: get("billPain").trim(),
      dataNeed: get("dataNeed"),
      hotspotNeed: (v=>v===""?null:(v==="true"))(get("hotspotNeed")),
      intlNeed: (v=>v===""?null:(v==="true"))(get("intlNeed")),
      serviceType: get("serviceType"),
      situation: get("situation").trim(),
      carrierInfo: get("evalCarrier").trim(),
      requirements: get("evalRequirements").trim(),
      solutionText: get("solutionText").trim()
    };
    return raw;
  }

  /* ------------------------------------------------------------------------
   * Push guest object values back into the DOM
   * ---------------------------------------------------------------------- */
  function writeDomFields(g){
    // Step1
    const nEl=$("#custName");      if(nEl) nEl.value = g.custName || "";
    const pEl=$("#custPhone");     if(pEl) pEl.value = g.custPhone || "";

    // Step2 structured + extras
    const e=g.evaluate || {};
    const curEl=$("#currentCarrierSel"); if(curEl) curEl.value = e.currentCarrier || "";
    const linesEl=$("#numLines");        if(linesEl) linesEl.value = (e.numLines!=null?e.numLines:"");
    const zipEl=$("#coverageZip");       if(zipEl) zipEl.value = e.coverageZip || "";
    const devEl=$("#deviceStatus");      if(devEl) devEl.value = e.deviceStatus || "";
    const finEl=$("#finPath");           if(finEl) finEl.value = e.finPath || "";
    const billEl=$("#billPain");         if(billEl) billEl.value = e.billPain || "";
    const dataEl=$("#dataNeed");         if(dataEl) dataEl.value = e.dataNeed || "";
    const hotEl=$("#hotspotNeed");       if(hotEl) hotEl.value = (e.hotspotNeed==null?"":String(!!e.hotspotNeed));
    const intlEl=$("#intlNeed");         if(intlEl) intlEl.value = (e.intlNeed==null?"":String(!!e.intlNeed));

    // legacy
    const stEl=$("#serviceType");        if(stEl) stEl.value = e.serviceType || "";
    const sitEl=$("#situation");         if(sitEl) sitEl.value = e.situation || "";
    const carEl=$("#evalCarrier");       if(carEl) carEl.value = e.carrierInfo || "";
    const reqEl=$("#evalRequirements");  if(reqEl) reqEl.value = e.requirements || "";

    // Step3
    const sol=g.solution || {};
    const solEl=$("#solutionText");      if(solEl) solEl.value = sol.text || "";
  }

  /* ------------------------------------------------------------------------
   * One-time CSS injection (safety if main css missing)
   * ---------------------------------------------------------------------- */
  (function injectCssIfMissing(){
    if(document.getElementById("gp-progress-css")) return;
    const css = `
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
      .gp-nbq{display:flex;justify-content:center;flex-wrap:wrap;gap:.5rem;margin:-.5rem auto 1rem;max-width:480px;text-align:center;}
      .nbq-chip{padding:.25rem .75rem;font-size:.85rem;border-radius:999px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.05);cursor:pointer;}
      .nbq-chip.tier-high{border-color:#ffb300;color:#ffb300;}
      .nbq-chip.tier-med{border-color:#82caff;color:#82caff;}
      .nbq-chip.tier-low{border-color:rgba(255,255,255,.35);color:rgba(255,255,255,.85);}
      .gp-extra{margin-top:1.25rem;width:100%;}
      .gp-extra>summary{list-style:none;cursor:pointer;padding:.5rem .75rem;margin-bottom:.5rem;font-size:.95rem;font-weight:600;color:var(--accent,#4daaff);background:rgba(30,144,255,.08);border:1px solid rgba(30,144,255,.3);border-radius:12px;position:relative;}
      .gp-extra>summary::-webkit-details-marker{display:none;}
      .gp-extra>summary::after{content:"\\25BC";position:absolute;right:.75rem;top:50%;transform:translateY(-50%) rotate(-90deg);transition:transform .15s;font-size:.8em;opacity:.75;}
      .gp-extra[open]>summary::after{transform:translateY(-50%) rotate(0deg);}
      .gp-extra .gp-extra-inner{margin-top:.75rem;display:flex;flex-direction:column;gap:1.25rem;}
    `;
    const tag = document.createElement("style");
    tag.id = "gp-progress-css";
    tag.textContent = css;
    document.head.appendChild(tag);
  })();

  /* ------------------------------------------------------------------------
   * DOM ready: wire revert links AND re-sync data if gp-app loaded early.
   * ---------------------------------------------------------------------- */
  document.addEventListener("DOMContentLoaded", ()=>{
    ensureRevertLinks();
    // If gp-app loaded & fetched data before DOM existed, push it now.
    if (global.gpApp && typeof global.gpApp.syncUi === "function"){
      try{ global.gpApp.syncUi(); }catch(err){ console.warn("[gp-ui] late syncUi error",err); }
    }
  });

  /* ------------------------------------------------------------------------
   * Export public API
   * ---------------------------------------------------------------------- */
  global.gpUI = {
    // status
    statusMsg,

    // summary
    injectPrefillSummary,

    // progress
    ensureProgressBar,
    setProgressSaved,
    setProgressPreview,

    // step nav / show-hide
    ensureStepNav,
    markStepActive,
    gotoStep,

    // extras
    ensureEvalExtrasWrap,
    ensureRevertLinks,

    // NBQ
    ensureNbqContainer,
    updateNbqChips,
    focusField,

    // field binding
    bindLiveEvents,
    readDomFields,
    writeDomFields,

    // exposed constants
    FIELD_STEP,
    TIER_A_FIELDS,
    TIER_B_FIELDS,
    PITCH_WEIGHTS
  };

})(window);