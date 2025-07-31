// gp-app-min.js
import {
  onAuthStateChanged,
  createNewLead,
  getGuest,
  updateGuest,
  attachCompletionListener,
  getCurrentUserUid
} from './gp-firebase.js';

(function(global) {
  let _guestKey = null;
  let _guestObj = {};
  let _uiStep = "step1";

  const el = id => document.getElementById(id);

  function readFields() {
    const out = {
      custName: el("custName")?.value.trim() || "",
      custPhone: el("custPhone")?.value.trim() || "",
      solutionText: el("solutionText")?.value.trim() || ""
    };
    (global.gpQuestions || []).forEach(q => {
      const f = el(q.id);
      out[q.id] = f ? f.value.trim() : "";
    });
    return out;
  }

  function writeFields(g) {
    if (el("custName")) el("custName").value = g.custName || "";
    if (el("custPhone")) el("custPhone").value = g.custPhone || "";
    (global.gpQuestions || []).forEach(q => {
      const f = el(q.id);
      if (!f) return;
      f.value = g.evaluate?.[q.id] ?? g[q.id] ?? "";
    });
    if (el("solutionText")) el("solutionText").value = g.solution?.text || "";
  }

  function loadAnswersFromGuest(g) {
    const ans = global.answers;
    if (!ans) return;
    Object.keys(ans).forEach(k => delete ans[k]);
    if (g.custName) ans["custName"] = { value: g.custName, points: 8 };
    if (g.custPhone) ans["custPhone"] = { value: g.custPhone, points: 7 };
    if (g.evaluate) {
      (global.gpQuestions || []).forEach(q => {
        const v = g.evaluate[q.id] || "";
        if (v) ans[q.id] = { value: v, points: q.weight };
      });
    }
    if (g.solution?.text) ans["solutionText"] = { value: g.solution.text, points: 25 };
  }

  async function saveGuestNow() {
    if (!_guestKey) return; // guard

    const f = readFields();
    const now = Date.now();
    const status = global.gpCore
      ? global.gpCore.detectStatus({ ..._guestObj, ...f, solution: { text: f.solutionText } })
      : "new";

    const evalData = {};
    (global.gpQuestions || []).forEach(q => {
      evalData[q.id] = f[q.id] || "";
    });

    const updates = {
      [`guestinfo/${_guestKey}/custName`]: f.custName,
      [`guestinfo/${_guestKey}/custPhone`]: f.custPhone,
      [`guestinfo/${_guestKey}/status`]: status,
      [`guestinfo/${_guestKey}/updatedAt`]: now
    };
    if (f.solutionText) {
      updates[`guestinfo/${_guestKey}/solution`] = {
        text: f.solutionText,
        completedAt: _guestObj.solution?.completedAt || now
      };
    } else {
      updates[`guestinfo/${_guestKey}/solution`] = null;
    }
    Object.entries(evalData).forEach(([k, v]) => {
      updates[`guestinfo/${_guestKey}/evaluate/${k}`] = v;
    });

    try {
      await updateGuest(_guestKey, updates);
    } catch (e) {
      console.error("Error updating guest:", e);
    }
  }

  async function loadContext() {
    const params = new URLSearchParams(window.location.search);
    const gid = params.get("gid") || localStorage.getItem("last_guestinfo_key");

    if (gid) {
      try {
        let g = await getGuest(gid);
        if (g) {
          if (global.gpCore) g = global.gpCore.normGuest(g);
          _guestKey = gid;
          _guestObj = g;
          writeFields(g);
          loadAnswersFromGuest(g);

          const st = global.gpCore ? global.gpCore.detectStatus(g) : "new";
          const step = st === "proposal" ? "step3" : st === "working" ? "step2" : "step1";
          global.gpApp.gotoStep(step);

          if (global.updateTotalPoints) global.updateTotalPoints();
          if (global.updatePitchText) global.updatePitchText();

          attachCompletionListener(gid, pct => {
            const label = el("progressLabel");
            const bar = el("progressBar");
            if (label) label.textContent = `${pct}%`;
            if (bar) bar.value = pct;
            if (global.updateProgressHeader) global.updateProgressHeader(pct);
          });

          if (global.updateLeadId) global.updateLeadId(gid);
          return;
        }
      } catch (e) {
        console.error("Error loading guest:", e);
      }
    }

    // reset UI, no auto-save blank guest
    _guestObj = {};
    _guestKey = null;
    global.gpApp.gotoStep("step1");
    writeFields({});
    loadAnswersFromGuest({});
    if (global.updateTotalPoints) global.updateTotalPoints();
    if (global.updatePitchText) global.updatePitchText();
    if (global.updateLeadId) global.updateLeadId(null);
  }

  function navHandler(step) {
    ["step1", "step2", "step3"].forEach(s => {
      const form = el(s + "Form");
      if (form) form.classList.toggle("hidden", s !== step);
    });
    Array.from(document.querySelectorAll("#gp-step-nav button")).forEach(b =>
      b.classList.toggle("active", b.dataset.step === step)
    );
    _uiStep = step;
  }

  onAuthStateChanged(async user => {
    if (!user) {
      if (!el("gp-auth-overlay")) {
        const o = document.createElement("div");
        o.id = "gp-auth-overlay";
        o.style = "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.8);color:#fff;font-size:1.1rem;padding:1rem;";
        o.textContent = "Please sign in to continue.";
        document.body.appendChild(o);
      }
      return;
    }
    el("gp-auth-overlay")?.remove();

    await loadContext();
  });

  global.gpBasic = {
    get guestKey() { return _guestKey; },
    save: saveGuestNow,
    goto: navHandler,
    open: loadContext,
  };

  global.gpApp = {
    get guestKey() { return global.gpBasic.guestKey; },
    saveNow: global.gpBasic.save,
    gotoStep: global.gpBasic.goto,
    openContext: global.gpBasic.open,
  };

})(window);