// --- Firebase Config ---
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

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js";
import { getDatabase, ref as dbRef, get, child, push, remove, set, onValue } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-database.js";

// --- MODULE: Config Status ---
function showConfigStatus(db, uid, element) {
  get(child(dbRef(db), `users/${uid}/profile`))
    .then(snap => {
      if (snap.exists()) {
        element.innerHTML = "<span style='color:#00ff88'>✅ Config Works</span>";
      } else {
        element.innerHTML = "<span style='color:orange'>⚠️ Config OK, but no user data found</span>";
      }
    })
    .catch(err => {
      element.innerHTML = "<span style='color:#ff4d4d'>❌ Config Error: " + err.message + "</span>";
    });
}

// --- MODULE: User Info ---
function showUserInfo(db, user, element) {
  get(child(dbRef(db), `users/${user.uid}/profile`)).then(snap => {
    const profile = snap.exists() ? snap.val() : {};
    element.innerHTML = `
      <div style="margin-bottom:0.7em;">
        <strong>Username:</strong> ${profile.username || "N/A"}<br>
        <strong>Email:</strong> ${user.email}
      </div>
    `;
  }).catch(() => {
    element.innerHTML = `<div><strong>Email:</strong> ${user.email}</div>`;
  });
}

// --- MODULE: Logout Button ---
function setupLogoutButton(auth, button) {
  button.onclick = () => signOut(auth).then(() => window.location.href = "index.html");
}

// --- MODULE: Links Manager ---
function renderLinks(db, uid) {
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
      // Main link button
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

      // Open link on click of main button (not the ... menu)
      linkWrap.querySelector('.link-main-btn').onclick = e => {
        if (e.target.classList.contains('more-menu-btn')) return;
        window.open(link.url, '_blank', 'noopener,noreferrer');
      };

      // Menu toggle
      const moreMenuBtn = linkWrap.querySelector('.more-menu-btn');
      const moreMenu = linkWrap.querySelector('.more-menu');
      let menuOpen = false;
      moreMenuBtn.onclick = e => {
        e.stopPropagation();
        menuOpen = !menuOpen;
        moreMenu.style.display = menuOpen ? 'block' : 'none';
        if (menuOpen) {
          // Hide any other open menus
          document.querySelectorAll('.more-menu').forEach(menu => {
            if (menu !== moreMenu) menu.style.display = 'none';
          });
        }
      };

      // Hide menu when clicking outside
      document.addEventListener('mousedown', function hideMenu(evt) {
        if (menuOpen && moreMenu && !moreMenu.contains(evt.target) && evt.target !== moreMenuBtn) {
          moreMenu.style.display = 'none';
          menuOpen = false;
          document.removeEventListener('mousedown', hideMenu);
        }
      });

      // Delete handler
      linkWrap.querySelector('.delete-link-btn').onclick = e => {
        e.stopPropagation();
        remove(dbRef(db, `users/${uid}/links/${linkId}`));
      };
    });
  });
}

function setupAddLink(db, uid) {
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

// --- APP INIT ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

const configStatus = document.getElementById('config-status');
const userInfo = document.getElementById('user-info');
const logoutBtn = document.getElementById('logout-btn');

// Profile dropdown toggle logic
const profileToggleBtn = document.getElementById('profile-toggle-btn');
const profileCard = document.getElementById('profile-card');
let profileVisible = false;

function hideProfileCardOnClickOutside(event) {
  if (
    profileCard &&
    !profileCard.contains(event.target) &&
    !profileToggleBtn.contains(event.target)
  ) {
    profileCard.style.display = "none";
    profileVisible = false;
    profileToggleBtn.textContent = "Profile";
    document.removeEventListener('mousedown', hideProfileCardOnClickOutside);
  }
}

if (profileToggleBtn && profileCard) {
  profileToggleBtn.onclick = () => {
    profileVisible = !profileVisible;
    profileCard.style.display = profileVisible ? "block" : "none";
    profileToggleBtn.textContent = profileVisible ? "Close Profile" : "Profile";
    if (profileVisible) {
      document.addEventListener('mousedown', hideProfileCardOnClickOutside);
    } else {
      document.removeEventListener('mousedown', hideProfileCardOnClickOutside);
    }
  };
}

onAuthStateChanged(auth, user => {
  if (user) {
    showConfigStatus(db, user.uid, configStatus);
    showUserInfo(db, user, userInfo);
    setupLogoutButton(auth, logoutBtn);
    setupAddLink(db, user.uid);
    renderLinks(db, user.uid);
  } else {
    window.location.href = "index.html";
  }
});