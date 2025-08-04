// ui-controls.js
import { create, d, activeTopic, active, save } from "./sbin.js";

// ICONS object
export const icons = {
  edit: '<svg width="18" height="18" viewBox="0 0 20 20"><path d="M14.7 2.3a1 1 0 0 1 1.4 0l1.6 1.6a1 1 0 0 1 0 1.4l-9.8 9.8-2.8.8.8-2.8 9.8-9.8zM3 17h14a1 1 0 1 1 0 2H3a1 1 0 1 1 0-2z" fill="#2196f3"/></svg>',
  save: '<svg width="18" height="18" viewBox="0 0 20 20"><path d="M7 13l-4-4 1.4-1.4L7 10.2l8.6-8.6L17 3l-10 10z" fill="#fff"/></svg>',
  close: '<svg width="18" height="18" viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="rgba(255,70,70,0.10)"/><path d="M7 7l6 6M13 7l-6 6" stroke="#f33" stroke-width="2.3" stroke-linecap="round"/></svg>',
  add: '<svg width="18" height="18" viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="#2196f3"/><path d="M10 6v8M6 10h8" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>',
  people: '<svg width="18" height="18" viewBox="0 0 20 20"><circle cx="10" cy="6" r="4" fill="#2196f3"/><path d="M2 18c0-3 4-5 8-5s8 2 8 5" fill="#2196f3"/></svg>',
  topic: '<svg width="18" height="18" viewBox="0 0 20 20"><rect x="3" y="4" width="14" height="3" rx="1.5" fill="#2196f3"/><rect x="3" y="9" width="14" height="3" rx="1.5" fill="#2196f3"/><rect x="3" y="14" width="10" height="3" rx="1.5" fill="#2196f3"/></svg>',
  back: '<svg width="18" height="18" viewBox="0 0 20 20"><circle cx="9" cy="10" r="7" fill="#e5f3ff"/><path d="M12 17l-5-5 5-5" stroke="#2196f3" stroke-width="2" stroke-linecap="round" fill="none"/></svg>',
  eye: '<svg width="18" height="18" viewBox="0 0 20 20"><circle cx="10" cy="10" r="3" fill="#2196f3"/><path d="M1 10c2.7-5 14.3-5 17 0-2.7 5-14.3 5-17 0z" stroke="#2196f3" stroke-width="1.5" fill="none"/></svg>',
  check: '<svg width="18" height="18" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="#2196f3"/><path d="M6 11l3 3 5-5" stroke="#fff" stroke-width="2" fill="none"/></svg>',
};

// Button factory
export function makeBtn(html, title, cb, style, more) {
  let b = create(
    "button",
    `display:inline-flex;align-items:center;justify-content:center;min-width:0;` +
    `background:rgba(255,255,255,0.79);border:none;border-radius:15px;` +
    `padding:0 20px;height:42px;box-shadow:0 1.5px 7px rgba(0,0,0,0.04);` +
    `transition:filter 0.16s,background 0.19s;outline:none;cursor:pointer;` +
    `font-size:17px;font-weight:700;letter-spacing:0.01em;${style||""}`
  );
  b.innerHTML = html;
  b.title = title || "";
  if (/Names|Topics|Edit|Save|Main|Mode|Add|Autofill/i.test(title)) {
    b.style.background = "#2196f3";
    b.style.color = "#fff";
  }
  if (/Close/i.test(title)) {
    b.style.background = "rgba(255,70,70,0.13)";
    b.style.color = "#f33";
  }
  if (cb)
    b.addEventListener("click", function (e, b) {
      e.stopPropagation();
      cb(e, b);
    });
  if (more) more(b);
  b.addEventListener("pointerdown", (e) => { b.style.filter = "brightness(0.93)"; });
  b.addEventListener("pointerup", (e) => { b.style.filter = ""; });
  b.addEventListener("mouseenter", e => b.style.filter = "brightness(0.98)");
  b.addEventListener("mouseleave", e => b.style.filter = "");
  return b;
}

// Clipboard copy helper
export function copyToClipboard(text, btn, e) {
  try {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
    } else {
      let x = document.createElement("textarea");
      x.value = text;
      x.style.position = "fixed";
      x.style.opacity = 0;
      document.body.appendChild(x);
      x.focus();
      x.select();
      document.execCommand("copy");
      document.body.removeChild(x);
    }
  } catch {}
  flash(btn);
  if (e) rippleEffect(e, btn);
}

// Flash effect for buttons
export function flash(btn) {
  btn.classList.add("sbin-flash");
  setTimeout(() => btn.classList.remove("sbin-flash"), 400);
}

// Ripple effect for buttons
export function rippleEffect(e, btn) {
  let circle = create("span");
  circle.className = "sbin-ripple";
  btn.appendChild(circle);
  let d = Math.max(btn.offsetWidth, btn.offsetHeight);
  circle.style.width = circle.style.height = d + "px";
  circle.style.left = (e?.offsetX ?? d/2) - d / 2 + "px";
  circle.style.top = (e?.offsetY ?? d/2) - d / 2 + "px";
  setTimeout(() => circle.remove(), 650);
}

// Show modal textarea for adding names
export function showTextareaModal(title, callback) {
  let overlay = create(
    "div",
    "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(28,30,40,0.20);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(5px);"
  );
  let box = create(
    "div",
    "background:rgba(26,30,44,0.38);backdrop-filter:blur(6px);padding:26px 24px 20px 24px;border-radius:20px;max-width:96vw;width:400px;display:flex;flex-direction:column;gap:15px;box-shadow:0 10px 40px rgba(33,150,243,0.09);font-family:-apple-system,BlinkMacSystemFont,sans-serif;align-items:stretch;"
  );
  let label = create(
    "div",
    "font-weight:700;font-size:18px;color:#fff;letter-spacing:0.1px;text-shadow:0 2px 8px rgba(0,0,0,0.13);margin-bottom:6px;",
    title
  );
  let textarea = create(
    "textarea",
    "width:100%;padding:13px 12px;font-size:16px;border-radius:13px;border:1.5px solid #222;outline:none;font-family:inherit;resize:vertical;background:rgba(250,252,254,0.96);color:#111;"
  );
  textarea.rows = 9;
  let save = create(
    "button",
    "background:#2196f3;color:#fff;font-weight:600;border-radius:13px;border:none;padding:10px 0;margin-top:8px;font-size:16px;box-shadow:0 2px 8px rgba(33,150,243,0.11);cursor:pointer;letter-spacing:0.01em;transition:filter 0.18s;min-width:96px;",
    icons.save + " &nbsp;Add"
  );
  save.onclick = function () {
    callback(textarea.value);
    document.body.removeChild(overlay);
  };
  box.appendChild(label);
  box.appendChild(textarea);
  box.appendChild(save);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  textarea.focus();
}

// Autofill external form fields with SBIN data
export function autofillSBINFields() {
  let d = JSON.parse(localStorage.getItem("sbinData") || "{}"),
      activeTopic = d.activeTopic || "Default",
      active = d.topics?.[activeTopic] || { s: "", b: "", i: "", n: "" };
  const values = [
    active.s || "",
    active.b || "",
    active.i || "",
    active.n || "",
    active.n || ""
  ];
  const ids = [
    "5a9d0dce-be65-4d33-b0b9-5f642d86649c",
    "b166711b-2f42-4188-858f-dbdcc45c1314",
    "d29d3620-ed3c-4dfd-8c94-64f65bea926f",
    "a7a74f46-24b4-43bc-a7a3-88d0c9d428ab",
    "a79ed052-d42c-4c93-acad-5699975fe30f"
  ];
  ids.forEach((id, i) => {
    let el = document.getElementById(id) || document.querySelector('[name="'+id+'"]');
    if (el) {
      el.value = values[i];
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
}