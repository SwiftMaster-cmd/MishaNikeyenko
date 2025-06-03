import { db, onUserReady } from './profile.js';
import { ref as dbRef, push, set, remove, onValue } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-database.js";

// --- MODULE: Links Manager ---
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
    Object.entries(data).forEach(([linkId, link]) => {
      const linkWrap = document.createElement('div');
      linkWrap.className = "link-row";
      linkWrap.innerHTML = `
        <button class="link-main-btn" data-id="${linkId}">
          <span class="link-title">${link.title}</span>
          <span class="more-menu-btn" tabindex="0" data-id="${linkId}">&#8942;</span>
        </button>
        <div class="more-menu" id="menu-${linkId}" style="display:none;">
          <div class="more-menu-content">
            <button class="delete-link-btn" data-id="${linkId}">Delete</button>
            <div class="link-url-preview">${link.url}</div>
          </div>
        </div>
      `;
      linksList.appendChild(linkWrap);

      linkWrap.querySelector('.link-main-btn').onclick = e => {
        if (e.target.classList.contains('more-menu-btn')) return;
        window.open(link.url, '_blank', 'noopener,noreferrer');
      };
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
      linkWrap.querySelector('.delete-link-btn').onclick = e => {
        e.stopPropagation();
        remove(dbRef(db, `users/${uid}/links/${linkId}`));
      };
    });
  });
}

function setupAddLink(uid) {
  const form = document.getElementById('add-link-form');
  if (!form) return;
  form.onsubmit = function(e) {
    e.preventDefault();
    const title = document.getElementById('link-title').value.trim();
    const url = document.getElementById('link-url').value.trim();
    if (!title || !url) return;
    const newLinkRef = push(dbRef(db, `users/${uid}/links`));
    set(newLinkRef, { title, url });
    form.reset();
  };
}

// --- On Auth Ready, setup links
onUserReady(user => {
  setupAddLink(user.uid);
  renderLinks(user.uid);
});