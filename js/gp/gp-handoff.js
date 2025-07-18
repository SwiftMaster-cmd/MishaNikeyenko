/* gp-core-lite + gp-ui-adv merged ---------------------------------------------------
 * Core normalization, status detection, scoring, plus UI enhancements
 * for Guest Portal minimal build with advanced UI.
 *
 * Merged and optimized for clarity and performance.
 * ------------------------------------------------------------------------------ */
(function(global){

  /* ---------------- Config weights / groupings -------------------------- */
  const PITCH_WEIGHTS = {
    custName:8, custPhone:7,
    currentCarrier:12, numLines:8, coverageZip:8,
    deviceStatus:8, finPath:12,
    billPain:4, dataNeed:4, hotspotNeed:2, intlNeed:2,
    solutionText:25
  };

  const FIELD_STEP = {
    custName:"step1", custPhone:"step1",
    currentCarrier:"step2", numLines:"step2", coverageZip:"step2",
    deviceStatus:"step2", finPath:"step2",
    billPain:"step2", dataNeed:"step2", hotspotNeed:"step2", intlNeed:"step2",
    solutionText:"step3"
  };

  /* ---------------- Generic helpers ------------------------------------- */
  function hasVal(v){
    if (v == null) return false;
    if (typeof v === "string") return v.trim() !== "";
    if (typeof v === "number") return true;
    if (typeof v === "boolean") return v;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "object") return Object.keys(v).length > 0;
    return false;
  }
  const digitsOnly = s => (s || "").replace(/\D+/g, "");
  function formatDigits10(str){
    const d = digitsOnly(str);
    return d.length === 10 ? `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}` : d;
  }

  function hasAnyEvalData(e){
    if (!e) return false;
    return ["currentCarrier","numLines","coverageZip","deviceStatus","finPath",
            "billPain","dataNeed","hotspotNeed","intlNeed"].some(k => hasVal(e[k]));
  }

  function detectStatus(g){
    const s = (g?.status || "").toLowerCase();
    if (s) return s;
    if (g?.solution && hasVal(g.solution.text)) return "proposal";
    if (hasAnyEvalData(g?.evaluate)) return "working";
    return "new";
  }

  function hasPrefilledStep1(g){
    return hasVal(g?.custName) || hasVal(g?.custPhone);
  }

  /* ---------------- Normalize historical shapes ------------------------- */
  function normGuest(src = {}){
    const custName = src.custName ?? src.guestName ?? "";
    const custPhone = src.custPhone ?? src.guestPhone ?? "";
    const e = Object.assign({}, src.evaluate || {});
    if (e.currentCarrier == null && src.currentCarrier != null) e.currentCarrier = src.currentCarrier;
    if (e.numLines == null && src.numLines != null) e.numLines = src.numLines;
    if (e.coverageZip == null && src.coverageZip != null) e.coverageZip = src.coverageZip;
    if (e.deviceStatus == null && src.deviceStatus != null) e.deviceStatus = src.deviceStatus;
    if (e.finPath == null && src.finPath != null) e.finPath = src.finPath;

    const sol = Object.assign({}, src.solution || {});
    if (sol.text == null && src.solutionText != null) sol.text = src.solutionText;

    const out = {
      ...src,
      custName,
      custPhone,
      custPhoneDigits: digitsOnly(custPhone),
      evaluate: e,
      solution: sol,
      prefilledStep1: src.prefilledStep1 || hasPrefilledStep1({ custName, custPhone })
    };
    out.status = detectStatus(out);
    return out;
  }

  /* ---------------- Scoring ---------------------------------------------- */
  function getField(g, k){
    const e = g?.evaluate || {}, sol = g?.solution || {};
    switch(k){
      case "custName": return g?.custName;
      case "custPhone": return g?.custPhone;
      case "currentCarrier": return e.currentCarrier;
      case "numLines": return e.numLines;
      case "coverageZip": return e.coverageZip;
      case "deviceStatus": return e.deviceStatus;
      case "finPath": return e.finPath;
      case "billPain": return e.billPain;
      case "dataNeed": return e.dataNeed;
      case "hotspotNeed": return e.hotspotNeed;
      case "intlNeed": return e.intlNeed;
      case "solutionText": return sol.text;
      default: return undefined;
    }
  }

  function computePitchFull(g, weights = PITCH_WEIGHTS){
    const steps = {step1:{earned:0,max:0}, step2:{earned:0,max:0}, step3:{earned:0,max:0}};
    const fields = {};
    let earned = 0, max = 0;
    for(const [k, wt] of Object.entries(weights)){
      const st = FIELD_STEP[k] || "step1";
      steps[st].max += wt;
      max += wt;
      const ok = hasVal(getField(g, k));
      if(ok){ steps[st].earned += wt; earned += wt; }
      fields[k] = {ok, wt};
    }
    const pctFull = max ? Math.round((earned/max)*100) : 0;
    return { pctFull, steps, fields };
  }

  /* ---------------- UI helpers ------------------------------------------- */
  const $ = sel => document.querySelector(sel);
  const el = id => document.getElementById(id);

  /* ---------------- Prefill summary ------------------------------------- */
  function injectPrefillSummary(name, phone){
    const step2 = el("step2Form");
    if (!step2) return;
    let summary = el("prefillSummary");
    if (!summary){
      summary = document.createElement("div");
      summary.id = "prefillSummary";
      summary.className = "prefill-summary";
      summary.style.marginBottom = "1rem";
      step2.insertBefore(summary, step2.firstChild);
    }
    const fmtPhone = formatDigits10;
    summary.innerHTML = `<b>Customer:</b> ${name || "-"} &nbsp; <b>Phone:</b> ${phone ? fmtPhone(phone) : "-"}`;
  }

  /* ---------------- Extras wrapper (optional) --------------------------- */
  let ENABLE_EXTRAS = global.GP_UIADV_ENABLE_EXTRAS ?? false;
  function ensureEvalExtrasWrap(){
    if (!ENABLE_EXTRAS) return;
    const frm = el("step2Form");
    if (!frm) return;
    if (frm.querySelector(".gp-extra")) return; // Already wrapped

    const extraIds = [
      "billPain", "dataNeed", "hotspotNeed", "intlNeed",
      "serviceType", "situation", "evalCarrier", "evalRequirements"
    ];
    const extras = extraIds.map(id => el(id)?.closest(".glabel")).filter(Boolean);
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

  /* ---------------- Progress preview ------------------------------------ */
  function ensureProgressPreviewNodes(){
    const lblWrap = $("#gp-progress .gp-progress-label");
    if (!lblWrap) return;
    if (el("gp-progress-preview")) return;
    const span = document.createElement("span");
    span.id = "gp-progress-preview";
    span.className = "gp-progress-preview";
    span.style.display = "none";
    span.innerHTML = `(preview: <span id="gp-progress-preview-val"></span>)`;
    lblWrap.appendChild(span);
  }

  function setProgressPreview(pctOrNull){
    ensureProgressPreviewNodes();
    const wrap = el("gp-progress-preview");
    const valEl = el("gp-progress-preview-val");
    if (!wrap || !valEl) return;
    if (pctOrNull == null){
      wrap.style.display = "none";
      return;
    }
    const pct = Math.max(0, Math.min(100, Math.round(pctOrNull)));
    valEl.textContent = pct + "%";
    wrap.style.display = "";
  }

  /* ---------------- NBQ chips ------------------------------------------- */
  function ensureNbqContainer(){
    if (el("gp-nbq")) return el("gp-nbq");
    const c = document.createElement("div");
    c.id = "gp-nbq";
    c.className = "gp-nbq";
    // Insert after step nav if present; else after progress
    const hook = el("gp-step-nav") || el("gp-progress") || document.body.firstChild;
    hook.parentNode.insertBefore(c, hook.nextSibling);
    c.addEventListener("click", e => {
      const btn = e.target.closest("button[data-field]");
      if (!btn) return;
      focusField(btn.dataset.field);
    });
    return c;
  }

  function fieldLabelShort(f){
    switch(f){
      case "custName": return "Name";
      case "custPhone": return "Phone";
      case "currentCarrier": return "Ask carrier";
      case "numLines": return "# lines";
      case "coverageZip": return "ZIP";
      case "solutionText": return "Build offer";
      default: return f;
    }
  }

  function fieldToInputId(field){
    switch(field){
      case "custName": return "custName";
      case "custPhone": return "custPhone";
      case "currentCarrier": return "currentCarrierSel";
      case "numLines": return "numLines";
      case "coverageZip": return "coverageZip";
      case "solutionText": return "solutionText";
      default: return null;
    }
  }

  function focusField(field){
    const id = fieldToInputId(field);
    if (!id) return;
    const elField = el(id);
    if (!elField) return;

    // Navigate to the correct step if mapping exists
    const st = FIELD_STEP[field];
    const nav = global.gpApp?.gotoStep || global.gpBasic?.goto;
    if (st && typeof nav === "function") nav(st);

    // Focus & scroll into view smoothly
    setTimeout(() => {
      elField.focus({preventScroll:false});
      elField.scrollIntoView({behavior:"smooth", block:"center"});
    }, 10);
  }

  function computeMissingFields(g){
    if (!global.gpCore) return [];
    const comp = computePitchFull(g);
    const missing = [];
    for(const [f, meta] of Object.entries(comp.fields)){
      if (!meta.ok) missing.push({f, wt: meta.wt || 0});
    }
    missing.sort((a,b) => b.wt - a.wt);
    return missing.map(x => x.f);
  }

  function renderNbqChips(g){
    const c = ensureNbqContainer();
    if (!global.gpCore){ c.innerHTML = ""; return; }
    const missing = computeMissingFields(g);
    const top = missing.slice(0,3);
    if (!top.length){ c.innerHTML = ""; return; }
    const html = top.map(f => {
      const lbl = fieldLabelShort(f);
      const wt = PITCH_WEIGHTS[f] ?? 0;
      const tier = wt >= 10 ? "high" : wt >= 5 ? "med" : "low";
      return `<button type="button" data-field="${f}" class="nbq-chip tier-${tier}">${lbl}${wt ? ` (+${wt})` : ""}</button>`;
    }).join("");
    c.innerHTML = html;
  }

  /* ---------------- Live listeners -------------------------------------- */
  function bindLivePreview(){
    const ids = [
      "custName","custPhone",
      "currentCarrierSel","numLines","coverageZip",
      "solutionText",
      // extras (ignored if missing)
      "billPain","dataNeed","hotspotNeed","intlNeed",
      "serviceType","situation","evalCarrier","evalRequirements"
    ];
    ids.forEach(id => {
      const node = el(id);
      if (!node) return;
      const evt = (node.tagName === "SELECT" || node.type === "number") ? "change" : "input";
      node.addEventListener(evt, handleLiveChange, {passive:true});
    });
  }

  function readLiveGuest(){
    if (global.gpApp?.buildGuestFromDom) {
      try { return global.gpApp.buildGuestFromDom(); } catch{}
    }
    // fallback minimal read (works with basic fields)
    return {
      custName: el("custName")?.value || "",
      custPhone: el("custPhone")?.value || "",
      currentCarrier: el("currentCarrierSel")?.value || "",
      numLines: el("numLines")?.value || "",
      coverageZip: el("coverageZip")?.value || "",
      solution: { text: el("solutionText")?.value || "" }
    };
  }

  function handleLiveChange(){
    const saved = global.gpApp?.guest || global.gpBasic?.guest || {};
    const live = readLiveGuest();

    // Normalize so computePitchFull sees same keys
    const normLive = normGuest(live);
    const normSaved = normGuest(saved);

    const compLive = computePitchFull(normLive);
    const compSaved = computePitchFull(normSaved);
    const diff = Math.abs((compLive.pctFull || 0) - (compSaved.pctFull || 0));

    setProgressPreview(diff > 1 ? compLive.pctFull : null);
    renderNbqChips(normLive);
  }

  /* ---------------- Public refresh -------------------------------------- */
  function refresh(){
    const g = global.gpApp?.guest || global.gpBasic?.guest || {};
    injectPrefillSummary(g.custName, g.custPhone);
    ensureEvalExtrasWrap();
    renderNbqChips(normGuest(g));
    setProgressPreview(null); // Clear preview (saved)
  }

  /* ---------------- CSS injection --------------------------------------- */
  (function(){
    if (el("gp-ui-adv-css")) return;
    const css = `
      .gp-progress-preview { margin-left:.5em; font-weight:400; opacity:.8; font-size:.9em; }
      .gp-nbq { display:flex; justify-content:center; flex-wrap:wrap; gap:.5rem; margin:-.5rem auto 1rem; max-width:480px; text-align:center; }
      .nbq-chip { padding:.25rem .75rem; font-size:.85rem; border-radius:999px; border:1px solid rgba(255,255,255,.25); background:rgba(255,255,255,.05); cursor:pointer; }
      .nbq-chip.tier-high { border-color:#ffb300; color:#ffb300; }
      .nbq-chip.tier-med { border-color:#82caff; color:#82caff; }
      .nbq-chip.tier-low { border-color:rgba(255,255,255,.35); color:rgba(255,255,255,.85); }
      .gp-extra { margin-top:1.25rem; width:100%; }
      .gp-extra>summary {
        list-style:none; cursor:pointer; padding:.5rem .75rem; margin-bottom:.5rem;
        font-size:.95rem; font-weight:600; color:var(--accent,#4daaff);
        background:rgba(30,144,255,.08); border:1px solid rgba(30,144,255,.3);
        border-radius:12px; position:relative;
      }
      .gp-extra>summary::-webkit-details-marker { display:none; }
      .gp-extra>summary::after {
        content:"\\25BC"; position:absolute; right:.75rem; top:50%;
        transform:translateY(-50%) rotate(-90deg);
        transition:transform .15s; font-size:.8em; opacity:.75;
      }
      .gp-extra[open]>summary::after { transform:translateY(-50%) rotate(0deg); }
      .gp-extra .gp-extra-inner { margin-top:.75rem; display:flex; flex-direction:column; gap:1.25rem; }
      .prefill-summary { font-size:.95rem; opacity:.85; }
    `;
    const style = document.createElement("style");
    style.id = "gp-ui-adv-css";
    style.textContent = css;
    document.head.appendChild(style);
  })();

  /* ---------------- Init on DOM ready ----------------------------------- */
  document.addEventListener("DOMContentLoaded", () => {
    ensureProgressPreviewNodes();
    ensureNbqContainer();
    ensureEvalExtrasWrap();
    bindLivePreview();
    refresh();
  });

  /* ---------------- Public API ------------------------------------------ */
  global.gpCore = {
    PITCH_WEIGHTS, FIELD_STEP, hasVal, digitsOnly, formatDigits10,
    detectStatus, hasPrefilledStep1, normGuest, getField, computePitchFull
  };

  global.gpUIAdv = {
    refresh,
    focusField,
    ensureEvalExtrasWrap,
    bindLivePreview,
    setProgressPreview,
    setExtrasEnabled(flag){
      ENABLE_EXTRAS = !!flag;
      if (ENABLE_EXTRAS) ensureEvalExtrasWrap();
    },
    get extrasEnabled(){ return ENABLE_EXTRAS; }
  };

})(window);