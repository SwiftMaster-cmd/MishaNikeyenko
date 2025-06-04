/* /JS/links.js – Sidebar list version (June 2025) */

const firebaseConfig = {
  apiKey:            "AIzaSyCf_se10RUg8i_u8pdowHlQvrFViJ4jh_Q",
  authDomain:        "mishanikeyenko.firebaseapp.com",
  databaseURL:       "https://mishanikeyenko-default-rtdb.firebaseio.com",
  projectId:         "mishanikeyenko",
  storageBucket:     "mishanikeyenko.firebasestorage.app",
  messagingSenderId: "1089190937368",
  appId:             "1:1089190937368:web:959c825fc596a5e3ae946d",
  measurementId:     "G-L6CC27129C"
};

/* links.js -- sidebar list-view with collapsible categories (Jun-2025) */

//////////////// 0 · Firebase //////////////////


import { initializeApp }                       from "https://www.gstatic.com/firebasejs/11.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged }         from "https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js";
import { getDatabase, ref as dbRef, get,
         push, set, remove, update, onValue }  from "https://www.gstatic.com/firebasejs/11.8.1/firebase-database.js";

initializeApp(firebaseConfig);
const auth = getAuth();           // default app
const db   = getDatabase();

//////////////// 1 · DOM refs //////////////////
const $ = s=>document.querySelector(s);
const navBox = $('#nav-links');              // sidebar injection point

/* add-form */
const catSel = $('#link-category');
const newInp = $('#new-cat-input');

/* modal */
const overlay = $('#edit-overlay');
const dlg     = $('#edit-dialog');
const eTtl    = $('#edit-title');
const eURL    = $('#edit-url');
const eCat    = $('#edit-cat');
const eNewCat = $('#edit-new-cat');
$('#edit-cancel').onclick = hideModal;

let uid, categories = new Set();

//////////////// 2 · helpers //////////////////
const grp = obj=>{
  const o={};
  Object.entries(obj).forEach(([id,l])=>{
    const k=(l.category||'Uncategorized').trim();
    (o[k] ||= []).push({...l,id});
  });
  return o;
};
const refreshPicker=()=>{
  const opts=[...categories].sort().map(c=>`<option>${c}</option>`).join('')
           +'<option value="__new__">➕ New…</option>';
  catSel.innerHTML=opts; eCat.innerHTML=opts;
};
const showModal=()=>{overlay.classList.remove('hidden');document.body.classList.add('modal-open');};
const hideModal=()=>{overlay.classList.add('hidden');document.body.classList.remove('modal-open');};

//////////////// 3 · Add bookmark //////////////////
catSel.onchange = ()=>{const n=catSel.value==='__new__';newInp.classList.toggle('hidden',!n);if(n)newInp.focus();};
$('#add-link-form').onsubmit = e=>{
  e.preventDefault();
  const title=$('#link-title').value.trim();
  const url  =$ ('#link-url').value.trim();
  let cat = catSel.value==='__new__' ? newInp.value.trim() : catSel.value.trim();
  if(!title||!url||!cat) return;
  set(push(dbRef(db,`users/${uid}/links`)),{title,url,category:cat});
  categories.add(cat); refreshPicker();
  e.target.reset(); newInp.classList.add('hidden');
};

//////////////// 4 · Edit modal //////////////////
function openEdit(link,id){
  eTtl.value=link.title; eURL.value=link.url;
  refreshPicker(); eCat.value=link.category;
  eNewCat.classList.add('hidden'); eNewCat.value='';

  eCat.onchange=()=>{const n=eCat.value==='__new__';eNewCat.classList.toggle('hidden',!n);if(n)eNewCat.focus();};

  dlg.onsubmit=ev=>{
    ev.preventDefault();
    const cat=eCat.value==='__new__'?eNewCat.value.trim():eCat.value.trim();
    if(!cat){alert('Category required');return;}
    update(dbRef(db,`users/${uid}/links/${id}`),{title:eTtl.value.trim(),url:eURL.value.trim(),category:cat})
      .then(()=>{categories.add(cat);refreshPicker();hideModal();});
  };
  showModal();
}

//////////////// 5 · Render sidebar //////////////////
function render(data){
  navBox.innerHTML='';
  if(!Object.keys(data).length){navBox.innerHTML='<p class="empty">No links yet.</p>';return;}

  for(const [cat,links] of Object.entries(grp(data))){
    /* header */
    const head=document.createElement('div');
    head.className='category-title';
    head.innerHTML = `
      <button class="cat-toggle" aria-expanded="true">▶</button>
      <h2 class="cat-name">${cat}</h2>
      <div class="cat-actions">
        <button class="ghost edit">✏️</button>
        <button class="ghost delete">🗑️</button>
      </div>`;
    navBox.appendChild(head);

    /* link stack */
    const stack=document.createElement('div');
    stack.className='nav-links-group';
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
      stack.appendChild(row);
    });
    navBox.appendChild(stack);

    /* collapse behaviour */
    const toggle=head.querySelector('.cat-toggle');
    toggle.onclick = ()=>{
      const open = toggle.getAttribute('aria-expanded')==='true';
      toggle.setAttribute('aria-expanded', String(!open));
      stack.hidden = open;
    };

    /* rename / delete */
    head.querySelector('.edit').onclick = ()=>{
      const n=prompt('Rename to:',cat);
      if(n&&n!==cat) links.forEach(l=>update(dbRef(db,`users/${uid}/links/${l.id}`),{category:n}));
    };
    head.querySelector('.delete').onclick = ()=>{
      if(confirm(`Delete "${cat}" and its links?`))
        links.forEach(l=>remove(dbRef(db,`users/${uid}/links/${l.id}`)));
    };
  }
}

//////////////// 6 · Row interactions //////////////////
let openMenu=null;
navBox.addEventListener('click',e=>{
  const main=e.target.closest('.link-main');
  if(main && !e.target.classList.contains('menu-btn'))
    window.open(main.dataset.url,'_blank','noopener,noreferrer');
});
navBox.addEventListener('click',e=>{
  const trg=e.target.closest('.menu-btn'); if(!trg) return;
  const menu=$('#m-'+trg.dataset.id);
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
  if(del) remove(dbRef(db,`users/${uid}/links/${id}`));
  if(edt) get(dbRef(db,`users/${uid}/links/${id}`))
            .then(s=>s.exists() && openEdit(s.val(),id));
  if(openMenu) openMenu.hidden=true,openMenu=null;
});

//////////////// 7 · Auth & data stream //////////////////
onAuthStateChanged(auth,user=>{
  if(!user){window.location.href="../index.html";return;}
  uid=user.uid;
  onValue(dbRef(db,`users/${uid}/links`), snap=>{
    const data=snap.val()||{};
    categories=new Set(Object.values(data).map(l=>(l.category||'Uncategorized').trim()));
    refreshPicker();
    render(data);
  });
});