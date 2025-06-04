/* links.js – grid-or-list links manager */
import { db, onUserReady } from './profile.js';
import {
  ref as dbRef,
  push, set, remove, update, onValue
} from "https://www.gstatic.com/firebasejs/11.8.1/firebase-database.js";


/* ---------- helpers ---------- */
const q     = s => document.querySelector(s);
const $list = () => q('#links-list');

/* group by category */
const byCategory = data => {
  const out = {};
  Object.entries(data).forEach(([id, link]) => {
    const k = (link.category || 'Uncategorized').trim();
    if (!out[k]) out[k] = [];
    out[k].push({ ...link, id });
  });
  return out;
};

/* ---------- render ---------- */
function render(uid) {
  const linksRef = dbRef(db, `users/${uid}/links`);

  onValue(linksRef, snap => {
    const data = snap.val();
    const list = $list();
    list.innerHTML = '';

    if (!data) {
      list.innerHTML = "<p class='empty'>No links yet.</p>";
      return;
    }

    const grouped = byCategory(data);

    Object.entries(grouped).forEach(([cat, links]) => {
      /* --- category header --- */
      const header = document.createElement('div');
      header.className = 'category-title';
      header.innerHTML = `
        <h2>${cat}</h2>
        <div class="cat-actions">
          <button class="ghost edit"   aria-label="Rename" data-cat="${cat}">✏️</button>
          <button class="ghost delete" aria-label="Delete" data-cat="${cat}">🗑️</button>
        </div>`;
      list.appendChild(header);

      /* rename category */
      header.querySelector('.edit').onclick = () => {
        const name = prompt(`Rename "${cat}" to:`, cat);
        if (name && name !== cat) {
          links.forEach(l =>
            update(dbRef(db, `users/${uid}/links/${l.id}`), { category: name })
          );
        }
      };

      /* delete category */
      header.querySelector('.delete').onclick = () => {
        if (confirm(`Delete "${cat}" and all its links?`))
          links.forEach(l => remove(dbRef(db, `users/${uid}/links/${l.id}`)));
      };

      /* --- links in this category --- */
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
        list.appendChild(row);
      });
    });
  });
}


/* ---------- interactions ---------- */
function bindEvents(uid) {
  /* open link */
  $list().addEventListener('click', e => {
    const btn = e.target.closest('.link-main');
    if (!btn) return;
    const menuHit = e.target.classList.contains('menu-btn');
    if (!menuHit) window.open(btn.dataset.url, '_blank', 'noopener,noreferrer');
  });

  /* context menu toggle */
  let openMenu = null;
  $list().addEventListener('click', e => {
    const trigger = e.target.closest('.menu-btn');
    if (!trigger) return;

    e.stopPropagation();
    const id   = trigger.dataset.id;
    const menu = q(`#m-${id}`);

    if (openMenu && openMenu !== menu) openMenu.hidden = true;
    menu.hidden = !menu.hidden;
    openMenu    = menu.hidden ? null : menu;
  });

  /* outside click to close */
  document.addEventListener('mousedown', e => {
    if (openMenu && !openMenu.contains(e.target))
      openMenu.hidden = true, openMenu = null;
  });

  /* delete / edit from menu */
  $list().addEventListener('click', e => {
    const del = e.target.closest('.menu-delete');
    const edt = e.target.closest('.menu-edit');
    if (!del && !edt) return;
    const id = (del || edt).dataset.id;

    if (del) remove(dbRef(db, `users/${uid}/links/${id}`));

    if (edt) {
      const cur  = q(`#m-${id}`).querySelector('.preview').textContent;
      const data = {
        title: prompt('Title:', q(`[data-id="${id}"] .title`).textContent),
        url:   prompt('URL:', cur),
        category: prompt('Category:', q('#m-' + id).parentElement
                                   .previousSibling.querySelector('h2').textContent)
      };
      if (data.title && data.url)
        update(dbRef(db, `users/${uid}/links/${id}`), data);
    }

    if (openMenu) openMenu.hidden = true, openMenu = null;
  });
}


/* ---------- add-link form ---------- */
function addLink(uid) {
  const f = q('#add-link-form');
  if (!f) return;

  f.onsubmit = e => {
    e.preventDefault();
    const t = q('#link-title').value.trim();
    const u = q('#link-url').value.trim();
    const c = (q('#link-category').value.trim() || 'Uncategorized');
    if (!t || !u) return;

    const ref = push(dbRef(db, `users/${uid}/links`));
    set(ref, { title: t, url: u, category: c });
    f.reset();
  };
}


/* ---------- bootstrap ---------- */
onUserReady(user => {
  addLink(user.uid);
  render(user.uid);
  bindEvents(user.uid);
});