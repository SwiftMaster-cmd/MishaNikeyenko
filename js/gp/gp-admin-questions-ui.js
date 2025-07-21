// gp-admin-questions-ui.js -- Admin CRUD UI for Step 2 questions, injected into #adminPanelPlaceholder
// Load after Firebase SDKs and gp-questions.js

(function(global){
  const auth = firebase.auth();
  let isAdmin = false;

  // Utility: create element with attrs & children
  function create(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k,v]) => el.setAttribute(k, v));
    children.forEach(c => {
      if (typeof c === 'string') el.appendChild(document.createTextNode(c));
      else if (c) el.appendChild(c);
    });
    return el;
  }

  // Render admin panel into the placeholder
  function renderAdminPanel() {
    const placeholder = document.getElementById('adminPanelPlaceholder');
    if (!placeholder || !isAdmin) return;
    if (document.getElementById('adminPanel')) return;

    const panel = create('section', { id: 'adminPanel', class: 'admin-panel' },
      create('h2', {}, 'Step 2 Questions Admin'),
      create('div', { id: 'adminQuestionsList', class: 'admin-questions-list' }),
      create('h3', {}, 'Add New Question'),
      create('form', { id: 'adminAddForm' },
        create('input',  { type: 'text',    id: 'newQLabel',   placeholder: 'Label', required: true }),
        create('select', { id: 'newQType' },
          create('option',{ value: 'text'   }, 'Text'),
          create('option',{ value: 'number' }, 'Number'),
          create('option',{ value: 'select' }, 'Select')
        ),
        create('input',  { type: 'number',  id: 'newQWeight',  placeholder: 'Weight', required: true, min: 0 }),
        create('input',  { type: 'text',    id: 'newQOptions', placeholder: 'Options (comma-separated)', style: 'display:none' }),
        create('button',{ type: 'submit'   }, 'Add Question')
      )
    );

    placeholder.appendChild(panel);

    // Toggle options field visibility
    panel.querySelector('#newQType').addEventListener('change', e => {
      panel.querySelector('#newQOptions').style.display = e.target.value === 'select' ? '' : 'none';
    });

    // Handle add-question form
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

    // Subscribe to updates & initial render
    global.onQuestionsUpdated(renderQuestionsList);
    renderQuestionsList(global.gpQuestions);
  }

  // Build the list of existing questions with Edit/Delete controls
  function renderQuestionsList(qList) {
    const list = document.getElementById('adminQuestionsList');
    if (!list) return;
    list.innerHTML = '';

    qList.forEach(q => {
      const item = create('div', { class: 'admin-question-item', 'data-id': q.id },
        create('strong', {}, q.label),
        ` [${q.type}] (${q.weight}pts) `,
        create('button',{ class: 'adminDelBtn' }, 'Delete'),
        create('button',{ class: 'adminEditBtn' }, 'Edit')
      );
      list.appendChild(item);
    });

    // Attach delete handlers
    list.querySelectorAll('.adminDelBtn').forEach(btn => {
      btn.addEventListener('click', async e => {
        if (!confirm('Remove this question?')) return;
        await global.deleteQuestion(e.target.parentElement.dataset.id);
      });
    });

    // Attach edit handlers
    list.querySelectorAll('.adminEditBtn').forEach(btn => {
      btn.addEventListener('click', e => startEdit(e.target.parentElement.dataset.id));
    });
  }

  // Inline edit flow
  function startEdit(id) {
    const item = document.querySelector(`.admin-question-item[data-id="${id}"]`);
    if (!item) return;
    const q = global.gpQuestions.find(x => x.id === id);
    if (!q) return;

    item.innerHTML = '';
    const form = create('form', { class: 'adminEditForm' },
      create('input',{ type:'text',   name:'label',  value:q.label, required:true }),
      create('select',{ name:'type' },
        ['text','number','select'].map(t =>
          create('option',{ value:t, selected:t===q.type }, t)
        )
      ),
      create('input',{ type:'number', name:'weight', value:q.weight, min:0, required:true }),
      create('input',{ type:'text',   name:'options', placeholder:'Comma-separated',
                       value:q.options.join(','), style:q.type==='select'?'':'display:none' }),
      create('button',{ type:'submit' }, 'Save'),
      create('button',{ type:'button', class:'cancelEdit' }, 'Cancel')
    );
    item.appendChild(form);

    // Toggle options field
    form.type.addEventListener('change', e => {
      form.options.style.display = e.target.value === 'select' ? '' : 'none';
    });

    // Cancel edit
    form.querySelector('.cancelEdit').addEventListener('click', () => {
      renderQuestionsList(global.gpQuestions);
    });

    // Submit update
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

  // Initialize: check admin claim and render panel inside placeholder
  auth.onAuthStateChanged(async user => {
    if (!user) return;
    const token = await user.getIdTokenResult();
    isAdmin = Boolean(token.claims.admin);
    if (!isAdmin) return;
    if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', renderAdminPanel);
    } else {
      renderAdminPanel();
    }
  });

})(window);