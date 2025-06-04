/* links.js – sidebar renderer, loads from top-level /links (June 2025) */

/* ─── 0. Firebase bootstrap ───────────────────────────────────────── */
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
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js";
import {
  getDatabase, ref as dbRef, get,
  push, set, remove, update, onValue
} from "https://www.gstatic.com/firebasejs/11.8.1/firebase-database.js";

initializeApp(firebaseConfig);
const auth = getAuth();
const db   = getDatabase();

/* ─── 1. DOM refs ─────────────────────────────────────────────────── */
const $  = s=>document.querySelector(s);
const navBox = $('#nav-links');          // sidebar container
const addSel = $('#link-category');
const addInp = $('#new-cat-input');

/* modal */
const overlay = $('#edit-overlay');
const dlg     = $('#edit-dialog');
const eTitle  = $('#edit-title');
const eURL    = $('#edit-url');
const eCat    = $('#edit-cat');
const eNewCat = $('#edit-new-cat');
$('#edit-cancel').onclick = ()=>hideModal();

let categories = new Set();

/* ─── 2. helper fns ──────────────────────────────────────────────── */
const groupByCat = obj=>{
  const out={};
  Object.entries(obj).forEach(([id,l])=>{
    const k=(l.category||'Uncategorized').trim();
    (out[k] ||= []).push({...l,id});
  });
  return out;
};
const refreshPicker = ()=>{
  const opts=[...categories].sort().map(c=>`<option>${c}</option>`).join('')
           +'<option value="__new__">➕ New…</option>';
  addSel.innerHTML = opts;
  eCat.innerHTML   = opts;
};
const showModal = ()=>{overlay.classList.remove('hidden');document.body.classList.add('modal-open');};
const hideModal = ()=>{overlay.classList.add('hidden');document.body.classList.remove('modal-open');};

/* ─── 3. Add form behaviour ─────────────────────────────────────── */
addSel.onchange = ()=>{const newMode=addSel.value==='__new__';addInp.classList.toggle('hidden',!newMode);if(newMode)addInp.focus();};
$('#add-link-form').onsubmit = e=>{
  e.preventDefault();
  const title=$('#link-title').value.trim();
  const url  =$ ('#link-url').value.trim();
  let   cat  = addSel.value==='__new__' ? addInp.value.trim() : addSel.value.trim();
  if(!title||!url||!cat) return;
  set(push(dbRef(db,'links')), {title,url,category:cat});
  categories.add(cat); refreshPicker();
  e.target.reset(); addInp.classList.add('hidden');
};

/* ─── 4. Render everything in sidebar ───────────────────────────── */
function renderSidebar(data){
  navBox.innerHTML='';
  if(!Object.keys(data).length){navBox.innerHTML='<p class="empty">No links yet.</p>';return;}

  for(const [cat,links] of Object.entries(groupByCat(data))){
    /* header row */
    const head=document.createElement('div');
    head.className='category-title';
    head.innerHTML=`<h2>${cat}</h2>
      <div class="cat-actions">
        <button class="ghost edit">✏️</button>
        <button class="ghost delete">🗑️</button>
      </div>`;
    navBox.appendChild(head);

    head.querySelector('.edit').onclick = ()=>{
      const n=prompt('Rename to:',cat);
      if(n&&n!==cat)
        links.forEach(l=>update(dbRef(db,'links/'+l.id),{category:n}));
    };
    head.querySelector('.delete').onclick = ()=>{
      if(confirm(`Delete "${cat}" and its links?`))
        links.forEach(l=>remove(dbRef(db,'links/'+l.id)));
    };

    /* links stack */
    const group=document.createElement('div');
    group.className='nav-links-group';
    links.forEach(l=>{
      const row=document.createElement('div');
      row.className='link-row';
      row.innerHTML=`
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
    navBox.appendChild(group);
  }
}

/* ─── 5. Row interactions ──────────────────────────────────────── */
navBox.addEventListener('click',e=>{
  const main=e.target.closest('.link-main');
  if(main && !e.target.classList.contains('menu-btn'))
    window.open(main.dataset.url,'_blank','noopener,noreferrer');
});
let openMenu=null;
navBox.addEventListener('click',e=>{
  const trig=e.target.closest('.menu-btn'); if(!trig) return;
  const menu=$('#m-'+trig.dataset.id);
  if(openMenu&&openMenu!==menu) openMenu.hidden=true;
  menu.hidden=!menu.hidden; openMenu=menu.hidden?null:menu;
});
document.addEventListener('mousedown',e=>{
  if(openMenu&&!openMenu.contains(e.target)) openMenu.hidden=true,openMenu=null;
});
navBox.addEventListener('click',e=>{
  const del=e.target.closest('.menu-delete');
  const edt=e.target.closest('.menu-edit');
  if(!del && !edt) return;
  const id=(del||edt).dataset.id;
  if(del) remove(dbRef(db,'links/'+id));
  if(edt) get(dbRef(db,'links/'+id))
            .then(s=>s.exists() && openEdit(s.val(),id));
  if(openMenu) openMenu.hidden=true,openMenu=null;
});

/* ─── 6. Open modal for Edit ────────────────────────────────────── */
function openEdit(link,id){
  eTitle.value=link.title; eURL.value=link.url;
  refreshPicker(); eCat.value=link.category;
  eNewCat.classList.add('hidden');
  eCat.onchange=()=>{const n=eCat.value==='__new__';eNewCat.classList.toggle('hidden',!n);if(n)eNewCat.focus();};
  dlg.onsubmit=ev=>{
    ev.preventDefault();
    const cat=eCat.value==='__new__'?eNewCat.value.trim():eCat.value.trim();
    if(!cat){alert('Category required');return;}
    update(dbRef(db,'links/'+id),{title:eTitle.value.trim(),url:eURL.value.trim(),category:cat})
      .then(()=>{categories.add(cat);refreshPicker();hideModal();});
  };
  showModal();
}

/* ─── 7. Auth + DB listener ─────────────────────────────────────── */
onAuthStateChanged(auth, user=>{
  if(!user){window.location.href="../index.html";return;}
  /* listen on top-level /links for everyone; if you want per-user
     scope change both read & write paths to `users/${user.uid}/links` */
  onValue(dbRef(db,'links'), snap=>{
    const data=snap.val()||{};
    categories=new Set(Object.values(data).map(l=>(l.category||'Uncategorized').trim()));
    refreshPicker();
    renderSidebar(data);
  });
});