/* /JS/links.js – modal-safe, pointer-safe, full config (2025-06-03) */

/*───────────────────────────────────────────────────*/
/* 0. Firebase config – DO NOT REMOVE               */
/*───────────────────────────────────────────────────*/
const firebaseConfig = {
  apiKey:            "AIzaSyCf_se10RUg8i_u8pdowHlQvrFViJ4jh_Q",
  authDomain:        "mishanikeyenko.firebaseapp.com",
  databaseURL:       "https://mishanikeyenko-default-rtdb.firebaseio.com",
  projectId:         "mishanikeyenko",
  storageBucket:     "mishanikeyenko-firebasestorage.app",
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

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getDatabase(app);

/*───────────────────────────────────────────────────*/
/* 1. DOM refs + globals                             */
/*───────────────────────────────────────────────────*/
const $     = sel => document.querySelector(sel);
const $list = ()  => $('#links-list');

let uid;
let categories = new Set();

/* add-form picker */
const addSel  = $('#link-category');
const addNew  = $('#new-cat-input');

/* edit modal */
const overlay = $('#edit-overlay');
const dlg     = $('#edit-dialog');
const eTitle  = $('#edit-title');
const eURL    = $('#edit-url');
const eCat    = $('#edit-cat');
const eNewCat = $('#edit-new-cat');
const btnX    = $('#edit-cancel');

/*───────────────────────────────────────────────────*/
/* 2. helpers                                        */
/*───────────────────────────────────────────────────*/
const groupByCat = data => {
  const out = {};
  Object.entries(data).forEach(([id,l])=>{
    const k=(l.category||'Uncategorized').trim();
    (out[k] ||= []).push({...l,id});
  });
  return out;
};

function refreshPickers(){
  const options = [...categories].sort()
    .map(c=>`<option value="${c}">${c}</option>`).join('')
    + '<option value="__new__">➕ New…</option>';
  addSel.innerHTML = options;
  eCat .innerHTML  = options;
  addSel.value = [...categories][0] || '__new__';
}

function freeze(b=true){
  document.body.classList.toggle('modal-open', b);
}

/*───────────────────────────────────────────────────*/
/* 3. add-form logic                                 */
/*───────────────────────────────────────────────────*/
addSel.onchange = ()=> {
  const isNew = addSel.value === '__new__';
  addNew.classList.toggle('hidden', !isNew);
  if(isNew) addNew.focus();
};
$('#add-link-form').onsubmit = e=>{
  e.preventDefault();
  const title = $('#link-title').value.trim();
  const url   = $('#link-url').value.trim();
  let cat = addSel.value === '__new__' ? addNew.value.trim() : addSel.value.trim();
  if(!title||!url||!cat) return;

  set(push(dbRef(db,`users/${uid}/links`)),{title,url,category:cat});
  categories.add(cat); refreshPickers();
  e.target.reset(); addNew.classList.add('hidden');
};

/*───────────────────────────────────────────────────*/
/* 4. modal open / close                             */
/*───────────────────────────────────────────────────*/
function showModal(){ overlay.classList.remove('hidden'); freeze(true); }
function hideModal(){ overlay.classList.add('hidden');   freeze(false); }

function openEdit(link,id){
  eTitle.value = link.title;
  eURL.value   = link.url;
  refreshPickers();
  eCat.value   = link.category;
  eNewCat.classList.add('hidden');

  eCat.onchange = ()=>{
    const wantNew = eCat.value==='__new__';
    eNewCat.classList.toggle('hidden',!wantNew);
    if(wantNew) eNewCat.focus();
  };

  dlg.onsubmit = ev=>{
    ev.preventDefault();
    const cat = eCat.value==='__new__' ? eNewCat.value.trim() : eCat.value.trim();
    if(!cat){alert('Category required');return;}
    const upd={title:eTitle.value.trim(),url:eURL.value.trim(),category:cat};
    update(dbRef(db,`users/${uid}/links/${id}`),upd).then(()=>{
      categories.add(cat); refreshPickers(); hideModal();
    });
  };

  showModal();
}
btnX.onclick = hideModal;

/*───────────────────────────────────────────────────*/
/* 5. render categories / links                      */
/*───────────────────────────────────────────────────*/
function render(){
  onValue(dbRef(db,`users/${uid}/links`),snap=>{
    const data = snap.val()||{};
    categories  = new Set(Object.values(data).map(l=>(l.category||'Uncategorized').trim()));
    refreshPickers();

    const root=$list(); root.innerHTML='';
    if(!Object.keys(data).length){
      root.innerHTML='<p class="empty">No links yet.</p>';
      return;
    }

    for(const [cat,links] of Object.entries(groupByCat(data))){
      const sec=document.createElement('div'); sec.className='category-section';
      sec.innerHTML=`
        <div class="category-title">
          <h2>${cat}</h2>
          <div class="cat-actions">
            <button class="ghost edit">✏️</button>
            <button class="ghost delete">🗑️</button>
          </div>
        </div>`;
      const head = sec.firstElementChild;

      head.querySelector('.edit').onclick=()=>{
        const n=prompt('Rename to:',cat);
        if(n&&n!==cat) links.forEach(l=>update(dbRef(db,`users/${uid}/links/${l.id}`),{category:n}));
      };
      head.querySelector('.delete').onclick=()=>{
        if(confirm(`Delete "${cat}" and its links?`))
          links.forEach(l=>remove(dbRef(db,`users/${uid}/links/${l.id}`)));
      };

      const grid=document.createElement('div');
      grid.className='category-links';
      sec.appendChild(grid);

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
        grid.appendChild(row);
      });

      root.appendChild(sec);
    }
  });
}

/*───────────────────────────────────────────────────*/
/* 6. interactions                                   */
/*───────────────────────────────────────────────────*/
function bind(){
  let openMenu=null;

  $list().addEventListener('click',e=>{
    const btn=e.target.closest('.link-main');
    if(btn && !e.target.classList.contains('menu-btn'))
      window.open(btn.dataset.url,'_blank','noopener,noreferrer');
  });

  $list().addEventListener('click',e=>{
    const t=e.target.closest('.menu-btn'); if(!t) return;
    const m=$(`#m-${t.dataset.id}`); if(openMenu&&openMenu!==m) openMenu.hidden=true;
    m.hidden=!m.hidden; openMenu=m.hidden?null:m;
  });

  document.addEventListener('mousedown',e=>{
    if(openMenu && !openMenu.contains(e.target)) openMenu.hidden=true,openMenu=null;
  });

  $list().addEventListener('click',e=>{
    const del=e.target.closest('.menu-delete');
    const edt=e.target.closest('.menu-edit');
    if(!del && !edt) return;
    const id=(del||edt).dataset.id;

    if(del) remove(dbRef(db,`users/${uid}/links/${id}`));

    if(edt)
      get(dbRef(db,`users/${uid}/links/${id}`))
        .then(snap=>snap.exists()&&openEdit(snap.val(),id));

    if(openMenu) openMenu.hidden=true,openMenu=null;
  });
}

/*───────────────────────────────────────────────────*/
/* 7. Boot                                           */
/*───────────────────────────────────────────────────*/
onUserReady(user=>{
  uid=user.uid;
  render();
  bind();
  freeze(false);            // ensure page interactive at load
});