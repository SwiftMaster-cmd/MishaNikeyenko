// gp-ui-render.js
(function(global){
  const firebaseConfig = global.GP_FIREBASE_CONFIG||{/* … */};
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const DASHBOARD_URL = global.DASHBOARD_URL||"../html/admin.html";
  global.DASHBOARD_URL = DASHBOARD_URL;

  function renderUI() {
    const app = document.getElementById("guestApp");
    if (!app) return;
    app.innerHTML = "";
    global.createProgressHeader(app, DASHBOARD_URL);

    const container = document.createElement("div");
    container.style = "display:flex;gap:24px;flex-wrap:wrap;margin-top:20px;";
    global.renderStepSections(container);
    app.appendChild(container);

    global.renderQuestions("step2Fields");
    global.hydrateAnswers();
    global.setupInstantSaveForStep1();
    global.setupSolutionSave();
    global.updateTotalPoints();
    global.updatePitchText();
    if (global.gpApp?.saveNow) global.gpApp.saveNow();
  }

  auth.onAuthStateChanged(() => renderUI());
})(window);