/* links.js -- sidebar renderer, modal-safe (4 Jun 2025) */

/*──────────────────────── 0. Firebase bootstrap ───────────────────────*/
const firebaseConfig = {
  apiKey:            "AIzaSyCf_se10RUg8i_u8pdowHlQvrFViJ4jh_Q",
  authDomain:        "mishanikeyenko.firebaseapp.com",
  databaseURL:       "https://mishanikeyenko-default-rtdb.firebaseio.com",
  projectId:         "mishanikeyenko",
  storageBucket:     "mishanikeyenko.appspot.com",
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

/*──────────────────────── 1. DOM guards & refs ────────────────────────*/
const $ = sel => document.querySelector(sel);

const nav      = $('#side-nav');
const navLinks = $('#nav-links');
if (!nav || !navLinks){
  console.error('❌ Required sidebar elements (#side-nav / #nav-links) are missing.');
  throw new Error('Sidebar container not found');
}

/* add-form */
const addSel  = $('#link-category');
const addNew  = $('#new-cat-input');

/* modal */
const overlay = $('#edit-overlay');
const dlg     = $('#edit-dialog');
const eTitle  = $('#edit-title');
const eURL    = $('#edit-url');
const eCat    = $('#edit-cat');
const eNewCat = $('#edit-new-cat');
const btnCancel = $('#edit-cancel');

/* globals */
let uid;
let categories = new Set();

/*──────────────────────── 2. Tiny helpers ─────────────────────────────*/
const groupByCat = data => {
  const out = {};
  Object.entries(data).forEach(([id, l])=>{
    const k = (l.category || 'Uncategorized').trim();
    (out[k] ||= []).push({ ...l, id });
  });
  return out;
};

const refreshPickers = () => {
  const opts = [...categories].sort()
    .map(c => `<option value="${c}">${c}</option>`).join('')
    + '<option value="__new__">➕ New…</option>';
  addSel.innerHTML = opts;
  eCat .innerHTML  = opts;
  addSel.value = [...categories][0] || '__new__';
};

/* modal freeze */
const showModal = () => { overlay.classList.remove('hidden'); document.body.classList.add('modal-open'); };
const hideModal = () => { overlay.classList.add('hidden');    document.body.classList.remove('modal-open'); };

/*──────────────────────── 3. Add-bookmark form ───────────────────────*/
addSel.onchange = () => {
  const makeNew = addSel.value === '__new__';
  addNew.classList.toggle('hidden', !makeNew);
  if (makeNew) addNew.focus();
};

$('#add-link-form').addEventListener('submit', e=>{
  e.preventDefault();
  const title = $('#link-title').value.trim();
  const url   = $('#link-url').value.trim();
  let   cat   = addSel.value === '__new__' ? addNew.value.trim() : addSel.value.trim();
  if (!title || !url || !cat) return;

  set(push(dbRef(db,`users/${uid}/links`)), { title, url, category: cat });
  categories.add(cat);
  refreshPickers();
  e.target.reset();
  addNew.classList.add('hidden');
});

/*──────────────────────── 4. Edit modal workflow ─────────────────────*/
function openEdit(link, id){
  eTitle.value = link.title;
  eURL.value   = link.url;
  refreshPickers();
  eCat.value   = link.category;
  eNewCat.classList.add('hidden'); eNewCat.value = '';

  eCat.onchange = () => {
    const makeNew = eCat.value === '__new__';
    eNewCat.classList.toggle('hidden', !makeNew);
    if (makeNew) eNewCat.focus();
  };

  dlg.onsubmit = ev =>{
    ev.preventDefault();
    const cat = eCat.value === '__new__' ? eNewCat.value.trim() : eCat.value.trim();
    if (!cat){ alert('Category required'); return; }

    const upd = { title:eTitle.value.trim(), url:eURL.value.trim(), category:cat };
    update(dbRef(db,`users/${uid}/links/${id}`), upd)
      .then(()=>{ categories.add(cat); refreshPickers(); hideModal(); });
  };

  showModal();
}
btnCancel.onclick = hideModal;

/*──────────────────────── 5. Render sidebar ──────────────────────────*/
function renderSidebar(){
  onValue(dbRef(db,`users/${uid}/links`), snap=>{
    const data = snap.val() || {};
    categories = new Set(Object.values(data).map(l=>(l.category||'Uncategorized').trim()));
    refreshPickers();

    navLinks.innerHTML = '';
    if (!Object.keys(data).length){
      navLinks.innerHTML = '<p class="empty">No links yet.</p>';
      return;
    }

    for (const [cat, links] of Object.entries(groupByCat(data))){
      /* header */
      const header = document.createElement('div');
      header.className = 'category-title';
      header.innerHTML = `
        <h2>${cat}</h2>
        <div class="cat-actions">
          <button class="ghost edit">✏️</button>
          <button class="ghost delete">🗑️</button>
        </div>`;
      navLinks.appendChild(header);

      header.querySelector('.edit').onclick = () =>{
        const n = prompt('Rename to:', cat);
        if (n && n !== cat)
          links.forEach(l => update(dbRef(db,`users/${uid}/links/${l.id}`), { category:n }));
      };
      header.querySelector('.delete').onclick = () =>{
        if (confirm(`Delete "${cat}" and its links?`))
          links.forEach(l => remove(dbRef(db,`users/${uid}/links/${l.id}`)));
      };

      /* links */
      const group = document.createElement('div');
      group.className = 'nav-links-group';
      links.forEach(l=>{
        const row = document.createElement('div');
        row.className = 'link-row';
        row.innerHTML = `
          <button class="link-main" data-url="${l.url}">
            <span class="title">${l.title}</span>
            <span class="menu-btn" data-id="${l.id}" tabindex="0">⋮</span>
          </button>
          <div class="menu" id="m-${l.id}" hidden>
            <button class="menu-edit"   data-id="${l.id}">Edit</button>
            <button class="menu-delete" data-id="${l.id}">Delete</button>
            <div class="preview">${l.url}</div>
          </div>`;
        group.appendChild(row);
      });
      navLinks.appendChild(group);
    }
  });
}

/*──────────────────────── 6. Interactions inside sidebar ─────────────*/
function bindSidebar(){
  let openMenu = null;

  navLinks.addEventListener('click', e=>{
    const btn = e.target.closest('.link-main');
    if (btn && !e.target.classList.contains('menu-btn'))
      window.open(btn.dataset.url,'_blank','noopener,noreferrer');
  });

  navLinks.addEventListener('click', e=>{
    const trg = e.target.closest('.menu-btn'); if (!trg) return;
    const menu = document.getElementById('m-'+trg.dataset.id);
    if (openMenu && openMenu !== menu) openMenu.hidden = true;
    menu.hidden = !menu.hidden; openMenu = menu.hidden ? null : menu;
  });

  document.addEventListener('mousedown', e=>{
    if (openMenu && !openMenu.contains(e.target))
      openMenu.hidden = true, openMenu = null;
  });

  navLinks.addEventListener('click', e=>{
    const del = e.target.closest('.menu-delete');
    const edt = e.target.closest('.menu-edit');
    if (!del && !edt) return;
    const id = (del||edt).dataset.id;

    if (del) remove(dbRef(db,`users/${uid}/links/${id}`));

    if (edt)
      get(dbRef(db,`users/${uid}/links/${id}`))
        .then(snap=>snap.exists() && openEdit(snap.val(), id));

    if (openMenu) openMenu.hidden = true, openMenu = null;
  });
}

/*──────────────────────── 7. Boot once DOM + Auth ready ──────────────*/
document.addEventListener('DOMContentLoaded', ()=>{
  onAuthStateChanged(auth, user=>{
    if (!user){ window.location.href = "../index.html"; return; }
    uid = user.uid;

    /* open the sidebar immediately */
    nav.classList.add('open');
    document.body.classList.add('sidebar-open');

    renderSidebar();
    bindSidebar();
    hideModal();                             // ensure overlay hidden
  });
});