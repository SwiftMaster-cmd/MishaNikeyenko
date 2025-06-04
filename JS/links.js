/* /JS/links.js – categories picker (existing or "New…") – 2025-06-03
   - Two categories max per row, two links per row inside each category
   - Category select fills dynamically; "➕ New…" reveals a text box          */

///////////////////////////////////////////////////////////////////////////////
// 0. Firebase bootstrap (unchanged)                                         //
///////////////////////////////////////////////////////////////////////////////
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

import { initializeApp }                from "https://www.gstatic.com/firebasejs/11.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged }  from "https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js";
import {
  getDatabase, ref as dbRef,
  push, set, remove, update, onValue
} from "https://www.gstatic.com/firebasejs/11.8.1/firebase-database.js";

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getDatabase(app);

///////////////////////////////////////////////////////////////////////////////
// 1. helpers                                                                 //
///////////////////////////////////////////////////////////////////////////////
const $      = sel => document.querySelector(sel);
const $list  = ()  => $('#links-list');

let categories = new Set();             // global live category set

const groupByCat = data => {
  const out = {};
  Object.entries(data).forEach(([id, l]) => {
    const key = (l.category || 'Uncategorized').trim();
    (out[key] ||= []).push({ ...l, id });
  });
  return out;
};

function onUserReady(cb){
  onAuthStateChanged(auth, user => user
    ? cb(user)
    : window.location.href = "../index.html"
  );
}

///////////////////////////////////////////////////////////////////////////////
// 2. category picker utilities                                              //
///////////////////////////////////////////////////////////////////////////////
function refreshPicker(){
  const sel = $('#link-category');
  if (!sel) return;
  const opts = [...categories].sort()
               .map(c => `<option value="${c}">${c}</option>`)
               .join('') + '<option value="__new__">➕ New…</option>';
  sel.innerHTML = opts;
  sel.value = [...categories][0] || '__new__';
}

function wirePickerUI(){
  const sel = $('#link-category');
  const newBox = $('#new-cat-input');
  if (!sel || !newBox) return;

  sel.onchange = () => {
    const makeNew = sel.value === '__new__';
    newBox.classList.toggle('hidden', !makeNew);
    if (makeNew) newBox.focus();
  };
}

///////////////////////////////////////////////////////////////////////////////
// 3. RENDER                                                                 //
///////////////////////////////////////////////////////////////////////////////
function render(uid){
  onValue(dbRef(db, `users/${uid}/links`), snap => {
    const data = snap.val() || {};
    // update category set
    categories = new Set(Object.values(data).map(l => (l.category || 'Uncategorized').trim()));
    refreshPicker();

    const list = $list();
    list.innerHTML = Object.keys(data).length ? '' : "<p class='empty'>No links yet.</p>";
    if (!Object.keys(data).length) return;

    for (const [cat, links] of Object.entries(groupByCat(data))){
      const section = document.createElement('div');
      section.className = 'category-section';

      // header
      const header = document.createElement('div');
      header.className = 'category-title';
      header.innerHTML = `
        <h2>${cat}</h2>
        <div class="cat-actions">
          <button class="ghost edit" data-cat="${cat}">✏️</button>
          <button class="ghost delete" data-cat="${cat}">🗑️</button>
        </div>`;
      section.appendChild(header);

      // two-column grid
      const grid = document.createElement('div');
      grid.className = 'category-links';
      section.appendChild(grid);

      // rename/delete logic
      header.querySelector('.edit').onclick = () => {
        const name = prompt('Rename to:', cat);
        if (name && name !== cat)
          links.forEach(l => update(dbRef(db,`users/${uid}/links/${l.id}`),{category:name}));
      };
      header.querySelector('.delete').onclick = () => {
        if (confirm(`Delete "${cat}" and its links?`))
          links.forEach(l => remove(dbRef(db,`users/${uid}/links/${l.id}`)));
      };

      // link cards
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

///////////////////////////////////////////////////////////////////////////////
// 4. INTERACTIONS                                                           //
///////////////////////////////////////////////////////////////////////////////
function bind(uid){
  let openMenu=null;

  // open URL
  $list().addEventListener('click', e=>{
    const btn=e.target.closest('.link-main');
    if(btn && !e.target.classList.contains('menu-btn'))
      window.open(btn.dataset.url,'_blank','noopener,noreferrer');
  });

  // row menu toggle
  $list().addEventListener('click', e=>{
    const trg=e.target.closest('.menu-btn'); if(!trg) return;
    const menu=$(`#m-${trg.dataset.id}`);
    if(openMenu && openMenu!==menu) openMenu.hidden=true;
    menu.hidden=!menu.hidden; openMenu=menu.hidden?null:menu;
  });

  // outside click close
  document.addEventListener('mousedown', e=>{
    if(openMenu && !openMenu.contains(e.target))
      openMenu.hidden=true, openMenu=null;
  });

  // delete & edit
  $list().addEventListener('click', e=>{
    const del=e.target.closest('.menu-delete');
    const edt=e.target.closest('.menu-edit');
    if(!del && !edt) return;
    const id=(del||edt).dataset.id;

    if(del) remove(dbRef(db,`users/${uid}/links/${id}`));

    if(edt){
      const row   = $(`#m-${id}`).parentElement;
      const t     = row.querySelector('.title').textContent;
      const u     = row.querySelector('.preview').textContent;
      const curCat= row.parentElement.parentElement.querySelector('h2').textContent;

      const pick = prompt(`Category (pick or type new):\n${[...categories].join(' | ')}`, curCat) ?? curCat;
      const newCat = pick.trim() || curCat;

      update(dbRef(db,`users/${uid}/links/${id}`),{
        title: prompt('Title:', t) ?? t,
        url:   prompt('URL:',   u) ?? u,
        category: newCat
      });
      categories.add(newCat); refreshPicker();
    }
    if(openMenu) openMenu.hidden=true, openMenu=null;
  });
}

///////////////////////////////////////////////////////////////////////////////
// 5. Add-Link form with picker                                              //
///////////////////////////////////////////////////////////////////////////////
function addForm(uid){
  const form   = $('#add-link-form');  if(!form) return;
  const sel    = $('#link-category');
  const newBox = $('#new-cat-input');

  wirePickerUI();

  form.onsubmit = e=>{
    e.preventDefault();
    const title = $('#link-title').value.trim();
    const url   = $('#link-url').value.trim();
    let   cat   = sel.value === '__new__' ? newBox.value.trim() : sel.value;
    if(!title || !url || !cat) return;

    set(push(dbRef(db,`users/${uid}/links`)),{title,url,category:cat});
    categories.add(cat); refreshPicker();
    form.reset();
    sel.value=[...categories][0];      // reset to first category
    newBox.classList.add('hidden');
  };
}

///////////////////////////////////////////////////////////////////////////////
// 6. BOOT                                                                   //
///////////////////////////////////////////////////////////////////////////////
onUserReady(user=>{
  addForm(user.uid);
  render(user.uid);
  bind(user.uid);
});