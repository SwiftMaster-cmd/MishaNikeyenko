import { saveField } from './save-handler.js';
import { getGuestKey } from './gp-app.js'; // or wherever you store current guest key

function setupStep1Listeners() {
  ["custName", "custPhone"].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      const val = el.value.trim();
      const gid = getGuestKey();
      if (!gid) return;
      saveField(gid, id, val);
    });
  });
}

function setupStep2Listeners(questions) {
  questions.forEach(q => {
    const el = document.getElementById(q.id);
    if (!el) return;
    const eventType = q.type === 'select' ? 'change' : 'input';
    el.addEventListener(eventType, () => {
      const val = el.value.trim();
      const gid = getGuestKey();
      if (!gid) return;
      saveField(gid, q.id, val);
    });
  });
}

function setupStep3Listener() {
  const el = document.getElementById('solutionText');
  if (!el) return;
  el.addEventListener('input', () => {
    const val = el.value.trim();
    const gid = getGuestKey();
    if (!gid) return;
    saveField(gid, 'solutionText', val);
  });
}

export function initUIApp(questions) {
  setupStep1Listeners();
  setupStep2Listeners(questions);
  setupStep3Listener();
}