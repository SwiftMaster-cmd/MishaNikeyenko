/* links.js – sidebar list view (rollback, Jun-2025) */

/* ── 0 · Firebase -------------------------------------------------- */
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

import { initializeApp }                       from "https://www.gstatic.com/firebasejs/11.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged }         from "https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js";
import {
  getDatabase, ref as dbRef, get,
  push, set, remove, update, onValue
} from "https://www.gstatic.com/firebasejs/11.8.1/firebase-database.js";

initializeApp(firebaseConfig);
const auth = getAuth();
const db   = getDatabase();

/* ── 1 · basic refs ------------------------------------------------ */
const $ = s=>document.querySelector(s);

const navBox  = $('#nav-links');             // sidebar target
const catSel  = $('#link-category');
const catNew  = $('#new-cat-input');

const overlay = $('#edit-overlay');
const dlg     = $('#edit-dialog');
const eTtl    = $('#edit-title');
const eURL    = $('#edit-url');
const eCat    = $('#edit-cat');
const eCatNew = $('#edit-new-cat');
$('#edit-cancel').onclick = hideModal;

let uid, categories = new Set();

/* ── 2 · small helpers --------------------------------------------- */
const byCat = obj=>{
  const out={};
  Object.entries(obj).forEach(([id,l])=>{
    const k=(l.category||'Uncategorized').trim();
    (out[k] ||= []).push({...l,id});
  });
  return out;
};
const refreshPicker=()=>{
  const opts=[...categories].sort().map(c=>`<option>${c}</option>`).join('')
           +'<option value="__new__">➕ New…</option>';
  catSel.innerHTML = opts;
  eCat .innerHTML  = opts;
};
const showModal=()=>{overlay.classList.remove('hidden');document.body.classList.add('modal-open');};
function hideModal(){overlay.classList.add('hidden');document.body.classList.remove('modal-open');}

/* ── 3 · add-bookmark form ---------------------------------------- */
catSel.onchange = ()=>{const n=catSel.value==='__new__';catNew.classList.toggle('hidden',!n);if(n)catNew.focus();};
$('#add-link-form').onsubmit = e=>{
  e.preventDefault();
  const title=$('#link-title').value.trim();
  const url  =$ ('#link-url').value.trim();
  let cat = catSel.value==='__new__' ? catNew.value.trim() : catSel.value.trim();
  if(!title||!url||!cat) return;
  set(push(dbRef(db,`users/${uid}/links`)), {title,url,category:cat});
  categories.add(cat); refreshPicker();
  e.target.reset(); catNew.classList.add('hidden');
};

/* ── 4 · open Edit modal ------------------------------------------ */
function openEdit(link,id){
  eTtl.value=link.title; eURL.value=link.url;
  refreshPicker(); eCat.value=link.category;
  eCatNew.classList.add('hidden'); eCatNew.value='';

  eCat.onchange=()=>{const n=eCat.value==='__new__';eCatNew.classList.toggle('hidden',!n);if(n)eCatNew.focus();};

  dlg.onsubmit = ev=>{
    ev.preventDefault();
    const cat=eCat.value==='__new__'?eCatNew.value.trim():eCat.value.trim();
    if(!cat){alert('Category required');return;}
    update(dbRef(db,`users/${uid}/links/${id}`),
      {title:eTtl.value.trim(),url:eURL.value.trim(),category:cat})
      .then(()=>{categories.add(cat);refreshPicker();hideModal();});
  };
  showModal();
}

/* ── 5 · sidebar rendering (no collapse) --------------------------- */
function render(data){
  navBox.innerHTML='';
  if(!Object.keys(data).length){
    navBox.innerHTML='<p class="empty">No links yet.</p>';
    return;
  }

  for(const [cat,links] of Object.entries(byCat(data))){
    /* header */
    const h=document.createElement('div');
    h.className='category-title';
    h.innerHTML=`
      <h2 class="cat-name">${cat}</h2>
      <div class="cat-actions">
        <button class="ghost edit">✏️</button>
        <button class="ghost delete">🗑️</button>
      </div>`;
    navBox.appendChild(h);

    /* rename / delete */
    h.querySelector('.edit').onclick = ()=>{
      const n=prompt('Rename to:',cat);
      if(n&&n!==cat) links.forEach(l=>update(dbRef(db,`users/${uid}/links/${l.id}`),{category:n}));
    };
    h.querySelector('.delete').onclick = ()=>{
      if(confirm(`Delete "${cat}" and its links?`))
        links.forEach(l=>remove(dbRef(db,`users/${uid}/links/${l.id}`)));
    };

    /* links list */
    const group=document.createElement('div');
    group.className='nav-links-group';
    links.forEach(l=>{
      const row=document.createElement('div'); row.className='link-row';
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

/* ── 6 · row interactions ----------------------------------------- */
let openMenu=null;
navBox.addEventListener('click',e=>{
  const main=e.target.closest('.link-main');
  if(main && !e.target.classList.contains('menu-btn'))
    window.open(main.dataset.url,'_blank','noopener,noreferrer');
});
navBox.addEventListener('click',e=>{
  const trg=e.target.closest('.menu-btn'); if(!trg) return;
  const m=document.getElementById('m-'+trg.dataset.id);
  if(openMenu&&openMenu!==m) openMenu.hidden=true;
  m.hidden=!m.hidden; openMenu=m.hidden?null:m;
});
document.addEventListener('mousedown',e=>{
  if(openMenu&&!openMenu.contains(e.target)) openMenu.hidden=true,openMenu=null;
});
navBox.addEventListener('click',e=>{
  const del=e.target.closest('.menu-delete');
  const edt=e.target.closest('.menu-edit');
  if(!del && !edt) return;
  const id=(del||edt).dataset.id;

  if(del) remove(dbRef(db,`users/${uid}/links/${id}`));
  if(edt) get(dbRef(db,`users/${uid}/links/${id}`))
            .then(snap=>snap.exists() && openEdit(snap.val(),id));
  if(openMenu) openMenu.hidden=true,openMenu=null;
});

/* ── 7 · auth + live stream --------------------------------------- */
onAuthStateChanged(auth,user=>{
  if(!user){window.location.href="../index.html";return;}
  uid=user.uid;

  const base=dbRef(db,`users/${uid}/links`);
  onValue(base, snap=>{
    const data=snap.val()||{};
    categories=new Set(Object.values(data).map(l=>(l.category||'Uncategorized').trim()));
    refreshPicker();
    render(data);
  });
});