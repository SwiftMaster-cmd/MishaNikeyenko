import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getDatabase, ref, set, remove, get, onValue, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import {
  getAuth, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

document.addEventListener('DOMContentLoaded', () => {
  // 🔧 Firebase config
  const firebaseConfig = {
    apiKey: "AIzaSyCf_se10RUg8i_u8pdowHlQvrFViJ4jh_Q",
    authDomain: "mishanikeyenko.firebaseapp.com",
    databaseURL: "https://mishanikeyenko-default-rtdb.firebaseio.com",
    projectId: "mishanikeyenko",
    storageBucket: "mishanikeyenko.firebasestorage.app",
    messagingSenderId: "1089190937368",
    appId: "1:1089190937368:web:959c825fc596a5e3ae946d",
    measurementId: "G-L6CC27129C"
  };

  const app = initializeApp(firebaseConfig);
  const db = getDatabase(app);
  const auth = getAuth(app);

  const loadButton = document.getElementById('load-module');
  const saveButton = document.getElementById('save-script');
  const pasteArea = document.getElementById('js-paster');
  const nameInput = document.getElementById('js-name');
  const outputDiv = document.getElementById('js-output');
  const savedList = document.getElementById('saved-list');

  let userRef = null;

  onAuthStateChanged(auth, (user) => {
    if (!user) {
      outputDiv.textContent = '⚠️ Not signed in. Module saving disabled.';
      return;
    }

    userRef = ref(db, `jsModules/${user.uid}`);
    renderSavedScripts();
  });

  loadButton.addEventListener('click', async () => {
    const code = pasteArea.value.trim();
    outputDiv.innerHTML = '';

    if (!code) {
      alert('Paste a valid ES module first.');
      return;
    }

    try {
      const blob = new Blob([code], { type: 'text/javascript' });
      const url = URL.createObjectURL(blob);
      const mod = await import(url);
      URL.revokeObjectURL(url);

      const knownExports = ['showModuleDemo', 'init', 'run', 'default'];
      let ran = false;

      for (const name of knownExports) {
        const fn = mod[name];
        if (typeof fn === 'function') {
          const result = await fn();
          if (typeof result === 'string') {
            const msg = document.createElement('p');
            msg.textContent = result;
            msg.style.marginTop = '1rem';
            outputDiv.appendChild(msg);
          }
          ran = true;
          break;
        }
      }

      if (!ran) {
        outputDiv.textContent = '✅ Module loaded, but no known function was exported.';
      }
    } catch (err) {
      console.error('[dynamic-loader] error:', err);
      outputDiv.textContent = '❌ Error loading module: ' + err.message;
    }
  });

  saveButton.addEventListener('click', async () => {
    const name = nameInput.value.trim();
    const code = pasteArea.value.trim();

    if (!name || !code || !userRef) {
      alert('Please enter both a name and some code (and be signed in).');
      return;
    }

    await set(ref(db, `${userRef}/${name}`), {
      name,
      code,
      ts: serverTimestamp()
    });

    nameInput.value = '';
    pasteArea.value = '';
    outputDiv.innerHTML = '';

    const msg = document.createElement('p');
    msg.textContent = `✅ Saved script: "${name}"`;
    msg.style.marginTop = '1rem';
    outputDiv.appendChild(msg);
  });

  function renderSavedScripts() {
    if (!userRef) return;

    onValue(userRef, snapshot => {
      savedList.innerHTML = '';
      const data = snapshot.val() || {};

      for (const [name, obj] of Object.entries(data)) {
        const item = document.createElement('div');
        item.className = 'input-row';
        item.innerHTML = `
          <strong>${name}</strong>
          <div class="script-actions">
            <button class="btn-outline" data-action="run" data-name="${name}">▶️</button>
            <button class="btn-outline" data-action="edit" data-name="${name}">✏️</button>
            <button class="btn-outline" data-action="delete" data-name="${name}">🗑️</button>
          </div>
        `;
        savedList.appendChild(item);
      }
    });
  }

  savedList.addEventListener('click', async (e) => {
    const btn = e.target;
    const name = btn.dataset.name;
    const action = btn.dataset.action;
    if (!name || !action || !userRef) return;

    const snap = await get(ref(db, `${userRef}/${name}`));
    const data = snap.val();
    if (!data) return;

    if (action === 'run') {
      pasteArea.value = data.code;
      loadButton.click();
    } else if (action === 'edit') {
      nameInput.value = name;
      pasteArea.value = data.code;
    } else if (action === 'delete') {
      await remove(ref(db, `${userRef}/${name}`));
    }
  });
});