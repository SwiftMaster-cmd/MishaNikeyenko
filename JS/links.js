/* links.js – sidebar version (June-2025) */

//////////////////// 0.  Firebase ////////////////////
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

import { initializeApp }               from "https://www.gstatic.com/firebasejs/11.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js";
import {
  getDatabase, ref as dbRef, get,
  push, set, remove, update, onValue
} from "https://www.gstatic.com/firebasejs/11.8.1/firebase-database.js";

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getDatabase(app);

//////////////////// 1.  Globals & helpers ////////////////////
const $      = s=>document.querySelector(s);
const $list  = ()=>document.getElementById('nav-links');   // ← sidebar target
let uid;
let categories=new Set();

/* add-form elements */
const addSel = $('#link-category');
const addInp = $('#new-cat-input');

/* modal elements */
const overlay = $('#edit-overlay');
const dlg     = $('#edit-dialog');
const eTitle  = $('#edit-title');
const eURL    = $('#edit-url');
const eCat    = $('#edit-cat');
const eNewCat = $('#edit-new-cat');
const btnX    = $('#edit-cancel');

/* build pickers */
const refreshPickers=()=>{
  const opts=[...categories].sort()
    .map(c=>`<option value="${c}">${c}</option>`).join('')
    +'<option value="__new__">➕ New…</option>';
  addSel.innerHTML=opts; eCat.innerHTML=opts;
  addSel.value=[...categories][0]||'__new__';
};

const groupByCat=d=>{
  const o={}; Object.entries(d).forEach(([id,l])=>{
    const k=(l.category||'Uncategorized').trim();
    (o[k] ||= []).push({...l,id});
  }); return o;
};

//////////////////// 2.  Auth ////////////////////
onAuthStateChanged(auth,u=>{
  if(!u){window.location.href="../index.html";return;}
  uid=u.uid; init();
});

//////////////////// 3.  UI freeze helpers ////////////////////
const showModal=()=>{overlay.classList.remove('hidden');document.body.classList.add('modal-open');};
const hideModal=()=>{overlay.classList.add('hidden');document.body.classList.remove('modal-open');};

//////////////////// 4.  Add-bookmark form ////////////////////
addSel.onchange=()=>{const n=addSel.value==='__new__';addInp.classList.toggle('hidden',!n);if(n) addInp.focus();};
$('#add-link-form').onsubmit=e=>{
  e.preventDefault();
  const title=$('#link-title').value.trim();
  const url  =$ ('#link-url').value.trim();
  let   cat  =addSel.value==='__new__'?addInp.value.trim():addSel.value.trim();
  if(!title||!url||!cat) return;
  set(push(dbRef(db,`users/${uid}/links`)),{title,url,category:cat});
  categories.add(cat);refreshPickers();e.target.reset();addInp.classList.add('hidden');
};

//////////////////// 5.  Edit dialog ////////////////////
function openEdit(link,id){
  eTitle.value=link.title; eURL.value=link.url;
  refreshPickers(); eCat.value=link.category;
  eNewCat.classList.add('hidden'); eNewCat.value='';
  eCat.onchange=()=>{const n=eCat.value==='__new__';eNewCat.classList.toggle('hidden',!n);if(n) eNewCat.focus();};

  dlg.onsubmit=ev=>{
    ev.preventDefault();
    const cat=eCat.value==='__new__'?eNewCat.value.trim():eCat.value.trim();
    if(!cat){alert('Category required');return;}
    update(dbRef(db,`users/${uid}/links/${id}`),{title:eTitle.value.trim(),url:eURL.value.trim(),category:cat})
      .then(()=>{categories.add(cat);refreshPickers();hideModal();});
  };
  showModal();
}
btnX.onclick=hideModal;

//////////////////// 6.  Render into sidebar ////////////////////
function render(){
  onValue(dbRef(db,`users/${uid}/links`),snap=>{
    const data=snap.val()||{};
    categories=new Set(Object.values(data).map(l=>(l.category||'Uncategorized').trim()));
    refreshPickers();

    const root=$list(); root.innerHTML='';
    if(!Object.keys(data).length){root.innerHTML='<p class="empty">No links yet.</p>';return;}

    for(const [cat,links] of Object.entries(groupByCat(data))){
      /* category header */
      const h=document.createElement('div');
      h.className='category-title';
      h.innerHTML=`<h2>${cat}</h2>
        <div class="cat-actions">
          <button class="ghost edit">✏️</button>
          <button class="ghost delete">🗑️</button>
        </div>`;
      root.appendChild(h);

      h.querySelector('.edit').onclick=()=>{
        const n=prompt('Rename to:',cat);
        if(n&&n!==cat) links.forEach(l=>update(dbRef(db,`users/${uid}/links/${l.id}`),{category:n}));
      };
      h.querySelector('.delete').onclick=()=>{
        if(confirm(`Delete "${cat}" and its links?`))
          links.forEach(l=>remove(dbRef(db,`users/${uid}/links/${l.id}`)));
      };

      /* vertical list (one column) for this category */
      const container=document.createElement('div'); container.className='nav-links-group';
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
        container.appendChild(row);
      });
      root.appendChild(container);
    }
  });
}

//////////////////// 7.  Row-level interactions ////////////////////
function bind(){
  let openMenu=null;

  $list().addEventListener('click',e=>{
    const b=e.target.closest('.link-main');
    if(b && !e.target.classList.contains('menu-btn'))
      window.open(b.dataset.url,'_blank','noopener,noreferrer');
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
    if(edt) get(dbRef(db,`users/${uid}/links/${id}`))
              .then(snap=>snap.exists()&&openEdit(snap.val(),id));
    if(openMenu) openMenu.hidden=true,openMenu=null;
  });
}

//////////////////// 8.  boot ////////////////////
function init(){
  render();
  bind();
  hideModal();                // ensure overlay hidden at start
}