// gp-admin-questions-ui.js -- Admin UI for managing Step 2 questions
// Place at ../js/gp/gp-admin-questions-ui.js and load **after** gp-questions.js & after Firebase SDKs

(function(global){
  const auth = firebase.auth();
  const db   = firebase.database();
  let isAdmin = false;

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
  // Render the admin panel once we know role
  // ───────────────────────────────────────────────────────────────────────────
  function renderAdminPanel() {
    const container = document.getElementById('guestApp');
    if (!container || !isAdmin) return;

    // If already exists, skip
    if (document.getElementById('adminPanel')) return;

    const panel = create('section', { id: 'adminPanel', class: 'admin-panel' },
      create('h2', {}, 'Step 2 Questions Admin'),
      create('div', { id: 'adminQuestionsList', class: 'admin-questions-list' }),
      create('h3', {}, 'Add New Question'),
      create('form', { id: 'adminAddForm' },
        create('input', { type: 'text', id: 'newQLabel', placeholder: 'Label', required: true }),
        create('select', { id: 'newQType' },
          create('option', { value: 'text' }, 'Text'),
          create('option', { value: 'number' }, 'Number'),
          create('option', { value: 'select' }, 'Select')
        ),
        create('input', { type: 'number', id: 'newQWeight', placeholder: 'Weight', required: true, min: 0 }),
        create('input', { type: 'text', id: 'newQOptions', placeholder: 'Options (comma-separated)', style: 'display:none' }),
        create('button', { type: 'submit' }, 'Add Question')
      )
    );
    container.insertBefore(panel, container.firstChild);

    // Show/hide options input when type="select"
    document.getElementById('newQType').addEventListener('change', e => {
      const opts = document.getElementById('newQOptions');
      opts.style.display = e.target.value === 'select' ? '' : 'none';
    });

    // Handle add form submission
    document.getElementById('adminAddForm').addEventListener('submit', async e => {
      e.preventDefault();
      const label  = e.target.newQLabel.value.trim();
      const type   = e.target.newQType.value;
      const weight = parseInt(e.target.newQWeight.value, 10);
      const opts   = type === 'select'
        ? e.target.newQOptions.value.split(',').map(s=>s.trim()).filter(Boolean)
        : [];
      try {
        await global.addQuestion({ label, type, weight, options: opts });
        e.target.reset();
        document.getElementById('newQOptions').style.display = 'none';
      } catch(err) {
        alert('Error adding question');
        console.error(err);
      }
    });

    // Subscribe to question updates
    global.onQuestionsUpdated(renderQuestionsList);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Build the list of existing questions with Edit/Delete controls
  // ───────────────────────────────────────────────────────────────────────────
  function renderQuestionsList(questions) {
    const list = document.getElementById('adminQuestionsList');
    if (!list) return;
    list.innerHTML = '';

    questions.forEach(q => {
      const item = create('div', { class: 'admin-question-item', 'data-id': q.id },
        create('strong', {}, q.label),
        ` [${q.type}] (${q.weight}pts) `,
        // Delete button
        create('button', { class: 'adminDelBtn' }, 'Delete'),
        // Edit button
        create('button', { class: 'adminEditBtn' }, 'Edit')
      );
      list.appendChild(item);
    });

    // Attach handlers
    list.querySelectorAll('.adminDelBtn').forEach(btn => {
      btn.addEventListener('click', async e => {
        const id = e.target.parentElement.dataset.id;
        if (!confirm('Remove this question?')) return;
        try {
          await global.deleteQuestion(id);
        } catch(err) {
          alert('Error deleting');
          console.error(err);
        }
      });
    });
    list.querySelectorAll('.adminEditBtn').forEach(btn => {
      btn.addEventListener('click', e => {
        const id = e.target.parentElement.dataset.id;
        startEdit(id);
      });
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Inline edit flow: transform item into editable fields
  // ───────────────────────────────────────────────────────────────────────────
  function startEdit(id) {
    const item = document.querySelector(`.admin-question-item[data-id="${id}"]`);
    if (!item) return;
    const q = global.gpQuestions.find(x=>x.id===id);
    if (!q) return;

    // Build edit form inline
    item.innerHTML = '';
    const form = create('form', { class: 'adminEditForm' },
      create('input', { type: 'text', name: 'label', value: q.label, required: true }),
      create('select', { name: 'type' },
        ['text','number','select'].map(t =>
          create('option', { value: t, selected: t===q.type }, t)
        )
      ),
      create('input', { type: 'number', name: 'weight', value: q.weight, min: 0, required: true }),
      create('input', { type: 'text', name: 'options', placeholder: 'Comma-separated', value: q.options.join(',') , style: q.type==='select'?'':'display:none' }),
      create('button', { type: 'submit' }, 'Save'),
      create('button', { type: 'button', class: 'cancelEdit' }, 'Cancel')
    );
    item.appendChild(form);

    // Show/hide options field based on type
    form.type.addEventListener('change', e => {
      form.options.style.display = e.target.value==='select'?'':'none';
    });

    // Cancel edits
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

  // ───────────────────────────────────────────────────────────────────────────
  // Determine admin role from Firebase custom claim "admin"
  // ───────────────────────────────────────────────────────────────────────────
  auth.onAuthStateChanged(async user => {
    if (!user) return;
    const token = await user.getIdTokenResult();
    isAdmin = Boolean(token.claims.admin);
    if (isAdmin) renderAdminPanel();
  });

})(window);