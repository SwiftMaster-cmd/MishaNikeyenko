/* gp-ui-adv.js --------------------------------------------------------------
 * Advanced UI sugar for the minimal Guest Portal build.
 *
 * Depends:
 *   - window.gpCore   (from gp-core-lite.js)   -- used for scoring & step map
 *   - window.gpApp OR window.gpBasic           -- used for current guest + nav
 *   - Basic forms exist in DOM (#step1Form/#step2Form/#step3Form)
 *   - Optional progress bar markup from gp-app-min.js (#gp-progress-*)
 *
 * Features:
 *   • Prefill summary (Customer / Phone) injected top of Step 2.
 *   • Live "preview" progress % while typing vs saved guest.
 *   • NBQ chips (up to 3 highest-weight missing fields) → click focuses field.
 *   • Optional eval "extras" collapsible wrapper.
 *
 * Safe-if-missing: All features no-op gracefully if dependent elements absent.
 * -------------------------------------------------------------------------- */
(function(global){

  const gpCore   = global.gpCore   || null;
  const gpBasic  = global.gpBasic  || null;
  const gpApp    = global.gpApp    || gpBasic || null;

  /* ========================================================================
   * Config toggles
   * ===================================================================== */
  let ENABLE_EXTRAS = global.GP_UIADV_ENABLE_EXTRAS ?? false; // can flip later

  /* ========================================================================
   * Quick DOM helpers
   * ===================================================================== */
  const $  = sel => document.querySelector(sel);
  const el = id  => document.getElementById(id);

  /* ========================================================================
   * Prefill summary
   * ===================================================================== */
  function injectPrefillSummary(name, phone){
    const step2 = el("step2Form"); if(!step2) return;
    let summary = el("prefillSummary");
    if(!summary){
      summary = document.createElement("div");
      summary.id = "prefillSummary";
      summary.className = "prefill-summary";
      summary.style.marginBottom = "1rem";
      step2.insertBefore(summary, step2.firstChild);
    }
    const fmtPhone = gpCore?.formatDigits10 ?? (s=>s||"");
    summary.innerHTML = `<b>Customer:</b> ${name||"-"} &nbsp; <b>Phone:</b> ${phone?fmtPhone(phone):"-"}`;
  }

  /* ========================================================================
   * Extras wrapper (optional)
   * ===================================================================== */
  function ensureEvalExtrasWrap(){
    if(!ENABLE_EXTRAS) return;
    const frm = el("step2Form"); if(!frm) return;
    if (frm.querySelector(".gp-extra")) return; // already wrapped

    const extraIds = [
      "billPain","dataNeed","hotspotNeed","intlNeed",
      "serviceType","situation","evalCarrier","evalRequirements"
    ];
    const extras = extraIds
      .map(id => el(id)?.closest(".glabel") || null)
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

  /* ========================================================================
   * Progress preview (adds "(preview: xx%)" beside saved pct)
   * ===================================================================== */
  function ensureProgressPreviewNodes(){
    const lblWrap = $("#gp-progress .gp-progress-label");
    if(!lblWrap) return;
    if(el("gp-progress-preview")) return;
    const span = document.createElement("span");
    span.id = "gp-progress-preview";
    span.className = "gp-progress-preview";
    span.style.display="none";
    span.innerHTML = `(preview: <span id="gp-progress-preview-val"></span>)`;
    lblWrap.appendChild(span);
  }
  function setProgressPreview(pctOrNull){
    ensureProgressPreviewNodes();
    const wrap  = el("gp-progress-preview");
    const valEl = el("gp-progress-preview-val");
    if(!wrap || !valEl) return;
    if(pctOrNull == null){
      wrap.style.display = "none";
      return;
    }
    const pct = Math.max(0,Math.min(100,Math.round(pctOrNull)));
    valEl.textContent = pct + "%";
    wrap.style.display = "";
  }

  /* ========================================================================
   * NBQ chips
   * ===================================================================== */
  function ensureNbqContainer(){
    if(el("gp-nbq")) return el("gp-nbq");
    const c = document.createElement("div");
    c.id = "gp-nbq";
    c.className = "gp-nbq";
    // insert after step nav if present; else after progress
    const hook = el("gp-step-nav") || el("gp-progress") || document.body.firstChild;
    hook.parentNode.insertBefore(c, hook.nextSibling);
    c.addEventListener("click", e=>{
      const btn = e.target.closest("button[data-field]"); if(!btn) return;
      focusField(btn.dataset.field);
    });
    return c;
  }

  function fieldLabelShort(f){
    switch(f){
      case "custName":       return "Name";
      case "custPhone":      return "Phone";
      case "currentCarrier": return "Ask carrier";
      case "numLines":       return "# lines";
      case "coverageZip":    return "ZIP";
      case "solutionText":   return "Build offer";
      // fallbacks:
      default:               return f;
    }
  }

  function fieldToInputId(field){
    switch(field){
      case "custName":       return "custName";
      case "custPhone":      return "custPhone";
      case "currentCarrier": return "currentCarrierSel";
      case "numLines":       return "numLines";
      case "coverageZip":    return "coverageZip";
      case "solutionText":   return "solutionText";
      default:               return null;
    }
  }

  function focusField(field){
    const id = fieldToInputId(field); if(!id) return;
    const elField = document.getElementById(id); if(!elField) return;

    // navigate to the correct step if mapping exists
    const st = gpCore?.FIELD_STEP?.[field];
    const nav = gpApp?.gotoStep || gpBasic?.goto;
    if(st && typeof nav === "function") nav(st);

    // focus
    setTimeout(()=>{
      elField.focus({preventScroll:false});
      elField.scrollIntoView({behavior:"smooth",block:"center"});
    },10);
  }

  function computeMissingFields(g){
    if(!gpCore) return [];
    const comp = gpCore.computePitchFull(g);
    const missing = [];
    for(const [f,meta] of Object.entries(comp.fields)){
      if(!meta.ok) missing.push({f,wt:meta.wt||0});
    }
    // sort by weight desc
    missing.sort((a,b)=>b.wt-a.wt);
    return missing.map(x=>x.f);
  }

  function renderNbqChips(g){
    const c = ensureNbqContainer();
    if(!gpCore){ c.innerHTML=""; return; }
    const missing = computeMissingFields(g);
    const top = missing.slice(0,3);
    if(!top.length){ c.innerHTML=""; return; }
    const html = top.map(f=>{
      const lbl = fieldLabelShort(f);
      const wt  = gpCore.WEIGHTS?.[f] ?? 0;
      const tier = wt>=10 ? "high" : wt>=5 ? "med" : "low";
      return `<button type="button" data-field="${f}" class="nbq-chip tier-${tier}">${lbl}${wt?` (+${wt})`:""}</button>`;
    }).join("");
    c.innerHTML = html;
  }

  /* ========================================================================
   * Live listeners to show preview + NBQ while typing
   * ===================================================================== */
  function bindLivePreview(){
    const ids = [
      "custName","custPhone",
      "currentCarrierSel","numLines","coverageZip",
      "solutionText",
      // extras (ignored if missing)
      "billPain","dataNeed","hotspotNeed","intlNeed",
      "serviceType","situation","evalCarrier","evalRequirements"
    ];
    ids.forEach(id=>{
      const node = el(id); if(!node) return;
      const evt = (node.tagName==="SELECT"||node.type==="number")?"change":"input";
      node.addEventListener(evt, handleLiveChange, {passive:true});
    });
  }

  function readLiveGuest(){
    // Try to borrow app's read; else inline minimal.
    let raw;
    if (gpApp?.buildGuestFromDom){
      try{ return gpApp.buildGuestFromDom(); }catch(_){}
    }
    // fallback minimal read (works w/basic fields)
    raw = {
      custName: el("custName")?.value||"",
      custPhone:el("custPhone")?.value||"",
      currentCarrier:el("currentCarrierSel")?.value||"",
      numLines:el("numLines")?.value||"",
      coverageZip:el("coverageZip")?.value||"",
      solution:{text:el("solutionText")?.value||""}
    };
    return raw;
  }

  function handleLiveChange(){
    const saved = gpApp?.guest || gpBasic?.guest || {};
    const live  = readLiveGuest();

    // ensure normalized so computePitchFull sees same keys
    const normLive  = gpCore?gpCore.normGuest(live):live;
    const normSaved = gpCore?gpCore.normGuest(saved):saved;

    if(gpCore){
      const compLive  = gpCore.computePitchFull(normLive);
      const compSaved = gpCore.computePitchFull(normSaved);
      const diff = Math.abs((compLive.pctFull||0) - (compSaved.pctFull||0));
      setProgressPreview(diff>1 ? compLive.pctFull : null);
      renderNbqChips(normLive);
    }
  }

  /* ========================================================================
   * Public refresh (call after save / after context load)
   * ===================================================================== */
  function refresh(){
    const g = gpApp?.guest || gpBasic?.guest || {};
    injectPrefillSummary(g.custName, g.custPhone);
    ensureEvalExtrasWrap();
    if(gpCore){
      const norm = gpCore.normGuest(g);
      renderNbqChips(norm);
      setProgressPreview(null); // clear preview (we're at saved)
    }else{
      renderNbqChips(g);
      setProgressPreview(null);
    }
  }

  /* ========================================================================
   * CSS injection (lightweight; only once)
   * ===================================================================== */
  (function injectCssIfMissing(){
    if(el("gp-ui-adv-css")) return;
    const css = `
      .gp-progress-preview{margin-left:.5em;font-weight:400;opacity:.8;font-size:.9em;}
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
      .prefill-summary{font-size:.95rem;opacity:.85;}
    `;
    const tag = document.createElement("style");
    tag.id = "gp-ui-adv-css";
    tag.textContent = css;
    document.head.appendChild(tag);
  })();

  /* ========================================================================
   * Init once DOM ready
   * ===================================================================== */
  document.addEventListener("DOMContentLoaded", ()=>{
    ensureProgressPreviewNodes();
    ensureNbqContainer();
    ensureEvalExtrasWrap(); // gated by ENABLE_EXTRAS
    bindLivePreview();
    refresh(); // initial
  });

  /* ========================================================================
   * Public API
   * ===================================================================== */
  global.gpUIAdv = {
    refresh,
    focusField,
    setExtrasEnabled(flag){
      ENABLE_EXTRAS = !!flag;
      // rebuild extras container if enabling after load
      if(ENABLE_EXTRAS) ensureEvalExtrasWrap();
    },
    get extrasEnabled(){ return ENABLE_EXTRAS; }
  };

})(window);