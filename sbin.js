

// SBIN Overlay Script for Netlify App
(function(){
  if(window.__sbinOverlay) return;

  let d = JSON.parse(localStorage.getItem("sbinData") || "{}"),
      activeTopic = d.activeTopic || "Default",
      active = d.topics?.[activeTopic] || { s:"", b:"", i:"", n:"" },
      editing = false,
      view = "main",
      editNames = false,
      nameScrollOffset = 0;

  if (!d.topics) d.topics = { "Default": active };
  if (!d.names) d.names = [];

  function save() {
    localStorage.setItem("sbinData", JSON.stringify(d));
  }

  function flash(b) {
    let o = b.textContent;
    b.textContent = "✅";
    setTimeout(() => b.textContent = o, 700);
  }

  function styleBtn(b) {
    b.style = "background:#f7f7f7;border:1px solid #ccc;border-radius:12px;padding:6px 14px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:14px;color:#007aff;box-shadow:0 1px 3px rgba(0,0,0,0.05);transition:all 0.2s ease;cursor:pointer";
    b.onpointerdown = () => b.style.background = "#e0e0e0";
    b.onpointerup = () => b.style.background = "#f7f7f7";
  }

  function copyToClipboard(t, b) {
    let x = document.createElement("textarea");
    x.value = t;
    x.style.position = "fixed";
    x.style.opacity = 0;
    document.body.appendChild(x);
    x.focus();
    x.select();
    try {
      document.execCommand("copy");
      flash(b);
    } catch (e) {
      alert("Copy failed");
    }
    document.body.removeChild(x);
  }

  function dragHandler(c) {
    let y, t, d = false, lastY = 0, velocity = 0, lastTime = 0;
    const snap = (to) => {
      c.style.transition = "top 0.25s ease-in-out";
      c.style.top = to;
      c.style.bottom = "auto";
    };
    c.addEventListener("touchstart", e => {
      c.style.transition = "none";
      y = e.touches[0].clientY;
      t = c.getBoundingClientRect().top;
      d = true;
      lastTime = Date.now();
      lastY = y;
    }, { passive: true });

    c.addEventListener("touchmove", e => {
      if (!d) return;
      let now = Date.now(),
          ny = e.touches[0].clientY,
          dt = now - lastTime;
      velocity = (ny - lastY) / dt;
      lastTime = now;
      lastY = ny;
      const delta = ny - y;
      c.style.top = `${t + delta}px`;
      c.style.bottom = "auto";
    }, { passive: true });

    c.addEventListener("touchend", () => {
      d = false;
      const currentTop = c.getBoundingClientRect().top,
            mid = window.innerHeight / 2;
      if (velocity < -.3 || currentTop < mid) {
        snap("12px");
      } else {
        c.style.transition = "top 0.25s ease-in-out";
        c.style.top = "auto";
        c.style.bottom = "env(safe-area-inset-bottom,12px)";
      }
    });
  }

  function showTextareaModal(title, callback) {
    let overlay = document.createElement("div");
    overlay.style = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center";
    let box = document.createElement("div");
    box.style = "background:white;padding:20px;border-radius:10px;max-width:90%;width:400px;display:flex;flex-direction:column;gap:10px";
    let label = document.createElement("div");
    label.textContent = title;
    label.style = "font-weight:600";
    let textarea = document.createElement("textarea");
    textarea.rows = 10;
    textarea.style = "width:100%;padding:8px;font-size:14px;border-radius:6px;border:1px solid #ccc";
    let save = document.createElement("button");
    save.textContent = "✅ Add";
    styleBtn(save);
    save.style.alignSelf = "flex-end";
    save.onclick = function() {
      callback(textarea.value);
      document.body.removeChild(overlay);
    };
    box.appendChild(label);
    box.appendChild(textarea);
    box.appendChild(save);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  function render() {
    // The rest of the render logic would go here...
  }

  render();
})();

