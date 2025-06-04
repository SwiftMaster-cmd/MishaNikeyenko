/* /JS/links.js – Sidebar list version (June 2025) */

const firebaseConfig = {
  apiKey:            "AIzaSyCf_se10RUg8i_u8pdowHlQvrFViJ4jh_Q",
  authDomain:        "mishanikeyenko.firebaseapp.com",
  databaseURL:       "https://mishanikeyenko-default-rtdb.firebaseio.com",
  projectId:         "mishanikeyenko",
  storageBucket:     "mishanikeyenko.firebasestorage.app",
  messagingSenderId: "1089190937368",
  appId:             "1:1089190937368:web:959c825fc596a5e3ae946d",
  measurementId:     "G-L6CC27129C"
};

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js";
import {
  getDatabase, ref as dbRef, get,
  push, set, remove, update, onValue
} from "https://www.gstatic.com/firebasejs/11.8.1/firebase-database.js";

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getDatabase(app);

/* DOM refs */
const $     = s => document.querySelector(s);
const $list = () => document.getElementById('links-list');

let uid;
let categories = new Set();

/* form elements */
const catSel = $('#link-category');
const newBox = $('#new-cat-input');

/* edit modal elements */
const overlay   = $('#edit-overlay');
const eTitle    = $('#edit-title');
const eURL      = $('#edit-url');
const eCat      = $('#edit-cat');
const eNewCat   = $('#edit-new-cat');
const btnCancel = $('#edit-cancel');

/* group links by category */
const groupByCat = d => {
  const out = {};
  Object.entries(d).forEach(([id, l]) => {
    const key = (l.category || 'Uncategorized').trim();
    (out[key] ||= []).push({ ...l, id });
  });
  return out;
};

function refreshPickers(){
  const opts = [...categories].sort()
               .map(c => `<option value="${c}">${c}</option>`).join('')
             + '<option value="__new__">➕ New…</option>';
  catSel.innerHTML = opts;
  eCat.innerHTML   = opts;
  catSel.value = [...categories][0] || '__new__';
}

function onUserReady(cb){
  onAuthStateChanged(auth, u => u ? cb(u) : (window.location.href = "../index.html"));
}

catSel.onchange = () => {
  const isNew = catSel.value === '__new__';
  newBox.classList.toggle('hidden', !isNew);
  if (isNew) newBox.focus();
};

function showModal(){
  overlay.classList.remove('hidden');
  document.body.classList.add('modal-open');
}
function hideModal(){
  overlay.classList.add('hidden');
  document.body.classList.remove('modal-open');
}

function openEdit(link, id){
  eTitle.value = link.title;
  eURL.value   = link.url;
  refreshPickers();
  eCat.value   = link.category;
  eNewCat.value = '';
  eNewCat.classList.add('hidden');

  eCat.onchange = () => {
    const makeNew = eCat.value === '__new__';
    eNewCat.classList.toggle('hidden', !makeNew);
    if (makeNew) eNewCat.focus();
  };

  showModal();

  $('#edit-dialog').onsubmit = ev => {
    ev.preventDefault();
    const cat = eCat.value === '__new__' ? eNewCat.value.trim() : eCat.value.trim();
    if (!cat) { alert('Category required'); return; }

    const upd = { title: eTitle.value.trim(), url: eURL.value.trim(), category: cat };
    update(dbRef(db, `users/${uid}/links/${id}`), upd)
      .then(() => {
        categories.add(cat);
        refreshPickers();
        hideModal();
      });
  };
}
btnCancel.onclick = hideModal;

/* Render sidebar links only */
function render(){
  onValue(dbRef(db, `users/${uid}/links`), snap => {
    const data = snap.val() || {};
    categories = new Set(Object.values(data).map(l => (l.category || 'Uncategorized').trim()));
    refreshPickers();

    const list = $list();
    list.innerHTML = '';

    if (!Object.keys(data).length){
      list.innerHTML = "<p class='empty'>No links yet.</p>";
      return;
    }

    for (const [cat, links] of Object.entries(groupByCat(data))){
      links.forEach(link => {
        const btn = document.createElement('button');
        btn.className = 'link-main';
        btn.dataset.url = link.url;
        btn.innerHTML = `
          <span class="title">${link.title}</span>
          <span class="menu-btn" data-id="${link.id}" tabindex="0">⋮</span>
        `;

        const menu = document.createElement('div');
        menu.className = 'menu';
        menu.id = `m-${link.id}`;
        menu.hidden = true;
        menu.innerHTML = `
          <button class="menu-edit" data-id="${link.id}">Edit</button>
          <button class="menu-delete" data-id="${link.id}">Delete</button>
          <div class="preview">${link.url}</div>
        `;

        const wrapper = document.createElement('div');
        wrapper.className = 'link-row';
        wrapper.appendChild(btn);
        wrapper.appendChild(menu);
        list.appendChild(wrapper);
      });
    }
  });
}

function bind(){
  let openMenu = null;

  $list().addEventListener('click', e => {
    const btn = e.target.closest('.link-main');
    if (btn && !e.target.classList.contains('menu-btn'))
      window.open(btn.dataset.url, '_blank', 'noopener,noreferrer');
  });

  $list().addEventListener('click', e => {
    const trg = e.target.closest('.menu-btn'); if (!trg) return;
    const m = document.getElementById(`m-${trg.dataset.id}`);
    if (openMenu && openMenu !== m) openMenu.hidden = true;
    m.hidden = !m.hidden; openMenu = m.hidden ? null : m;
  });

  document.addEventListener('mousedown', e => {
    if (openMenu && !openMenu.contains(e.target)) openMenu.hidden = true, openMenu = null;
  });

  $list().addEventListener('click', e => {
    const del = e.target.closest('.menu-delete');
    const edt = e.target.closest('.menu-edit');
    if (!del && !edt) return;
    const id = (del || edt).dataset.id;

    if (del) remove(dbRef(db,`users/${uid}/links/${id}`));

    if (edt)
      get(dbRef(db,`users/${uid}/links/${id}`))
        .then(snap => snap.exists() && openEdit(snap.val(), id));

    if (openMenu) openMenu.hidden = true, openMenu = null;
  });
}

function wireAddForm(){
  $('#add-link-form').onsubmit = e => {
    e.preventDefault();
    const title = $('#link-title').value.trim();
    const url   = $('#link-url').value.trim();
    let cat     = catSel.value === '__new__' ? newBox.value.trim() : catSel.value.trim();

    if (!title || !url || !cat) return;

    set(push(dbRef(db,`users/${uid}/links`)), { title, url, category: cat });
    categories.add(cat); refreshPickers();
    e.target.reset(); newBox.classList.add('hidden');
  };
}

onUserReady(user => {
  uid = user.uid;
  wireAddForm();
  render();
  bind();
  hideModal();
});