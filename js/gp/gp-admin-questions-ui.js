// gp-admin-questions-ui.js -- Admin CRUD UI for Step 2 questions, injected into #adminPanelPlaceholder
// Load **after** Firebase SDKs, gp-questions.js, gp-core.js, and gp-ui-render.js

(function(global){
  // ───────────────────────────────────────────────────────────────────────────
  // Ensure Firebase is initialized
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
  const auth = firebase.auth();

  // ───────────────────────────────────────────────────────────────────────────
  // Utility: create element with attrs & children
  // ───────────────────────────────────────────────────────────────────────────
  function create(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k,v]) => el.setAttribute(k, v));
    children.forEach(c => {
      if (typeof c === 'string') el.appendChild(document.createTextNode(c));
      else if (c) el.appendChild(c);
    });
    return el;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Render admin panel into the placeholder
  // ───────────────────────────────────────────────────────────────────────────
  function renderAdminPanel() {
    const placeholder = document.getElementById('adminPanelPlaceholder');
    if (!placeholder || document.getElementById('adminPanel')) return;

    const panel = create('section', { id: 'adminPanel', class: 'admin-panel' },
      create('h2', {}, 'Admin: Manage Step 2 Questions'),
      create('div', { id: 'adminQuestionsList', class: 'admin-questions-list' }),
      create('h3', {}, 'Add New Question'),
      create('form', { id: 'adminAddForm' },
        create('input',  { type: 'text',    id: 'newQLabel',   placeholder: 'Label', required: '' }),
        create('select',{ id: 'newQType' },
          create('option',{ value: 'text'   }, 'Text'),
          create('option',{ value: 'number' }, 'Number'),
          create('option',{ value: 'select' }, 'Select')
        ),
        create('input',  { type: 'number',  id: 'newQWeight',  placeholder: 'Weight', required: '', min: '0' }),
        create('input',  { type: 'text',    id: 'newQOptions', placeholder: 'Options (comma-separated)', style: 'display:none' }),
        create('button',{ type: 'submit'   }, 'Add Question')
      )
    );
    placeholder.appendChild(panel);

    // Toggle options field visibility
    panel.querySelector('#newQType').addEventListener('change', e => {
      panel.querySelector('#newQOptions').style.display = e.target.value === 'select' ? '' : 'none';
    });

    // Handle add-question form submission
    panel.querySelector('#adminAddForm').addEventListener('submit', async e => {
      e.preventDefault();
      const label  = e.target.newQLabel.value.trim();
      const type   = e.target.newQType.value;
      const weight = parseInt(e.target.newQWeight.value, 10);
      const opts   = type === 'select'
        ? e.target.newQOptions.value.split(',').map(s => s.trim()).filter(Boolean)
        : [];
      try {
        await global.addQuestion({ label, type, weight, options: opts });
        e.target.reset();
        panel.querySelector('#newQOptions').style.display = 'none';
      } catch(err) {
        alert('Error adding question');
        console.error(err);
      }
    });

    // Subscribe to changes and render the list
    global.onQuestionsUpdated(renderQuestionsList);
    renderQuestionsList(global.gpQuestions);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Render list of existing questions with Edit/Delete controls
  // ───────────────────────────────────────────────────────────────────────────
  function renderQuestionsList(questions) {
    const list = document.getElementById('adminQuestionsList');
    if (!list) return;
    list.innerHTML = '';

    questions.forEach(q => {
      const item = create('div', { class: 'admin-question-item', 'data-id': q.id },
        create('strong', {}, q.label),
        ` [${q.type}] (${q.weight}pts) `,
        create('button',{ class: 'adminDelBtn' }, 'Delete'),
        create('button',{ class: 'adminEditBtn' }, 'Edit')
      );
      list.appendChild(item);
    });

    // Delete handlers
    list.querySelectorAll('.adminDelBtn').forEach(btn => {
      btn.addEventListener('click', async e => {
        if (!confirm('Remove this question?')) return;
        await global.deleteQuestion(e.target.parentElement.dataset.id);
      });
    });

    // Edit handlers
    list.querySelectorAll('.adminEditBtn').forEach(btn => {
      btn.addEventListener('click', e => {
        startEdit(e.target.parentElement.dataset.id);
      });
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Inline edit flow for existing questions
  // ───────────────────────────────────────────────────────────────────────────
  function startEdit(id) {
    const item = document.querySelector(`.admin-question-item[data-id="${id}"]`);
    if (!item) return;
    const q = global.gpQuestions.find(x => x.id === id);
    if (!q) return;

    item.innerHTML = '';
    const form = create('form', { class: 'adminEditForm' },
      create('input',{ type:'text',   name:'label',  value:q.label, required: '' }),
      create('select',{ name:'type' },
        ['text','number','select'].map(t =>
          create('option',{ value:t, selected:t===q.type }, t)
        )
      ),
      create('input',{ type:'number', name:'weight', value:q.weight, min:'0', required: '' }),
      create('input',{ type:'text',   name:'options', placeholder:'Comma-separated',
                       value:q.options.join(','), style:q.type==='select'?'':'display:none' }),
      create('button',{ type:'submit' },'Save'),
      create('button',{ type:'button', class:'cancelEdit' },'Cancel')
    );
    item.appendChild(form);

    form.type.addEventListener('change', e => {
      form.options.style.display = e.target.value==='select' ? '' : 'none';
    });
    form.querySelector('.cancelEdit').addEventListener('click', () => {
      renderQuestionsList(global.gpQuestions);
    });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const label  = form.label.value.trim();
      const type   = form.type.value;
      const weight = parseInt(form.weight.value, 10);
      const opts   = type==='select'
        ? form.options.value.split(',').map(s=>s.trim()).filter(Boolean)
        : [];
      try {
        await global.updateQuestion(id, { label, type, weight, options: opts });
      } catch(err) {
        alert('Error updating');
        console.error(err);
      }
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // On auth change: wait for DOM and placeholder, then render if admin
  // ───────────────────────────────────────────────────────────────────────────
  auth.onAuthStateChanged(async user => {
    if (!user) return;
    const token = await user.getIdTokenResult();
    if (!token.claims.admin) return;

    // Poll for placeholder existence
    function tryRender() {
      if (document.getElementById('adminPanelPlaceholder')) {
        renderAdminPanel();
      } else {
        window.requestAnimationFrame(tryRender);
      }
    }

    if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', tryRender);
    } else {
      tryRender();
    }
  });

})(window);