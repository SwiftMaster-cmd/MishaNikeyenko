// gp-ui-render.js -- Guest Portal UI with nested Step 2 evaluate support, live save, and DEBUG LOGS
(function(global){
  console.debug('[gp-ui-render] init', new Date());

  const staticQuestions = [
    { id: "numLines", label: "How many lines do you need on your account?", type: "number", weight: 15 },
    { id: "carrier", label: "What carrier are you with right now?", type: "select", weight: 14, options: ["Verizon","AT&T","T-Mobile","US Cellular","Cricket","Metro","Boost","Straight Talk","Tracfone","Other"] },
    { id: "monthlySpend", label: "What do you usually pay each month for phone service?", type: "number", weight: 13 },
    { id: "deviceStatus", label: "Is your phone paid off, or do you still owe on it?", type: "select", weight: 12, options: ["Paid Off","Still Owe","Lease","Mixed","Not Sure"] },
    { id: "upgradeInterest", label: "Are you looking to upgrade your phone, or keep what you have?", type: "select", weight: 11, options: ["Upgrade","Keep Current","Not Sure"] },
    { id: "otherDevices", label: "Do you have any other devices--tablets, smartwatches, or hotspots?", type: "select", weight: 10, options: ["Tablet","Smartwatch","Hotspot","Multiple","None"] },
    { id: "coverage", label: "How’s your coverage at home and at work?", type: "select", weight: 9, options: ["Great","Good","Average","Poor","Not Sure"] },
    { id: "travel", label: "Do you travel out of state or internationally?", type: "select", weight: 8, options: ["Yes, both","Just out of state","International","Rarely","Never"] },
    { id: "hotspot", label: "Do you use your phone as a hotspot?", type: "select", weight: 7, options: ["Yes, often","Sometimes","Rarely","Never"] },
    { id: "usage", label: "How do you mainly use your phone? (Streaming, gaming, social, work, calls/texts)", type: "text", weight: 6 },
    { id: "discounts", label: "Anyone on your plan get discounts? (Military, student, senior, first responder)", type: "select", weight: 5, options: ["Military","Student","Senior","First Responder","No","Not Sure"] },
    { id: "keepNumber", label: "Do you want to keep your current number(s) if you switch?", type: "select", weight: 5, options: ["Yes","No","Not Sure"] },
    { id: "issues", label: "Have you had any issues with dropped calls or slow data?", type: "select", weight: 4, options: ["Yes","No","Sometimes"] },
    { id: "planPriority", label: "What’s most important to you in a phone plan? (Price, coverage, upgrades, service)", type: "text", weight: 3 },
    { id: "promos", label: "Would you like to see your options for lower monthly cost or free device promos?", type: "select", weight: 2, options: ["Yes","No","Maybe"] }
  ];

  console.debug('[gp-ui-render] staticQuestions loaded:', staticQuestions.map(q=>q.id));

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

  const DASHBOARD_URL = global.DASHBOARD_URL || "../html/admin.html";
  const answers = {};
  console.debug('[gp-ui-render] initial answers object', answers);

  function debounce(fn, delay = 300) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  function create(tag, attrs = {}, html = "") {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k,v]) => el.setAttribute(k, v));
    if (html) el.innerHTML = html;
    return el;
  }

  function renderUI() {
    console.debug('[renderUI] start');
    const app = document.getElementById("guestApp");
    if (!app) {
      console.warn('[renderUI] #guestApp not found, abort');
      return;
    }
    app.innerHTML = "";
    // Header
    const header = create("header", { class: "guest-header", style: "display:flex; justify-content: space-between; align-items: center; padding:12px 0; border-bottom:1px solid #ccc;" }, `
      <a id="backToDash" class="guest-back-btn" href="${DASHBOARD_URL}" style="font-weight:bold; font-size:18px; color:#333; text-decoration:none;">← Dashboard</a>
      <div style="flex-grow:1; max-width:360px; margin-left:20px;">
        <label for="progressBar" style="font-weight:bold; font-size:14px; color:#555;">Progress: <span id="progressLabel">0%</span></label>
        <progress id="progressBar" value="0" max="100" style="width:100%; height:18px; border-radius:8px;"></progress>
      </div>
    `);
    app.appendChild(header);
    header.querySelector("#backToDash").addEventListener("click", e => {
      if (e.metaKey||e.ctrlKey||e.shiftKey||e.altKey) return;
      e.preventDefault();
      window.location.href = DASHBOARD_URL;
    });

    // Steps container
    const container = create("div", { class: "guest-steps-container", style: "display:flex; gap:24px; flex-wrap:wrap; margin-top:20px;" });
    // Step 1
    const step1 = create("section", { class: "guest-step", style: "flex:1 1 300px; background:#f7f7f7; padding:20px; border-radius:10px; box-shadow:0 1px 4px rgba(0,0,0,0.1); border:1px solid #ddd;" });
    step1.innerHTML = `
      <h2 style="margin-top:0; font-size:22px; color:#222;">Step 1: Customer Info</h2>
      <label class="glabel" style="display:block; margin-bottom:16px; font-weight:600; color:#444;">
        Customer Name <span class="gp-pts">(8pts)</span>
        <input class="gfield" type="text" id="custName" placeholder="Full name" style="width:100%; padding:10px; border-radius:6px; border:1px solid #ccc; font-size:16px; margin-top:6px;"/>
      </label>
      <label class="glabel" style="display:block; margin-bottom:16px; font-weight:600; color:#444;">
        Customer Phone <span class="gp-pts">(7pts)</span>
        <input class="gfield" type="tel" id="custPhone" placeholder="Phone number" style="width:100%; padding:10px; border-radius:6px; border:1px solid #ccc; font-size:16px; margin-top:6px;"/>
      </label>
    `;
    // Step 2
    const step2 = create("section", { class: "guest-step", style: "flex:2 1 600px; background:#fff; padding:20px; border-radius:10px; box-shadow:0 1px 6px rgba(0,0,0,0.12); border:1px solid #ddd; max-height:90vh; overflow-y:auto;" });
    step2.innerHTML = `
      <h2 style="margin-top:0; font-size:22px; color:#222;">Step 2: Evaluate Needs</h2>
      <div id="step2Fields"></div>
    `;
    // Step 3
    const step3 = create("section", { class: "guest-step", style: "flex:1 1 300px; background:#f7f7f7; padding:20px; border-radius:10px; box-shadow:0 1px 4px rgba(0,0,0,0.1); border:1px solid #ddd; display:flex; flex-direction:column;" });
    step3.innerHTML = `
      <h2 style="margin-top:0; font-size:22px; color:#222; margin-bottom:12px;">Step 3: Proposed Solution <span class="gp-pts">(25pts)</span></h2>
      <textarea class="gfield" id="solutionText" rows="8" placeholder="What we’ll offer…" style="width:100%; padding:12px; border-radius:6px; border:1px solid #ccc; font-size:16px; resize:vertical; flex-grow:1;"></textarea>
    `;

    container.appendChild(step1);
    container.appendChild(step2);
    container.appendChild(step3);
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

  function renderQuestions(containerId) {
    console.debug('[renderQuestions] containerId=', containerId);
    const container = document.getElementById(containerId);
    if (!container) {
      console.warn('[renderQuestions] container not found:', containerId);
      return;
    }
    container.innerHTML = "";

    const questions = (global.gpQuestions && global.gpQuestions.length)
      ? global.gpQuestions
      : staticQuestions;
    console.debug('[renderQuestions] questions list:', questions.map(q=>q.id));

    questions.forEach(q => {
      let fieldHTML = "";
      if (q.type === "text" || q.type === "number") {
        fieldHTML = `
          <label class="glabel" style="display:block; margin-bottom:14px; font-weight:600; color:#444;">
            ${q.label}
            <input class="gfield" type="${q.type}" id="${q.id}" name="${q.id}"
              style="width:100%; padding:10px; border-radius:6px; border:1px solid #ccc; font-size:16px; margin-top:6px;" />
          </label>`;
      } else if (q.type === "select" && Array.isArray(q.options)) {
        fieldHTML = `
          <label class="glabel" style="display:block; margin-bottom:14px; font-weight:600; color:#444;">
            ${q.label}
            <select class="gfield" id="${q.id}" name="${q.id}"
              style="width:100%; padding:10px; border-radius:6px; border:1px solid #ccc; font-size:16px; margin-top:6px;">
              <option value="">-- Select --</option>
              ${q.options.map(opt => `<option value="${opt}">${opt}</option>`).join("")}
            </select>
          </label>`;
      }
      container.insertAdjacentHTML("beforeend", fieldHTML);
    });

    questions.forEach(q => {
      const input = document.getElementById(q.id);
      if (!input) {
        console.warn(`[renderQuestions] input #${q.id} not found`);
        return;
      }

      const debouncedSave = debounce(() => {
        const val = input.value.trim();
        const points = val === "" ? 0 : q.weight;
        answers[q.id] = { value: val, points };
        console.debug(`[Step 2] debouncedSave for ${q.id}: value="${val}", points=${points}`);
        saveAnswer(q.id, val, points);
        updateTotalPoints();
        updatePitchText();
        if (global.gpApp && typeof global.gpApp.saveNow === "function") {
          console.debug('[Step 2] triggering gpApp.saveNow()');
          global.gpApp.saveNow();
        }
      }, 300);

      input.addEventListener(q.type === "select" ? "change" : "input", debouncedSave);
      console.debug(`[renderQuestions] listener attached for ${q.id}`);
    });

    console.debug('[renderQuestions] complete');
  }

  function setupInstantSaveForStep1() {
    console.debug('[setupInstantSaveForStep1] start');
    const custName = document.getElementById("custName");
    const custPhone = document.getElementById("custPhone");

    if (custName) {
      const debouncedNameSave = debounce(() => {
        const val = custName.value.trim();
        answers["custName"] = { value: val, points: val ? 8 : 0 };
        console.debug(`[Step 1] saving custName="${val}"`);
        saveAnswer("custName", val, answers["custName"].points);
        updateTotalPoints();
        updatePitchText();
        if (global.gpApp?.saveNow) {
          console.debug('[Step 1] triggering gpApp.saveNow() for custName');
          global.gpApp.saveNow();
        }
      }, 300);
      custName.addEventListener("input", debouncedNameSave);
    } else console.warn('[setupInstantSaveForStep1] #custName not found');

    if (custPhone) {
      const debouncedPhoneSave = debounce(() => {
        const val = custPhone.value.trim();
        answers["custPhone"] = { value: val, points: val ? 7 : 0 };
        console.debug(`[Step 1] saving custPhone="${val}"`);
        saveAnswer("custPhone", val, answers["custPhone"].points);
        updateTotalPoints();
        updatePitchText();
        if (global.gpApp?.saveNow) {
          console.debug('[Step 1] triggering gpApp.saveNow() for custPhone');
          global.gpApp.saveNow();
        }
      }, 300);
      custPhone.addEventListener("input", debouncedPhoneSave);
    } else console.warn('[setupInstantSaveForStep1] #custPhone not found');

    console.debug('[setupInstantSaveForStep1] complete');
  }

  function setupSolutionSave() {
    console.debug('[setupSolutionSave] start');
    const solutionText = document.getElementById("solutionText");
    if (solutionText) {
      const debouncedSolutionSave = debounce(() => {
        const val = solutionText.value.trim();
        answers["solutionText"] = { value: val, points: val ? 25 : 0 };
        console.debug(`[Step 3] saving solutionText="${val.substring(0,30)}..."`);
        saveAnswer("solutionText", val, answers["solutionText"].points);
        updateTotalPoints();
        updatePitchText();
        if (global.gpApp?.saveNow) {
          console.debug('[Step 3] triggering gpApp.saveNow() for solutionText');
          global.gpApp.saveNow();
        }
      }, 300);
      solutionText.addEventListener("input", debouncedSolutionSave);
    } else console.warn('[setupSolutionSave] #solutionText not found');
    console.debug('[setupSolutionSave] complete');
  }

  function saveAnswer(questionId, value, points) {
    console.debug(`[saveAnswer] called for ${questionId}`, { value, points });
    if (!global.gpApp?.guestKey) {
      console.warn(`[saveAnswer] no guestKey, skipping save for ${questionId}`);
      return;
    }
    if (!global.firebase?.database) {
      console.warn(`[saveAnswer] firebase.database not available, skipping save for ${questionId}`);
      return;
    }

    const dbRef = firebase.database().ref(`guestinfo/${global.gpApp.guestKey}/completionPct`);
    const maxPoints = staticQuestions.reduce((sum,q)=>sum+q.weight,0) + 8 + 7 + 25;
    const total = Object.values(answers).reduce((sum,a)=>sum+a.points,0);
    const percent = Math.min(100, Math.round((total / maxPoints) * 100));

    console.debug(`[saveAnswer] writing completionPct=${percent} (total=${total}, max=${maxPoints})`);
    dbRef.set(percent)
      .then(() => console.debug(`[saveAnswer] Firebase write successful for ${questionId}`))
      .catch(err => console.error(`[saveAnswer] Firebase write FAILED for ${questionId}`, err));
  }

  function updateTotalPoints() {
    const maxPoints = staticQuestions.reduce((sum,q)=>sum+q.weight,0) + 8 + 7 + 25;
    const total = Object.values(answers).reduce((sum,a)=>sum+a.points,0);
    const percent = Math.min(100, Math.round((total / maxPoints) * 100));
    console.debug(`[updateTotalPoints] total=${total}, max=${maxPoints}, percent=${percent}`);
    const progressLabel = document.getElementById("progressLabel");
    const progressBar = document.getElementById("progressBar");
    if (progressLabel) progressLabel.textContent = `${percent}%`;
    if (progressBar) progressBar.value = percent;
  }

  function updatePitchText() {
    const entries = Object.entries(answers);
    console.debug('[updatePitchText] answers entries:', entries);
    if (!entries.length) return;

    let pitch = "Customer Info Summary:\n";
    entries.forEach(([id,{value}]) => {
      if (value) {
        pitch += `${getQuestionLabelById(id)}: ${value}\n`;
      }
    });

    const sol = document.getElementById("solutionText");
    if (sol && !sol.value.trim()) {
      console.debug('[updatePitchText] autofilling solutionText with pitch summary');
      sol.value = pitch.trim();
    }
  }

  function getQuestionLabelById(id) {
    console.debug('[getQuestionLabelById] id=', id);
    const all = (global.gpQuestions && global.gpQuestions.length) ? global.gpQuestions : staticQuestions;
    if (id === "custName") return "Customer Name";
    if (id === "custPhone") return "Customer Phone";
    if (id === "solutionText") return "Proposed Solution";
    const q = all.find(x => x.id === id);
    return q ? q.label : id;
  }

  global.answers = answers;

  auth.onAuthStateChanged(user => {
    console.debug('[onAuthStateChanged] user=', user);
    renderUI();
  });

})(window);