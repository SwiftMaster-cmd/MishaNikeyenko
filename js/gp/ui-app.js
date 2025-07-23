// ui-app.js
(function(global){
  const auth = firebase.auth();
  const db   = firebase.database();
  const answers = {};
  global.answers = answers;

  function debounce(fn, delay = 300) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), delay); };
  }

  function computePct() {
    const maxPts = (global.gpQuestions||[]).reduce((s,q)=>s+q.weight,0) + 8 + 7 + 25;
    const totPts = Object.values(answers).reduce((s,a)=>s+a.points,0);
    return Math.min(100, Math.round(totPts/maxPts*100));
  }

  function onFieldChange(id, value, points) {
    answers[id] = { value, points };
    const pct = computePct();
    ProgressBar.update(pct);
    ProgressBar.updatePitch(answers);
    if (global.gpApp.saveNow) global.gpApp.saveNow();
  }

  function initUI() {
    const app = document.getElementById('guestApp');
    if (!app) return;

    // render header + progress
    ProgressBar.render(app, global.DASHBOARD_URL || '../html/admin.html');

    // render steps
    const container = document.createElement('div');
    container.id = 'stepsContainer';
    container.style = 'display:flex;gap:24px;flex-wrap:wrap;margin-top:20px;';
    app.appendChild(container);

    StepsUI.renderSteps(container);
    StepsUI.renderStep2Fields('step2Fields', onFieldChange);
    StepsUI.setupStep1(onFieldChange);
    StepsUI.setupSolution(onFieldChange);

    // hydrate existing answers (loaded by gp-app-min.js)
    for (const [id, { value, points }] of Object.entries(global.answers)) {
      const f = document.getElementById(id);
      if (f) f.value = value;
    }
    ProgressBar.update(computePct());

    // real-time listen for remote changes
    const key = global.gpApp.guestKey;
    if (key) {
      db.ref(`guestinfo/${key}/completionPct`)
        .on('value', snap => {
          if (snap.exists()) ProgressBar.update(snap.val());
        });
    }
  }

  auth.onAuthStateChanged(user => {
    if (user) initUI();
  });
})(window);