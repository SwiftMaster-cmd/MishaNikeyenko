/* ../JS/ui.js  – sidebar + form toggle (no dependencies) */

document.addEventListener('DOMContentLoaded', () => {

  /* grab DOM refs */
  const sidebar = document.getElementById('side-nav');          // collapsible <nav>
  const burger  = document.getElementById('menu-toggle');       // ☰ button
  const addBtn  = document.getElementById('toggle-form-btn');   // "➕ Add bookmark"
  const form    = document.getElementById('add-link-form');     // collapsible form

  if (!sidebar || !burger) return;  // hard-fail safe

  /* ── SIDEBAR TOGGLE ───────────────────────────── */
  burger.addEventListener('click', () => {
    const open = sidebar.classList.toggle('open');      // slide in/out
    document.body.classList.toggle('sidebar-open', open);
  });

  /* ── ADD-BOOKMARK FORM TOGGLE ─────────────────── */
  addBtn?.addEventListener('click', () => {
    const isClosed = form.classList.toggle('collapsed');   // true → now hidden
    addBtn.classList.toggle('active', !isClosed);          // visual indicator
    if (!isClosed) document.getElementById('link-title')?.focus();
  });

});