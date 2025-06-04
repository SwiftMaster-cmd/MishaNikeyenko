/* /JS/links.js – fully-self-contained link manager (2025-06-03) */

import { db, onUserReady } from './profile.js';
import {
  ref as dbRef,
  push, set, remove, update, onValue
} from "https://www.gstatic.com/firebasejs/11.8.1/firebase-database.js";

/* ───────────────────────── helpers ───────────────────────── */
const $      = sel => document.querySelector(sel);
const $list  = ()  => $('#links-list');

const groupByCat = data => {
  const out = {};
  Object.entries(data).forEach(([id, link]) => {
    const k = (link.category || 'Uncategorized').trim();
    (out[k] ||= []).push({ ...link, id });
  });
  return out;
};

/* ───────────────────────── render ───────────────────────── */
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

    Object.entries(groupByCat(data)).forEach(([cat, links]) => {
      /* ╭─ category header */
      const header = document.createElement('div');
      header.className = 'category-title';
      header.innerHTML = `
        <h2>${cat}</h2>
        <div class="cat-actions">
          <button class="ghost edit" data-cat="${cat}" aria-label="Rename">✏️</button>
          <button class="ghost delete" data-cat="${cat}" aria-label="Delete">🗑️</button>
        </div>`;
      list.appendChild(header);

      /* rename */
      header.querySelector('.edit').onclick = () => {
        const name = prompt(`Rename "${cat}" to:`, cat);
        if (name && name !== cat)
          links.forEach(l => update(dbRef(db, `users/${uid}/links/${l.id}`), { category: name }));
      };

      /* delete */
      header.querySelector('.delete').onclick = () => {
        if (confirm(`Delete "${cat}" and all its links?`))
          links.forEach(l => remove(dbRef(db, `users/${uid}/links/${l.id}`)));
      };

      /* ╭─ links */
      links.forEach(link => {
        const row = document.createElement('div');
        row.className = 'link-row';
        row.innerHTML = `
          <button class="link-main" data-url="${link.url}">
            <span class="title">${link.title}</span>
            <span class="menu-btn" data-id="${link.id}" tabindex="0">⋮</span>
          </button>
          <div class="menu" id="menu-${link.id}" hidden>
            <button class="menu-edit"   data-id="${link.id}">Edit</button>
            <button class="menu-delete" data-id="${link.id}">Delete</button>
            <div class="preview">${link.url}</div>
          </div>`;
        list.appendChild(row);
      });
    });
  });
}

/* ─────────────────────── interactions ────────────────────── */
function bindInteractions(uid) {
  let openMenu = null;

  /* open link */
  $list().addEventListener('click', e => {
    const btn = e.target.closest('.link-main');
    if (!btn) return;
    if (e.target.classList.contains('menu-btn')) return;
    window.open(btn.dataset.url, '_blank', 'noopener,noreferrer');
  });

  /* toggle context menu */
  $list().addEventListener('click', e => {
    const trigger = e.target.closest('.menu-btn');
    if (!trigger) return;

    e.stopPropagation();
    const menu = $(`#menu-${trigger.dataset.id}`);
    if (openMenu && openMenu !== menu) openMenu.hidden = true;
    menu.hidden = !menu.hidden;
    openMenu = menu.hidden ? null : menu;
  });

  /* outside click to close */
  document.addEventListener('mousedown', e => {
    if (openMenu && !openMenu.contains(e.target)) openMenu.hidden = true, openMenu = null;
  });

  /* menu actions */
  $list().addEventListener('click', e => {
    const del = e.target.closest('.menu-delete');
    const edt = e.target.closest('.menu-edit');
    if (!del && !edt) return;
    const id = (del || edt).dataset.id;

    if (del) remove(dbRef(db, `users/${uid}/links/${id}`));

    if (edt) {
      const row   = $(`[data-id="${id}"]`).closest('.link-row');
      const title = row.querySelector('.title').textContent;
      const url   = row.querySelector('.preview').textContent;
      const cat   = row.previousSibling.querySelector('h2').textContent;
      const newData = {
        title: prompt('Title:', title) ?? title,
        url:   prompt('URL:',   url)   ?? url,
        category: prompt('Category:', cat) ?? cat
      };
      update(dbRef(db, `users/${uid}/links/${id}`), newData);
    }

    if (openMenu) openMenu.hidden = true, openMenu = null;
  });
}

/* ────────────────────── add-link form ────────────────────── */
function setupAddForm(uid) {
  const form = $('#add-link-form');
  if (!form) return;

  form.onsubmit = e => {
    e.preventDefault();
    const title = $('#link-title').value.trim();
    const url   = $('#link-url').value.trim();
    const cat   = $('#link-category').value.trim() || 'Uncategorized';
    if (!title || !url) return;

    set(push(dbRef(db, `users/${uid}/links`)), { title, url, category: cat });
    form.reset();
  };
}

/* ───────────────────────── boot ───────────────────────── */
onUserReady(user => {
  setupAddForm(user.uid);
  render(user.uid);
  bindInteractions(user.uid);
});