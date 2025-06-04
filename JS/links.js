/* /JS/links.js – complete file (picker + modal edit) – 2025-06-03
   Layout: max 2 categories side-by-side; inside each, max 2 links per row.
   Users choose an existing category from a dropdown or pick "➕ New…" to add one.
   A tidy in-page dialog replaces the old prompt() edit flow.
*/

/*─────────────────────────────────────────────────────────────*/
/* 0. Firebase bootstrap                                      */
/*─────────────────────────────────────────────────────────────*/
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

import { initializeApp }               from "https://www.gstatic.com/firebasejs/11.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js";
import {
  getDatabase, ref as dbRef, get,
  push, set, remove, update, onValue
} from "https://www.gstatic.com/firebasejs/11.8.1/firebase-database.js";

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getDatabase(app);

/*─────────────────────────────────────────────────────────────*/
/* 1. DOM refs / globals                                       */
/*─────────────────────────────────────────────────────────────*/
const $      = s => document.querySelector(s);
const $list  = () => $('#links-list');

let uid;                          // logged-in user id
let categories = new Set();       // live set of category names

/* picker in add-form */
const catSel  = $('#link-category');
const newBox  = $('#new-cat-input');

/* edit modal elements */
const overlay = $('#edit-overlay');
const eTitle  = $('#edit-title');
const eURL    = $('#edit-url');
const eCat    = $('#edit-cat');
const btnCancel = $('#edit-cancel');

/*─────────────────────────────────────────────────────────────*/
/* 2. Utility functions                                        */
/*─────────────────────────────────────────────────────────────*/
const groupByCat = data => {
  const out = {};
  Object.entries(data).forEach(([id, l]) => {
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
  eCat .innerHTML  = opts;
  catSel.value = [...categories][0] || '__new__';
}

function onUserReady(cb){
  onAuthStateChanged(auth, user => {
    if (user) cb(user);
    else      window.location.href = "../index.html";
  });
}

/*─────────────────────────────────────────────────────────────*/
/* 3. Add-form picker wiring                                   */
/*─────────────────────────────────────────────────────────────*/
catSel.onchange = () => {
  const makeNew = catSel.value === '__new__';
  newBox.classList.toggle('hidden', !makeNew);
  if (makeNew) newBox.focus();
};

/*─────────────────────────────────────────────────────────────*/
/* 4. Edit modal helpers                                       */
/*─────────────────────────────────────────────────────────────*/
function openEditModal(link, id){
  eTitle.value = link.title;
  eURL.value   = link.url;
  refreshPickers();
  eCat.value   = link.category;

  eCat.onchange = () => {
    if (eCat.value === '__new__'){
      const n = prompt('New category name:','');
      if (n){
        categories.add(n); refreshPickers(); eCat.value = n;
      } else {
        eCat.value = link.category;
      }
    }
  };

  overlay.classList.remove('hidden');

  /* save */
  $('#edit-dialog').onsubmit = ev => {
    ev.preventDefault();
    const upd = {
      title:    eTitle.value.trim(),
      url:      eURL.value.trim(),
      category: eCat.value.trim()
    };
    update(dbRef(db, `users/${uid}/links/${id}`), upd)
      .then(() => {
        categories.add(upd.category);
        refreshPickers();
        overlay.classList.add('hidden');
      });
  };
}

btnCancel.onclick = () => overlay.classList.add('hidden');

/*─────────────────────────────────────────────────────────────*/
/* 5. Render categories / links                                */
/*─────────────────────────────────────────────────────────────*/
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
      const section = document.createElement('div');
      section.className = 'category-section';

      /* header */
      section.innerHTML = `<div class="category-title">
          <h2>${cat}</h2>
          <div class="cat-actions">
            <button class="ghost edit">✏️</button>
            <button class="ghost delete">🗑️</button>
          </div>
        </div>`;
      const header = section.firstElementChild;

      /* grid container */
      const grid = document.createElement('div');
      grid.className = 'category-links';
      section.appendChild(grid);

      /* rename / delete */
      header.querySelector('.edit').onclick = () => {
        const name = prompt('Rename to:', cat);
        if (name && name !== cat){
          links.forEach(l => update(dbRef(db, `users/${uid}/links/${l.id}`), { category: name }));
        }
      };
      header.querySelector('.delete').onclick = () => {
        if (confirm(`Delete "${cat}" and its links?`))
          links.forEach(l => remove(dbRef(db, `users/${uid}/links/${l.id}`)));
      };

      /* link cards */
      links.forEach(link => {
        const row = document.createElement('div');
        row.className = 'link-row';
        row.innerHTML = `
          <button class="link-main" data-url="${link.url}">
            <span class="title">${link.title}</span>
            <span class="menu-btn" data-id="${link.id}" tabindex="0">⋮</span>
          </button>
          <div class="menu" id="m-${link.id}" hidden>
            <button class="menu-edit"   data-id="${link.id}">Edit</button>
            <button class="menu-delete" data-id="${link.id}">Delete</button>
            <div class="preview">${link.url}</div>
          </div>`;
        grid.appendChild(row);
      });

      list.appendChild(section);
    }
  });
}

/*─────────────────────────────────────────────────────────────*/
/* 6. Event binding                                            */
/*─────────────────────────────────────────────────────────────*/
function bind(){
  let openMenu = null;

  /* open link */
  $list().addEventListener('click', e => {
    const btn = e.target.closest('.link-main');
    if (btn && !e.target.classList.contains('menu-btn'))
      window.open(btn.dataset.url, '_blank', 'noopener,noreferrer');
  });

  /* row menu toggle */
  $list().addEventListener('click', e => {
    const trg = e.target.closest('.menu-btn');
    if (!trg) return;
    const menu = $(`#m-${trg.dataset.id}`);
    if (openMenu && openMenu !== menu) openMenu.hidden = true;
    menu.hidden = !menu.hidden;
    openMenu = menu.hidden ? null : menu;
  });

  /* outside click closes menu */
  document.addEventListener('mousedown', e => {
    if (openMenu && !openMenu.contains(e.target)) openMenu.hidden = true, openMenu = null;
  });

  /* delete / edit */
  $list().addEventListener('click', e => {
    const del = e.target.closest('.menu-delete');
    const edt = e.target.closest('.menu-edit');
    if (!del && !edt) return;
    const id = (del || edt).dataset.id;

    if (del){
      remove(dbRef(db, `users/${uid}/links/${id}`));
    }

    if (edt){
      get(dbRef(db, `users/${uid}/links/${id}`))
        .then(snap => snap.exists() && openEditModal(snap.val(), id));
    }

    if (openMenu) openMenu.hidden = true, openMenu = null;
  });
}

/*─────────────────────────────────────────────────────────────*/
/* 7. Add-link form logic                                      */
/*─────────────────────────────────────────────────────────────*/
function addForm(){
  $('#add-link-form').onsubmit = e => {
    e.preventDefault();
    const title = $('#link-title').value.trim();
    const url   = $('#link-url').value.trim();
    let   cat   = catSel.value === '__new__' ? newBox.value.trim() : catSel.value;

    if (!title || !url || !cat) return;

    set(push(dbRef(db, `users/${uid}/links`)), { title, url, category: cat });
    categories.add(cat); refreshPickers();

    e.target.reset();
    newBox.classList.add('hidden');
  };
}

/*─────────────────────────────────────────────────────────────*/
/* 8. BOOT                                                     */
/*─────────────────────────────────────────────────────────────*/
onUserReady(user => {
  uid = user.uid;
  addForm();
  render();
  bind();
});