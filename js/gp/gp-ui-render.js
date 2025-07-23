// gp-ui-render.js -- Guest Portal UI with nested Step 2 evaluate support and live save
(function(global) {
  // ─── Questions ───────────────────────────────────────────────────────────────
  const staticQuestions = [
    { id: "numLines",       label: "How many lines do you need on your account?",                        type: "number", weight: 15 },
    { id: "carrier",        label: "What carrier are you with right now?",                              type: "select", weight: 14, options: ["Verizon","AT&T","T-Mobile","US Cellular","Cricket","Metro","Boost","Straight Talk","Tracfone","Other"] },
    { id: "monthlySpend",   label: "What do you usually pay each month for phone service?",             type: "number", weight: 13 },
    { id: "deviceStatus",   label: "Is your phone paid off, or do you still owe on it?",               type: "select", weight: 12, options: ["Paid Off","Still Owe","Lease","Mixed","Not Sure"] },
    { id: "upgradeInterest",label: "Are you looking to upgrade your phone, or keep what you have?",    type: "select", weight: 11, options: ["Upgrade","Keep Current","Not Sure"] },
    { id: "otherDevices",   label: "Do you have any other devices--tablets, smartwatches, or hotspots?", type: "select", weight: 10, options: ["Tablet","Smartwatch","Hotspot","Multiple","None"] },
    { id: "coverage",       label: "How’s your coverage at home and at work?",                           type: "select", weight: 9,  options: ["Great","Good","Average","Poor","Not Sure"] },
    { id: "travel",         label: "Do you travel out of state or internationally?",                    type: "select", weight: 8,  options: ["Yes, both","Just out of state","International","Rarely","Never"] },
    { id: "hotspot",        label: "Do you use your phone as a hotspot?",                                type: "select", weight: 7,  options: ["Yes, often","Sometimes","Rarely","Never"] },
    { id: "usage",          label: "How do you mainly use your phone? (Streaming, gaming, social…)",    type: "text",   weight: 6 },
    { id: "discounts",      label: "Anyone on your plan get discounts? (Military, student…)",          type: "select", weight: 5,  options: ["Military","Student","Senior","First Responder","No","Not Sure"] },
    { id: "keepNumber",     label: "Do you want to keep your current number(s) if you switch?",          type: "select", weight: 5,  options: ["Yes","No","Not Sure"] },
    { id: "issues",         label: "Have you had any issues with dropped calls or slow data?",          type: "select", weight: 4,  options: ["Yes","No","Sometimes"] },
    { id: "planPriority",   label: "What’s most important to you in a phone plan? (Price, coverage…)", type: "text",   weight: 3 },
    { id: "promos",         label: "Would you like to see your options for lower cost or promos?",      type: "select", weight: 2,  options: ["Yes","No","Maybe"] }
  ];
  global.gpQuestions = staticQuestions;

  // ─── Firebase Init ──────────────────────────────────────────────────────────
  const firebaseConfig = global.GP_FIREBASE_CONFIG || {
    apiKey: "AIzaSyD9fILTNJQ0wsPftUsPkdLrhRGZ9dslMzE",
    authDomain: "osls-644fd.firebaseapp.com",
    databaseURL: "https://osls-644fd-default-rtdb.firebaseio.com",
    projectId: "osls-644fd",
    storageBucket: "osls-644fd.appspot.com",
    messagingSenderId: "798578046321",
    appId: "1:798578046321:web:1a2bcd3ef4567gh8i9jkl",
    measurementId: "G-XXXXXXX"
  };
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  const auth = firebase.auth();

  // ─── State ───────────────────────────────────────────────────────────────────
  const DASHBOARD_URL = global.DASHBOARD_URL || "../html/admin.html";
  const answers = {};

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  function debounce(fn, delay = 300) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }
  function create(tag, attrs = {}, html = "") {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    if (html) el.innerHTML = html;
    return el;
  }

  // ─── Render UI ───────────────────────────────────────────────────────────────
  function renderUI() {
    const app = document.getElementById("guestApp");
    if (!app) return;
    app.innerHTML = "";

    // Header
    const header = create("header", {
      class: "guest-header",
      style: "display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid #ccc;"
    }, `
      <a id="backToDash" href="${DASHBOARD_URL}" style="font-weight:bold;font-size:18px;color:#333;text-decoration:none;">
        ← Dashboard
      </a>
      <div style="flex-grow:1;max-width:360px;margin-left:20px;">
        <label for="progressBar" style="font-weight:bold;font-size:14px;color:#555;">
          Progress: <span id="progressLabel">0%</span>
        </label>
        <progress id="progressBar" value="0" max="100" style="width:100%;height:18px;border-radius:8px;"></progress>
      </div>
    `);
    app.appendChild(header);
    header.querySelector("#backToDash").addEventListener("click", e => {
      if (e.metaKey||e.ctrlKey||e.shiftKey||e.altKey) return;
      e.preventDefault();
      window.location.href = DASHBOARD_URL;
    });

    // Steps container
    const container = create("div", {
      class: "guest-steps-container",
      style: "display:flex;gap:24px;flex-wrap:wrap;margin-top:20px;"
    });

    // Step 1
    const step1 = create("section", {
      class: "guest-step",
      style: "flex:1 1 300px;background:#f7f7f7;padding:20px;border-radius:10px;box-shadow:0 1px 4px rgba(0,0,0,0.1);border:1px solid #ddd;"
    }, `
      <h2 style="margin-top:0;font-size:22px;color:#222;">Step 1: Customer Info</h2>
      <label style="display:block;margin-bottom:16px;font-weight:600;color:#444;">
        Customer Name <span>(8pts)</span>
        <input id="custName" type="text" placeholder="Full name" style="width:100%;padding:10px;border-radius:6px;border:1px solid #ccc;margin-top:6px;font-size:16px;">
      </label>
      <label style="display:block;margin-bottom:16px;font-weight:600;color:#444;">
        Customer Phone <span>(7pts)</span>
        <input id="custPhone" type="tel" placeholder="Phone number" style="width:100%;padding:10px;border-radius:6px;border:1px solid #ccc;margin-top:6px;font-size:16px;">
      </label>
    `);

    // Step 2
    const step2 = create("section", {
      class: "guest-step",
      style: "flex:2 1 600px;background:#fff;padding:20px;border-radius:10px;box-shadow:0 1px 6px rgba(0,0,0,0.12);border:1px solid #ddd;max-height:90vh;overflow-y:auto;"
    }, `
      <h2 style="margin-top:0;font-size:22px;color:#222;">Step 2: Evaluate Needs</h2>
      <div id="step2Fields"></div>
    `);

    // Step 3
    const step3 = create("section", {
      class: "guest-step",
      style: "flex:1 1 300px;background:#f7f7f7;padding:20px;border-radius:10px;box-shadow:0 1px 4px rgba(0,0,0,0.1);border:1px solid #ddd;display:flex;flex-direction:column;"
    }, `
      <h2 style="margin-top:0;font-size:22px;color:#222;margin-bottom:12px;">
        Step 3: Proposed Solution <span>(25pts)</span>
      </h2>
      <textarea id="solutionText" rows="8" placeholder="What we’ll offer…" style="width:100%;padding:12px;border-radius:6px;border:1px solid #ccc;font-size:16px;resize:vertical;flex-grow:1;"></textarea>
    `);

    container.append(step1, step2, step3);
    app.appendChild(container);

    renderQuestions("step2Fields");
    setupInstantSaveForStep1();
    setupSolutionSave();
    updateTotalPoints();
    updatePitchText();

    if (typeof global.onGuestUIReady === "function") {
      global.onGuestUIReady();
    }
  }

  // ─── Render Questions & Step 2 Save Hooks ────────────────────────────────────
  function renderQuestions(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = "";

    const questions = global.gpQuestions || staticQuestions;
    questions.forEach(q => {
      let html;
      if (q.type === "text" || q.type === "number") {
        html = `
          <label style="display:block;margin-bottom:14px;font-weight:600;color:#444;">
            ${q.label}
            <input id="${q.id}" type="${q.type}" style="width:100%;padding:10px;border-radius:6px;border:1px solid #ccc;margin-top:6px;font-size:16px;">
          </label>`;
      } else {
        html = `
          <label style="display:block;margin-bottom:14px;font-weight:600;color:#444;">
            ${q.label}
            <select id="${q.id}" style="width:100%;padding:10px;border-radius:6px;border:1px solid #ccc;margin-top:6px;font-size:16px;">
              <option value="">-- Select --</option>
              ${q.options.map(opt=>`<option value="${opt}">${opt}</option>`).join("")}
            </select>
          </label>`;
      }
      container.insertAdjacentHTML("beforeend", html);

      const input = document.getElementById(q.id);
      if (!input) return;
      const ev = q.type === "select" ? "change" : "input";
      input.addEventListener(ev, debounce(() => {
        const val = input.value.trim();
        const pts = val === "" ? 0 : q.weight;
        answers[q.id] = { value: val, points: pts };
        saveAnswer(q.id, val, pts);
        updateTotalPoints();
        updatePitchText();
        if (global.gpApp?.saveNow) global.gpApp.saveNow();
      }, 300));
    });
  }

  // ─── Step 1 Save ──────────────────────────────────────────────────────────────
  function setupInstantSaveForStep1() {
    [["custName",8],["custPhone",7]].forEach(([id,pts]) => {
      const f = document.getElementById(id);
      if (!f) return;
      f.addEventListener("input", debounce(() => {
        const v = f.value.trim();
        answers[id] = { value: v, points: v ? pts : 0 };
        saveAnswer(id, v, answers[id].points);
        updateTotalPoints();
        updatePitchText();
        if (global.gpApp?.saveNow) global.gpApp.saveNow();
      }, 300));
    });
  }

  // ─── Step 3 Save ──────────────────────────────────────────────────────────────
  function setupSolutionSave() {
    const f = document.getElementById("solutionText");
    if (!f) return;
    f.addEventListener("input", debounce(() => {
      const v = f.value.trim();
      answers["solutionText"] = { value: v, points: v ? 25 : 0 };
      saveAnswer("solutionText", v, answers["solutionText"].points);
      updateTotalPoints();
      updatePitchText();
      if (global.gpApp?.saveNow) global.gpApp.saveNow();
    }, 300));
  }

  // ─── Persist Completion % ─────────────────────────────────────────────────────
  function saveAnswer(questionId, value, points) {
    const guestKey = global.gpApp?.guestKey;
    if (!guestKey) return;
    const maxPts = staticQuestions.reduce((sum,q)=>sum+q.weight,0) + 8 + 7 + 25;
    const totPts = Object.values(answers).reduce((sum,a)=>sum+a.points,0);
    const pct    = Math.min(100, Math.round((totPts/maxPts)*100));
    firebase.database()
      .ref(`guestinfo/${guestKey}/completionPct`)
      .set(pct);
  }

  // ─── UI Updates ──────────────────────────────────────────────────────────────
  function updateTotalPoints() {
    const maxPts = staticQuestions.reduce((s,q)=>s+q.weight,0) + 8 + 7 + 25;
    const totPts = Object.values(answers).reduce((s,a)=>s+a.points,0);
    const pct    = Math.min(100, Math.round((totPts/maxPts)*100));
    document.getElementById("progressLabel").textContent = `${pct}%`;
    document.getElementById("progressBar").value = pct;
  }

  function updatePitchText() {
    let pitch = "Customer Info Summary:\n";
    Object.entries(answers).forEach(([id,{value}]) => {
      if (value) pitch += `${getQuestionLabelById(id)}: ${value}\n`;
    });
    const sol = document.getElementById("solutionText");
    if (sol && !sol.value.trim()) sol.value = pitch.trim();
  }

  function getQuestionLabelById(id) {
    if (id === "custName") return "Customer Name";
    if (id === "custPhone") return "Customer Phone";
    if (id === "solutionText") return "Proposed Solution";
    const q = staticQuestions.concat(global.gpQuestions||[]).find(x=>x.id===id);
    return q ? q.label : id;
  }

  // ─── Kickoff ─────────────────────────────────────────────────────────────────
  global.answers = answers;
  auth.onAuthStateChanged(() => {
    renderUI();
  });

})(window);