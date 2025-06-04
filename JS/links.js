/* /CSS/links.css – two-column bookmarks (2025-06-03) */
@import url('../CSS/variables.css');   /* tokens + reset */

/* ── add-bookmark form (collapsible) ───────────────────── */
#add-link-form{
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(200px,1fr)) 90px;
  gap:1rem; margin-bottom:2.5rem;
  overflow:hidden; max-height:420px; opacity:1; transform:translateY(0);
  transition:max-height .35s, opacity .28s, transform .28s;
}
#add-link-form.collapsed{
  max-height:0; opacity:0; transform:translateY(-10px); pointer-events:none;
}
#add-link-form input{
  padding:.85rem 1rem;
  background:rgba(255,255,255,.06); color:var(--clr-text);
  border:1px solid var(--clr-border); border-radius:12px; font-size:.97rem;
  transition:border-color .25s, background .25s;
}
#add-link-form input::placeholder{color:var(--clr-muted)}
#add-link-form input:focus{
  outline:none; border-color:var(--clr-primary); background:rgba(255,255,255,.10);
}
.btn-solid{
  background:var(--clr-primary); color:#fff; font-weight:600;
  border:none; border-radius:12px; cursor:pointer;
  transition:background .25s, transform .15s;
}
.btn-solid:hover{background:#5b2ee5}
.btn-solid:active{transform:scale(.97)}

/* ── empty-state helper ─────────────────────────────────── */
.empty{opacity:.6; text-align:center; margin:2rem 0}

/* ── CATEGORY WRAPPER ───────────────────────────────────── */
.category-section{
  margin-bottom:2.4rem;          /* room after each category */
  display:flex; flex-direction:column; gap:0;   /* keep title + grid stacked */
}

/* ── category title strip ──────────────────────────────── */
.category-title{
  position:relative;
  width:100%;                    /* span full width of section */
  text-align:center;             /* center the <h2> */
  margin-bottom:1.2rem;
}
.category-title h2{
  display:inline-block;
  font-size:1.25rem;             /* bigger heading */
  font-weight:700;
  padding:0 .4rem;
}
.cat-actions{
  position:absolute;             /* float ✏️ / 🗑️ hard-right */
  right:0; top:50%;
  transform:translateY(-50%);
  display:flex; gap:.5rem;
  opacity:0; pointer-events:none; transition:opacity .18s;
}
.category-title:hover .cat-actions{opacity:1; pointer-events:auto}
button.ghost{
  background:transparent; border:none; color:var(--clr-muted);
  font-size:1.05rem; padding:.25rem; border-radius:8px; cursor:pointer;
  transition:background .2s,color .2s;
}
button.ghost:hover{background:rgba(255,255,255,.08); color:var(--clr-text)}

/* ── two-column grid for links ─────────────────────────── */
.category-links{
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));   /* exactly 2 cols */
  gap:1.2rem;
}
/* mobile fallback: single column */
@media(max-width:640px){
  .category-links{grid-template-columns:1fr;}
}

/* ── individual link rows (cards) ─────────────────────── */
.link-row{
  position:relative;
  animation:fadeSlideIn .25s ease both;
}
.link-main{
  width:100%; display:flex; justify-content:space-between; align-items:center;
  padding:.9rem 1rem;
  border-radius:12px; border:1px solid var(--clr-border);
  background:rgba(255,255,255,.06); color:var(--clr-text); font-size:.95rem;
  cursor:pointer; transition:background .25s;
}
.link-main:hover{background:rgba(255,255,255,.10)}
.link-main .title{flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
.menu-btn{
  margin-left:1rem; color:var(--clr-muted); opacity:0; transition:opacity .18s;
}
.link-main:hover .menu-btn{opacity:1}

/* ── dropdown menu ─────────────────────────────────────── */
.menu{
  position:absolute; right:0; top:calc(100% + .35rem); min-width:220px;
  background:var(--clr-card); border:1px solid var(--clr-border);
  border-radius:var(--radius); padding:.8rem;
  display:flex; flex-direction:column; gap:.6rem; z-index:50;
}
.menu[hidden]{display:none!important}
.menu button{
  background:var(--clr-primary); color:#fff; border:none; border-radius:10px;
  padding:.55rem .9rem; font-size:.9rem; font-weight:600; cursor:pointer;
}
.menu-edit{background:#5b2ee5}
.menu-delete{background:#d32f2f}
.preview{
  word-break:break-all; font-size:.8rem; color:var(--clr-muted); margin-top:.4rem;
}

/* ── subtle motion ─────────────────────────────────────── */
@keyframes fadeSlideIn{
  from{opacity:0; transform:translateY(8px)}
  to  {opacity:1; transform:none}
}