/* /JS/links.js -- self-contained (no local imports, 2025-06-03) */

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
import { initializeApp }            from "https://www.gstatic.com/firebasejs/11.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js";
import {
  getDatabase, ref as dbRef,
  push, set, remove, update, onValue
} from "https://www.gstatic.com/firebasejs/11.8.1/firebase-database.js";

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getDatabase(app);

/* auth helper */
function onUserReady(cb){
  onAuthStateChanged(auth, user =>{
    if (user) cb(user);
    else      window.location.href = "../index.html";
  });
}

/* ── DOM helpers ───────────────────────────────────────────── */
const $     = s => document.querySelector(s);
const $list = () => $('#links-list');

const byCat = data => {
  const out={};
  Object.entries(data).forEach(([id,l])=>{
    const k=(l.category||'Uncategorized').trim();
    (out[k] ||= []).push({...l,id});
  });
  return out;
};

/* ── render ───────────────────────────────────────────────── */
function render(uid){
  onValue(dbRef(db,`users/${uid}/links`),snap=>{
    const data=snap.val(); const list=$list(); list.innerHTML='';
    if(!data){list.innerHTML="<p class='empty'>No links yet.</p>";return;}

    Object.entries(byCat(data)).forEach(([cat,links])=>{
      /* category header */
      const h=document.createElement('div');
      h.className='category-title';
      h.innerHTML=`
        <h2>${cat}</h2>
        <div class="cat-actions">
          <button class="ghost edit"   data-cat="${cat}">✏️</button>
          <button class="ghost delete" data-cat="${cat}">🗑️</button>
        </div>`;
      list.appendChild(h);

      h.querySelector('.edit').onclick = () =>{
        const n=prompt(`Rename "${cat}" to:`,cat);
        if(n&&n!==cat) links.forEach(l=>update(dbRef(db,`users/${uid}/links/${l.id}`),{category:n}));
      };
      h.querySelector('.delete').onclick = () =>{
        if(confirm(`Delete "${cat}" and all its links?`))
          links.forEach(l=>remove(dbRef(db,`users/${uid}/links/${l.id}`)));
      };

      /* links */
      links.forEach(link=>{
        const r=document.createElement('div');
        r.className='link-row';
        r.innerHTML=`
          <button class="link-main" data-url="${link.url}">
            <span class="title">${link.title}</span>
            <span class="menu-btn" data-id="${link.id}" tabindex="0">⋮</span>
          </button>
          <div class="menu" id="m-${link.id}" hidden>
            <button class="menu-edit"   data-id="${link.id}">Edit</button>
            <button class="menu-delete" data-id="${link.id}">Delete</button>
            <div class="preview">${link.url}</div>
          </div>`;
        list.appendChild(r);
      });
    });
  });
}

/* ── interactions ─────────────────────────────────────────── */
function bind(uid){
  let openMenu=null;

  $list().addEventListener('click',e=>{
    const btn=e.target.closest('.link-main');
    if(btn&&!e.target.classList.contains('menu-btn'))
      window.open(btn.dataset.url,'_blank','noopener,noreferrer');
  });

  $list().addEventListener('click',e=>{
    const trg=e.target.closest('.menu-btn'); if(!trg)return;
    e.stopPropagation();
    const m=$(`#m-${trg.dataset.id}`);
    if(openMenu&&openMenu!==m) openMenu.hidden=true;
    m.hidden=!m.hidden; openMenu=m.hidden?null:m;
  });

  document.addEventListener('mousedown',e=>{
    if(openMenu&&!openMenu.contains(e.target)) openMenu.hidden=true,openMenu=null;
  });

  $list().addEventListener('click',e=>{
    const del=e.target.closest('.menu-delete');
    const edt=e.target.closest('.menu-edit');
    if(!del&&!edt)return;
    const id=(del||edt).dataset.id;

    if(del) remove(dbRef(db,`users/${uid}/links/${id}`));

    if(edt){
      const row=$(`#m-${id}`).parentElement;
      const t=row.querySelector('.title').textContent;
      const u=row.querySelector('.preview').textContent;
      const c=row.previousSibling.querySelector('h2').textContent;
      update(dbRef(db,`users/${uid}/links/${id}`),{
        title:prompt('Title:',t)||t,
        url:prompt('URL:',u)||u,
        category:prompt('Category:',c)||c
      });
    }
    if(openMenu) openMenu.hidden=true,openMenu=null;
  });
}

/* ── add-link form ─────────────────────────────────────────── */
function addForm(uid){
  const f=$('#add-link-form'); if(!f)return;
  f.onsubmit=e=>{
    e.preventDefault();
    const title=$('#link-title').value.trim();
    const url  =$('#link-url').value.trim();
    const cat  =$('#link-category').value.trim()||'Uncategorized';
    if(!title||!url)return;
    set(push(dbRef(db,`users/${uid}/links`)),{title,url,category:cat});
    f.reset();
  };
}

/* ── boot ─────────────────────────────────────────────────── */
onUserReady(user=>{
  addForm(user.uid);
  render(user.uid);
  bind(user.uid);
});