// gp-core.js -- scoring engine, status detection, and normalization with dynamic Step 2 support
// Place this at ../js/gp/gp-core.js, loaded **after** gp-questions.js

(function(global){
  // ───────────────────────────────────────────────────────────────────────────
  // Build the point weights, combining static Step 1 & Step 3 with dynamic Step 2
  // ───────────────────────────────────────────────────────────────────────────
  function buildWeights() {
    const w = {
      // Step 1
      custName:  8,
      custPhone: 7
    };
    // Step 2: dynamic questions from gpQuestions[]
    (global.gpQuestions || []).forEach(q => {
      w[q.id] = q.weight;
    });
    // Step 3: solution text
    w.solutionText = 25;
    return w;
  }

  const PITCH_WEIGHTS = buildWeights();

  // ───────────────────────────────────────────────────────────────────────────
  // computePitchFull
  //  - g: guest object (after normalization)
  // Returns { pctFull, fields }
  //   - pctFull: percentage of total points earned
  //   - fields:  { [fieldId]: { wt: number, ok: boolean } }
  // ───────────────────────────────────────────────────────────────────────────
  function computePitchFull(g) {
    const fields = {};
    let total = 0, earned = 0;

    for (const [field, wt] of Object.entries(PITCH_WEIGHTS)) {
      total += wt;
      let ok = false;
      const val = (field === 'solutionText')
        ? (g.solution && g.solution.text)
        : g[field];

      if (typeof val === 'string') {
        ok = val.trim() !== '';
      } else if (typeof val === 'number') {
        ok = !isNaN(val);
      } else {
        ok = Boolean(val);
      }

      if (ok) earned += wt;
      fields[field] = { wt, ok };
    }

    const pctFull = total > 0 ? (earned / total) * 100 : 0;
    return { pctFull, fields };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // detectStatus
  //  - g: guest object (after normalization)
  // Returns one of: "new" | "working" | "proposal"
  // ───────────────────────────────────────────────────────────────────────────
  function detectStatus(g) {
    // Step 3 if solution provided
    if (g.solution && g.solution.text && g.solution.text.trim() !== '') {
      return 'proposal';
    }

    // Step 2 if any Step 2 question or Step 1 field answered
    const answeredStep1 = 
      (typeof g.custName === 'string' && g.custName.trim() !== '') ||
      (typeof g.custPhone === 'string' && g.custPhone.trim() !== '');

    const answeredStep2 = (global.gpQuestions || []).some(q => {
      const v = g[q.id];
      if (typeof v === 'string') return v.trim() !== '';
      if (typeof v === 'number') return !isNaN(v);
      return Boolean(v);
    });

    if (answeredStep1 || answeredStep2) {
      return 'working';
    }

    // Otherwise, still on Step 1
    return 'new';
  }

  // ───────────────────────────────────────────────────────────────────────────
  // normGuest
  //  - g: raw object from Firebase (may have `evaluate` sub-object)
  // Returns a flattened guest object where each question ID is top-level
  // ───────────────────────────────────────────────────────────────────────────
  function normGuest(g) {
    if (g.evaluate && typeof g.evaluate === 'object') {
      Object.assign(g, g.evaluate);
      delete g.evaluate;
    }
    return g;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Expose API
  // ───────────────────────────────────────────────────────────────────────────
  global.gpCore = {
    PITCH_WEIGHTS,
    computePitchFull,
    detectStatus,
    normGuest
  };

})(window);