// gp-core.js -- scoring engine, status detection, normalization & Firebase init
// Place this at ../js/gp/gp-core.js, loaded **after** Firebase SDKs & gp-questions.js

(function(global){
  // ───────────────────────────────────────────────────────────────────────────
  // Firebase initialization (only once)
  // ───────────────────────────────────────────────────────────────────────────
  const firebaseConfig = global.GP_FIREBASE_CONFIG || {
    apiKey: "AIzaSyD9fILTNJQ0wsPftUsPkdLrhRGV9dslMzE",
    authDomain: "osls-644fd.firebaseapp.com",
    databaseURL: "https://osls-644fd-default-rtdb.firebaseio.com",
    projectId: "osls-644fd",
    storageBucket: "osls-644fd.appspot.com",
    messagingSenderId: "798578046321",
    appId: "1:798578046321:web:1a2bcd3ef4567gh8i9jkl",
    measurementId: "G-XXXXXXX"
  };
  if (global.firebase && !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  // ───────────────────────────────────────────────────────────────────────────

  // Build the point weights, combining static Step1 & Step3 with dynamic Step2
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

  // Re-compute weights whenever gpQuestions updates
  let PITCH_WEIGHTS = buildWeights();
  if (global.onQuestionsUpdated) {
    global.onQuestionsUpdated(() => {
      PITCH_WEIGHTS = buildWeights();
    });
  }

  // computePitchFull
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

  // detectStatus
  function detectStatus(g) {
    if (g.solution && g.solution.text && g.solution.text.trim() !== '') {
      return 'proposal';
    }

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

    return 'new';
  }

  // normGuest
  function normGuest(g) {
    if (g.evaluate && typeof g.evaluate === 'object') {
      Object.assign(g, g.evaluate);
      delete g.evaluate;
    }
    return g;
  }

  // Expose API
  global.gpCore = {
    PITCH_WEIGHTS,
    computePitchFull,
    detectStatus,
    normGuest
  };

})(window);