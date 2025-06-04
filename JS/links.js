import { db, onUserReady } from './profile.js';
import {
  ref as dbRef,
  push,
  set,
  remove,
  update,
  onValue
} from "https://www.gstatic.com/firebasejs/11.8.1/firebase-database.js";

// --- Helper: Group links by category ---
function groupLinksByCategory(data) {
  const grouped = {};
  Object.entries(data).forEach(([id, link]) => {
    const cat = (link.category || "Uncategorized").trim();
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push({ ...link, id });
  });
  return grouped;
}

// --- Render all links, grouped by category ---
function renderLinks(uid) {
  const linksList = document.getElementById('links-list');
  const linksRef = dbRef(db, `users/${uid}/links`);
  onValue(linksRef, snapshot => {
    linksList.innerHTML = "";
    const data = snapshot.val();
    if (!data) {
      linksList.innerHTML = "<p style='opacity:.6'>No links yet.</p>";
      return;
    }
    const grouped = groupLinksByCategory(data);
    Object.entries(grouped).forEach(([cat, links]) => {
      // Category title with edit button
      const catTitle = document.createElement('div');
      catTitle.className = "category-title";
      catTitle.innerHTML = `<span>${cat}</span> <button class="edit-cat-btn" data-category="${cat}">&#9998;</button>`;
      linksList.appendChild(catTitle);

      links.forEach(link => {
        const linkWrap = document.createElement('div');
        linkWrap.className = "link-row";
        linkWrap.innerHTML = `
          <button class="link-main-btn" data-id="${link.id}">
            <span class="link-title">${link.title}</span>
            <span class="more-menu-btn" tabindex="0" data-id="${link.id}">&#8942;</span>
          </button>
          <div class="more-menu" id="menu-${link.id}" style="display:none;">
            <div class="more-menu-content">
              <button class="delete-link-btn" data-id="${link.id}">Delete</button>
              <button class="edit-link-btn" data-id="${link.id}">Edit</button>
              <div class="link-url-preview">${link.url}</div>
              <div class="link-cat-preview">Category: ${cat}</div>
            </div>
          </div>
        `;
        linksList.appendChild(linkWrap);

        // Link open
        linkWrap.querySelector('.link-main-btn').onclick = e => {
          if (e.target.classList.contains('more-menu-btn')) return;
          window.open(link.url, '_blank', 'noopener,noreferrer');
        };

        // More menu
        const moreMenuBtn = linkWrap.querySelector('.more-menu-btn');
        const moreMenu = linkWrap.querySelector('.more-menu');
        let menuOpen = false;
        moreMenuBtn.onclick = e => {
          e.stopPropagation();
          menuOpen = !menuOpen;
          moreMenu.style.display = menuOpen ? 'block' : 'none';
          if (menuOpen) {
            document.querySelectorAll('.more-menu').forEach(menu => {
              if (menu !== moreMenu) menu.style.display = 'none';
            });
          }
        };
        document.addEventListener('mousedown', function hideMenu(evt) {
          if (menuOpen && moreMenu && !moreMenu.contains(evt.target) && evt.target !== moreMenuBtn) {
            moreMenu.style.display = 'none';
            menuOpen = false;
            document.removeEventListener('mousedown', hideMenu);
          }
        });

        // Delete link
        linkWrap.querySelector('.delete-link-btn').onclick = e => {
          e.stopPropagation();
          remove(dbRef(db, `users/${uid}/links/${link.id}`));
        };

        // Edit link/category (prompt-based)
        linkWrap.querySelector('.edit-link-btn').onclick = e => {
          e.stopPropagation();
          const newTitle = prompt("Edit title:", link.title);
          const newURL = prompt("Edit URL:", link.url);
          const newCat = prompt("Edit category:", cat);
          if (newTitle && newURL) {
            update(dbRef(db, `users/${uid}/links/${link.id}`), {
              title: newTitle,
              url: newURL,
              category: newCat
            });
          }
          moreMenu.style.display = 'none';
        };
      });

      // Edit all links in a category (rename)
      catTitle.querySelector('.edit-cat-btn').onclick = () => {
        const newCatName = prompt(`Rename category "${cat}" to:`, cat);
        if (newCatName && newCatName !== cat) {
          links.forEach(link => {
            update(dbRef(db, `users/${uid}/links/${link.id}`), {
              category: newCatName
            });
          });
        }
      };
    });
  });
}

// --- Link adding form ---
function setupAddLink(uid) {
  const form = document.getElementById('add-link-form');
  if (!form) return;
  form.onsubmit = function(e) {
    e.preventDefault();
    const title = document.getElementById('link-title').value.trim();
    const url = document.getElementById('link-url').value.trim();
    const category = (document.getElementById('link-category').value.trim() || "Uncategorized");
    if (!title || !url) return;
    const newLinkRef = push(dbRef(db, `users/${uid}/links`));
    set(newLinkRef, { title, url, category });
    form.reset();
  };
}

// --- Init ---
onUserReady(user => {
  setupAddLink(user.uid);
  renderLinks(user.uid);
});