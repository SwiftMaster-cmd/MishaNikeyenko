/* /JS/links.js – two-column layout per category (2025-06-03) */

/* ── Firebase config ───────────────────────────────────────── */
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

/* ── Firebase core ─────────────────────────────────────────── */
import { initializeApp }                from "https://www.gstatic.com/firebasejs/11.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged }  from "https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js";
import {
  getDatabase, ref as dbRef,
  push, set, remove, update, onValue
} from "https://www.gstatic.com/firebasejs/11.8.1/firebase-database.js";

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getDatabase(app);

/* ── auth helper ──────────────────────────────────────────── */
function onUserReady(cb){
  onAuthStateChanged(auth, user => {
    if (user) cb(user);
    else      window.location.href = "../index.html";
  });
}

/* ── DOM helpers ───────────────────────────────────────────── */
const $     = sel => document.querySelector(sel);
const $list = ()  => $('#links-list');

const groupByCat = data => {
  const out = {};
  Object.entries(data).forEach(([id, link]) => {
    const key = (link.category || 'Uncategorized').trim();
    (out[key] ||= []).push({ ...link, id });
  });
  return out;
};

/* ── render ───────────────────────────────────────────────── */
function render(uid){
  onValue(dbRef(db, `users/${uid}/links`), snap => {
    const data = snap.val();
    const list = $list();
    list.innerHTML = '';

    if (!data){
      list.innerHTML = "<p class='empty'>No links yet.</p>";
      return;
    }

    for (const [cat, links] of Object.entries(groupByCat(data))){

      /* wrapper keeps title & its grid together */
      const section = document.createElement('div');
      section.className = 'category-section';

      /* centered title row */
      const header = document.createElement('div');
      header.className = 'category-title';
      header.innerHTML = `
        <h2>${cat}</h2>
        <div class="cat-actions">
          <button class="ghost edit"   data-cat="${cat}">✏️</button>
          <button class="ghost delete" data-cat="${cat}">🗑️</button>
        </div>`;
      section.appendChild(header);

      /* two-column grid container */
      const grid = document.createElement('div');
      grid.className = 'category-links';
      section.appendChild(grid);

      /* rename / delete handlers */
      header.querySelector('.edit').onclick = () => {
        const name = prompt(`Rename "${cat}" to:`, cat);
        if (name && name !== cat)
          links.forEach(l => update(dbRef(db, `users/${uid}/links/${l.id}`), { category: name }));
      };
      header.querySelector('.delete').onclick = () => {
        if (confirm(`Delete "${cat}" and all its links?`))
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

/* ── interactions ─────────────────────────────────────────── */
function bind(uid){
  let openMenu = null;

  /* open link */
  $list().addEventListener('click', e => {
    const btn = e.target.closest('.link-main');
    if (btn && !e.target.classList.contains('menu-btn'))
      window.open(btn.dataset.url, '_blank', 'noopener,noreferrer');
  });

  /* toggle row menu */
  $list().addEventListener('click', e => {
    const trigger = e.target.closest('.menu-btn');
    if (!trigger) return;
    const menu = $(`#m-${trigger.dataset.id}`);
    if (openMenu && openMenu !== menu) openMenu.hidden = true;
    menu.hidden = !menu.hidden;
    openMenu = menu.hidden ? null : menu;
  });

  /* outside click closes menu */
  document.addEventListener('mousedown', e => {
    if (openMenu && !openMenu.contains(e.target))
      openMenu.hidden = true, openMenu = null;
  });

  /* delete / edit */
  $list().addEventListener('click', e => {
    const del = e.target.closest('.menu-delete');
    const edt = e.target.closest('.menu-edit');
    if (!del && !edt) return;
    const id = (del || edt).dataset.id;

    if (del) remove(dbRef(db, `users/${uid}/links/${id}`));

    if (edt){
      const row = $(`#m-${id}`).parentElement;
      const curTitle = row.querySelector('.title').textContent;
      const curUrl   = row.querySelector('.preview').textContent;
      const curCat   = row.parentElement.parentElement.querySelector('h2').textContent;
      update(dbRef(db, `users/${uid}/links/${id}`), {
        title:    prompt('Title:',    curTitle) ?? curTitle,
        url:      prompt('URL:',      curUrl)   ?? curUrl,
        category: prompt('Category:', curCat)   ?? curCat
      });
    }
    if (openMenu) openMenu.hidden = true, openMenu = null;
  });
}

/* ── add-link form ────────────────────────────────────────── */
function addForm(uid){
  const f = $('#add-link-form'); if (!f) return;
  f.onsubmit = e => {
    e.preventDefault();
    const title = $('#link-title').value.trim();
    const url   = $('#link-url').value.trim();
    const cat   = $('#link-category').value.trim() || 'Uncategorized';
    if (!title || !url) return;
    set(push(dbRef(db, `users/${uid}/links`)), { title, url, category: cat });
    f.reset();
  };
}

/* ── boot ─────────────────────────────────────────────────── */
onUserReady(user => {
  addForm(user.uid);
  render(user.uid);
  bind(user.uid);
});