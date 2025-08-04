// ui.js
import { create } from "./sbin.js"; // import create helper from core (sbin.js)

export function showMiniBar(render) {
  if (window.__sbinMiniBar) return;
  let miniBar = document.createElement('div');
  miniBar.id = '__sbinMiniBar';
  miniBar.style.cssText =
    "position:fixed;bottom:26px;left:24px;z-index:2147483647;display:flex;gap:10px;pointer-events:auto;";
  
  let openBtn = document.createElement('button');
  openBtn.innerHTML = '<b style="font-size:20px;line-height:0.7;">＋</b>';
  openBtn.title = "Open SBIN";
  openBtn.style.cssText = "height:45px;width:45px;border-radius:50%;background:#2196f3;color:#fff;font-size:28px;font-weight:700;box-shadow:0 2px 8px rgba(33,150,243,0.18);border:none;cursor:pointer;";
  openBtn.onclick = function () {
    document.body.removeChild(miniBar);
    window.__sbinMiniBar = null;
    render();
  };

  let closeBtn = document.createElement('button');
  closeBtn.innerHTML = '<b style="font-size:19px;line-height:0.6;">×</b>';
  closeBtn.title = "Hide SBIN mini";
  closeBtn.style.cssText = "height:45px;width:45px;border-radius:50%;background:rgba(255,70,70,0.16);color:#f33;font-size:28px;font-weight:700;box-shadow:0 2px 8px rgba(33,33,33,0.14);border:none;cursor:pointer;";
  closeBtn.onclick = function () {
    document.body.removeChild(miniBar);
    window.__sbinMiniBar = null;
    window.__sbinOverlay = false;
    window.__sbinContainer = null;
  };

  miniBar.appendChild(openBtn);
  miniBar.appendChild(closeBtn);
  document.body.appendChild(miniBar);
  window.__sbinMiniBar = miniBar;
}

export function flash(btn) {
  btn.classList.add("sbin-flash");
  setTimeout(() => btn.classList.remove("sbin-flash"), 400);
}

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

export function forceFixed(el) {
  if (!el) return;
  el.style.position = "fixed";
  el.style.zIndex = "2147483647";
  el.style.left = "50%";
  el.style.transform = "translateX(-50%)";
}

export function dragHandler(box) {
  let dragging = false, startY = 0, startBoxY = 0, velocity = 0, lastY = 0, lastTime = 0;
  const topStick = 16, bottomStick = 16;
  let isTop = false;

  function snap(toTop, animate = true) {
    let vh = window.innerHeight, h = box.offsetHeight;
    forceFixed(box);
    if (animate) box.style.transition = "top 0.33s cubic-bezier(.4,1.8,.6,1)";
    if (toTop) {
      box.style.top = topStick + "px";
      isTop = true;
    } else {
      box.style.top = (vh - h - bottomStick) + "px";
      isTop = false;
    }
    box.style.left = "50%";
    box.style.transform = "translateX(-50%)";
    if (animate) setTimeout(() => { box.style.transition = ""; }, 350);
  }
  function startDrag(y) {
    dragging = true;
    startY = y;
    startBoxY = parseFloat(box.style.top) || (isTop ? topStick : (window.innerHeight - box.offsetHeight - bottomStick));
    lastY = startY;
    lastTime = Date.now();
    box.style.transition = "none";
    document.body.style.overflow = "hidden";
  }
  function doDrag(y) {
    let now = Date.now(),
      dy = y - startY,
      ny = y,
      dt = now - lastTime;
    velocity = (ny - lastY) / (dt || 1);
    lastTime = now;
    lastY = ny;
    let vh = window.innerHeight, bh = box.offsetHeight;
    let newTop = Math.min(
      vh - bh - bottomStick,
      Math.max(topStick, startBoxY + dy)
    );
    forceFixed(box);
    box.style.top = newTop + "px";
    box.style.left = "50%";
    box.style.transform = "translateX(-50%)";
  }
  function endDrag() {
    dragging = false;
    document.body.style.overflow = "";
    let vh = window.innerHeight, bh = box.offsetHeight;
    let top = parseFloat(box.style.top) || 0;
    let snapThreshold = vh * 0.23;
    let mid = vh / 2;
    let boxMid = top + bh / 2;
    if (velocity < -0.7 || boxMid < snapThreshold) {
      snap(true);
    } else if (velocity > 0.7 || boxMid > vh - snapThreshold) {
      snap(false);
    } else {
      snap(boxMid < mid);
    }
  }
  let dragArea = box.querySelector(".sbin-handle").parentNode;
  dragArea.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    startDrag(e.clientY);
    window.addEventListener("mousemove", mousemove);
    window.addEventListener("mouseup", mouseup);
    e.preventDefault();
  });
  dragArea.addEventListener("touchstart", (e) => {
    startDrag(e.touches[0].clientY);
  }, { passive: true });
  function mousemove(e) { if (dragging) doDrag(e.clientY); }
  function mouseup(e) { if (dragging) { endDrag(); window.removeEventListener("mousemove", mousemove); window.removeEventListener("mouseup", mouseup);} }
  window.addEventListener("touchmove", (e) => {
    if (dragging) { doDrag(e.touches[0].clientY); e.preventDefault(); }
  }, { passive: false });
  window.addEventListener("touchend", (e) => { if (dragging) endDrag(); });
  window.addEventListener("resize", ()=>{ snap(isTop, false); });

  setTimeout(()=>snap(false, false),10);
  box._sbinSnap = function () { snap(isTop, false); };
  setInterval(() => { forceFixed(box); }, 1000);
  const observer = new MutationObserver(() => forceFixed(box));
  observer.observe(box, { attributes: true, attributeFilter: ["style"] });
}

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
    '<svg width="18" height="18" viewBox="0 0 20 20"><path d="M7 13l-4-4 1.4-1.4L7 10.2l8.6-8.6L17 3l-10 10z" fill="#fff"/></svg> &nbsp;Add'
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