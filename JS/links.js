/* links.js – sidebar renderer (June 2025) */

//////////////////// 0 · Firebase ////////////////////
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
import { initializeApp }               from "https://www.gstatic.com/firebasejs/11.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js";
import {
  getDatabase, ref as dbRef, get,
  push, set, remove, update, onValue
} from "https://www.gstatic.com/firebasejs/11.8.1/firebase-database.js";

initializeApp(firebaseConfig);
const auth = getAuth();
const db   = getDatabase();

//////////////////// 1 · DOM refs ////////////////////
const $ = s => document.querySelector(s);

const navLinks = document.getElementById('nav-links'); // ← sidebar container
if (!navLinks){
  console.error('❌ #nav-links not found – sidebar cannot render.');
  throw new Error('#nav-links missing');
}

/* add-form */
const catSel  = $('#link-category');
const newBox  = $('#new-cat-input');

/* modal */
const overlay = $('#edit-overlay');
const dlg     = $('#edit-dialog');
const eTitle  = $('#edit-title');
const eURL    = $('#edit-url');
const eCat    = $('#edit-cat');
const eNewCat = $('#edit-new-cat');
$('#edit-cancel').onclick = () => hideModal();

let uid;
let categories = new Set();

//////////////////// 2 · helpers ////////////////////
const groupByCat = obj=>{
  const out={};
  Object.entries(obj).forEach(([id,l])=>{
    const k=(l.category||'Uncategorized').trim();
    (out[k] ||= []).push({...l,id});
  });
  return out;
};
const refreshPickers = ()=>{
  const opts=[...categories].sort().map(c=>`<option>${c}</option>`).join('')
           +'<option value="__new__">➕ New…</option>';
  catSel.innerHTML = opts;
  eCat .innerHTML  = opts;
};
const showModal = ()=>{overlay.classList.remove('hidden');document.body.classList.add('modal-open');};
const hideModal = ()=>{overlay.classList.add('hidden');document.body.classList.remove('modal-open');};

//////////////////// 3 · Add form ////////////////////
catSel.onchange = ()=>{
  const newMode = catSel.value==='__new__';
  newBox.classList.toggle('hidden',!newMode);
  if(newMode) newBox.focus();
};
$('#add-link-form').onsubmit = e=>{
  e.preventDefault();
  const title=$('#link-title').value.trim();
  const url  =$ ('#link-url').value.trim();
  let   cat  =catSel.value==='__new__'?newBox.value.trim():catSel.value.trim();
  if(!title||!url||!cat) return;
  set(push(dbRef(db,`users/${uid}/links`)),{title,url,category:cat});
  categories.add(cat); refreshPickers();
  e.target.reset(); newBox.classList.add('hidden');
};

//////////////////// 4 · Edit modal ////////////////////
function openEdit(link,id){
  eTitle.value=link.title; eURL.value=link.url;
  refreshPickers(); eCat.value=link.category;
  eNewCat.classList.add('hidden'); eNewCat.value='';

  eCat.onchange=()=>{
    const n=eCat.value==='__new__';
    eNewCat.classList.toggle('hidden',!n);
    if(n) eNewCat.focus();
  };

  dlg.onsubmit=ev=>{
    ev.preventDefault();
    const cat=eCat.value==='__new__'?eNewCat.value.trim():eCat.value.trim();
    if(!cat){alert('Category required');return;}
    update(dbRef(db,`users/${uid}/links/${id}`),{title:eTitle.value.trim(),url:eURL.value.trim(),category:cat})
      .then(()=>{categories.add(cat);refreshPickers();hideModal();});
  };
  showModal();
}

//////////////////// 5 · Render to sidebar ////////////////////
function render(data){
  navLinks.innerHTML='';
  if(!Object.keys(data).length){
    navLinks.innerHTML='<p class="empty">No links yet.</p>';
    return;
  }

  for(const [cat,links] of Object.entries(groupByCat(data))){
    /* header */
    const head=document.createElement('div');
    head.className='category-title';
    head.innerHTML=`<h2>${cat}</h2>
      <div class="cat-actions">
        <button class="ghost edit">✏️</button>
        <button class="ghost delete">🗑️</button>
      </div>`;
    navLinks.appendChild(head);

    head.querySelector('.edit').onclick = () =>{
      const n=prompt('Rename to:',cat);
      if(n&&n!==cat) links.forEach(l=>update(dbRef(db,`users/${uid}/links/${l.id}`),{category:n}));
    };
    head.querySelector('.delete').onclick = () =>{
      if(confirm(`Delete "${cat}" and its links?`))
        links.forEach(l=>remove(dbRef(db,`users/${uid}/links/${l.id}`)));
    };

    /* vertical list under this category */
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
    navLinks.appendChild(group);
  }
}

//////////////////// 6 · Row interactions ////////////////////
let openMenu=null;
navLinks.addEventListener('click',e=>{
  const main=e.target.closest('.link-main');
  if(main && !e.target.classList.contains('menu-btn'))
    window.open(main.dataset.url,'_blank','noopener,noreferrer');
});
navLinks.addEventListener('click',e=>{
  const trig=e.target.closest('.menu-btn'); if(!trig) return;
  const menu=document.getElementById('m-'+trig.dataset.id);
  if(openMenu&&openMenu!==menu) openMenu.hidden=true;
  menu.hidden=!menu.hidden; openMenu=menu.hidden?null:menu;
});
document.addEventListener('mousedown',e=>{
  if(openMenu&&!openMenu.contains(e.target)) openMenu.hidden=true,openMenu=null;
});
navLinks.addEventListener('click',e=>{
  const del=e.target.closest('.menu-delete');
  const edt=e.target.closest('.menu-edit');
  if(!del && !edt) return;
  const id=(del||edt).dataset.id;
  if(del) remove(dbRef(db,`users/${uid}/links/${id}`));
  if(edt) get(dbRef(db,`users/${uid}/links/${id}`))
            .then(snap=>snap.exists() && openEdit(snap.val(),id));
  if(openMenu) openMenu.hidden=true,openMenu=null;
});

//////////////////// 7 · Auth + DB listener ////////////////////
onAuthStateChanged(auth,user=>{
  if(!user){window.location.href="../index.html";return;}
  uid=user.uid;

  onValue(dbRef(db,`users/${uid}/links`), snap=>{
    const data=snap.val()||{};
    categories=new Set(Object.values(data).map(l=>(l.category||'Uncategorized').trim()));
    refreshPickers();
    render(data);
  });
});