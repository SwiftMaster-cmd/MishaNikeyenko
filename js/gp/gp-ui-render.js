// gp-ui-render.js -- Guest Portal UI with nested Step 2 evaluate support, live save, and DEBUG LOGS
(function(global){
  console.debug('[gp-ui-render] init', new Date());

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
  console.debug('[gp-ui-render] staticQuestions loaded:', staticQuestions.map(q => q.id));

  // expose to gp-app-min.js
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
    console.debug('[gp-ui-render] initializing Firebase app');
    firebase.initializeApp(firebaseConfig);
  }
  const auth = firebase.auth();

  // ─── State ───────────────────────────────────────────────────────────────────
  const DASHBOARD_URL = global.DASHBOARD_URL || "../html/admin.html";
  const answers = {};
  console.debug('[gp-ui-render] initial answers object', answers);

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
    console.debug('[renderUI] start');
    const app = document.getElementById("guestApp");
    if (!app) {
      console.warn('[renderUI] #guestApp not found, abort');
      return;
    }
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

    console.debug('[renderUI] UI built, now rendering Step 2 questions');
    renderQuestions("step2Fields");

    console.debug('[renderUI] setting up Step 1 & Solution saves');
    setupInstantSaveForStep1();
    setupSolutionSave();

    if (typeof global.onGuestUIReady === "function") {
      console.debug('[renderUI] calling onGuestUIReady()');
      global.onGuestUIReady();
    }
    console.debug('[renderUI] done');
  }

  // ─── Render Questions & Instant Save for Step 2 ────────────────────────────
  function renderQuestions(containerId) {
    console.debug('[renderQuestions] containerId=', containerId);
    const container = document.getElementById(containerId);
    if (!container) {
      console.warn('[renderQuestions] container not found:', containerId);
      return;
    }
    container.innerHTML = "";

    const questions = global.gpQuestions || staticQuestions;
    console.debug('[renderQuestions] questions list:', questions.map(q=>q.id));

    questions.forEach(q => {
      let html = "";
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
    });

    questions.forEach(q => {
      const input = document.getElementById(q.id);
      if (!input) {
        console.warn(`[renderQuestions] input #${q.id} not found`);
        return;
      }
      const ev = q.type === "select" ? "change" : "input";
      const debouncedSave = debounce(() => {
        const val = input.value.trim();
        const pts = val === "" ? 0 : q.weight;
        answers[q.id] = { value: val, points: pts };
        console.debug(`[Step 2] debouncedSave for ${q.id}: value="${val}", points=${pts}`);
        saveAnswer(q.id, val, pts);
        updateTotalPoints();
        updatePitchText();
        if (global.gpApp?.saveNow) {
          console.debug('[Step 2] triggering gpApp.saveNow()');
          global.gpApp.saveNow();
        }
      }, 300);
      input.addEventListener(ev, debouncedSave);
      console.debug(`[renderQuestions] listener attached for ${q.id}`);
    });

    console.debug('[renderQuestions] complete');
  }

  // ─── Step 1 Instant Save ─────────────────────────────────────────────────────
  function setupInstantSaveForStep1() {
    console.debug('[setupInstantSaveForStep1] start');
    [["custName",8], ["custPhone",7]].forEach(([id,pts]) => {
      const f = document.getElementById(id);
      if (!f) {
        console.warn(`[setupInstantSaveForStep1] #${id} not found`);
        return;
      }
      const deb = debounce(() => {
        const v = f.value.trim();
        answers[id] = { value: v, points: v ? pts : 0 };
        console.debug(`[Step 1] saving ${id}="${v}"`);
        saveAnswer(id, v, answers[id].points);
        updateTotalPoints();
        updatePitchText();
        if (global.gpApp?.saveNow) {
          console.debug(`[Step 1] triggering gpApp.saveNow() for ${id}`);
          global.gpApp.saveNow();
        }
      }, 300);
      f.addEventListener("input", deb);
    });
    console.debug('[setupInstantSaveForStep1] complete');
  }

  // ─── Step 3 Instant Save ─────────────────────────────────────────────────────
  function setupSolutionSave() {
    console.debug('[setupSolutionSave] start');
    const f = document.getElementById("solutionText");
    if (!f) {
      console.warn('[setupSolutionSave] #solutionText not found');
      return;
    }
    const deb = debounce(() => {
      const v = f.value.trim();
      answers["solutionText"] = { value: v, points: v ? 25 : 0 };
      console.debug(`[Step 3] saving solutionText="${v.substring(0,30)}..."`);
      saveAnswer("solutionText", v, answers["solutionText"].points);
      updateTotalPoints();
      updatePitchText();
      if (global.gpApp?.saveNow) {
        console.debug('[Step 3] triggering gpApp.saveNow() for solutionText');
        global.gpApp.saveNow();
      }
    }, 300);
    f.addEventListener("input", deb);
    console.debug('[setupSolutionSave] complete');
  }

  // ─── Persist Completion % Only ───────────────────────────────────────────────
  function saveAnswer(questionId, value, points) {
    console.debug(`[saveAnswer] called for ${questionId}`, { value, points });
    const guestKey = global.gpApp?.guestKey;
    if (!guestKey) {
      console.warn(`[saveAnswer] no guestKey, skipping save for ${questionId}`);
      return;
    }
    if (!firebase.database) {
      console.warn(`[saveAnswer] firebase.database missing, skipping save for ${questionId}`);
      return;
    }
    // compute completion %
    const maxPts = staticQuestions.reduce((s,q)=>s+q.weight,0) + 8 + 7 + 25;
    const totPts = Object.values(answers).reduce((s,a)=>s+a.points,0);
    const pct = Math.min(100, Math.round((totPts/maxPts)*100));
    console.debug(`[saveAnswer] writing completionPct=${pct} (total=${totPts}, max=${maxPts})`);

    firebase.database()
      .ref(`guestinfo/${guestKey}/completionPct`)
      .set(pct)
      .then(()=>console.debug(`[saveAnswer] completionPct updated`))
      .catch(e=>console.error(`[saveAnswer] failed to write completionPct`, e));
  }

  // ─── UI Updates ──────────────────────────────────────────────────────────────
  function updateTotalPoints() {
    const maxPts = staticQuestions.reduce((s,q)=>s+q.weight,0) + 8 + 7 + 25;
    const totPts = Object.values(answers).reduce((s,a)=>s+a.points,0);
    const pct    = Math.min(100, Math.round((totPts/maxPts)*100));
    console.debug(`[updateTotalPoints] total=${totPts}, max=${maxPts}, pct=${pct}`);
    document.getElementById("progressLabel").textContent = `${pct}%`;
    document.getElementById("progressBar").value = pct;
  }
  function updatePitchText() {
    const entries = Object.entries(answers);
    console.debug('[updatePitchText] answers:', entries);
    if (!entries.length) return;
    let pitch = "Customer Info Summary:\n";
    entries.forEach(([id,{value}])=>{
      if (value) pitch += `${getQuestionLabelById(id)}: ${value}\n`;
    });
    const sol = document.getElementById("solutionText");
    if (sol && !sol.value.trim()) {
      console.debug('[updatePitchText] autofilling solutionText');
      sol.value = pitch.trim();
    }
  }
  function getQuestionLabelById(id) {
    if (id==="custName") return "Customer Name";
    if (id==="custPhone") return "Customer Phone";
    if (id==="solutionText") return "Proposed Solution";
    const q = staticQuestions.find(x=>x.id===id) || (global.gpQuestions||[]).find(x=>x.id===id);
    return q ? q.label : id;
  }

  // ─── Expose & Kickoff ───────────────────────────────────────────────────────
  global.answers = answers;
  auth.onAuthStateChanged(user=>{
    console.debug('[onAuthStateChanged] user=',user);
    renderUI();
  });

})(window);