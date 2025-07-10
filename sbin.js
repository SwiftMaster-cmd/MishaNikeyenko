(function () {
  if (window.__sbinOverlay) return;
  const SBIN_VERSION = "3.7";
  let d = JSON.parse(localStorage.getItem("sbinData") || "{}"),
    activeTopic = d.activeTopic || "Default",
    active = d.topics?.[activeTopic] || { s: "", b: "", i: "", n: "" },
    editing = false,
    view = "main",
    editNames = false,
    nameScrollOffset = 0;

  if (!d.topics) d.topics = { Default: active };
  if (!d.names) d.names = [];

  function save() { localStorage.setItem("sbinData", JSON.stringify(d)); }
  function create(tag, style, html) {
    const el = document.createElement(tag);
    if (style) el.style.cssText = style;
    if (html !== undefined) el.innerHTML = html;
    return el;
  }

  // ICONS
  const icons = {
    edit: '<svg width="18" height="18" viewBox="0 0 20 20"><path d="M14.7 2.3a1 1 0 0 1 1.4 0l1.6 1.6a1 1 0 0 1 0 1.4l-9.8 9.8-2.8.8.8-2.8 9.8-9.8zM3 17h14a1 1 0 1 1 0 2H3a1 1 0 1 1 0-2z" fill="#2196f3"/></svg>',
    save: '<svg width="18" height="18" viewBox="0 0 20 20"><path d="M7 13l-4-4 1.4-1.4L7 10.2l8.6-8.6L17 3l-10 10z" fill="#fff"/></svg>',
    close: '<svg width="18" height="18" viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="rgba(255,70,70,0.10)"/><path d="M7 7l6 6M13 7l-6 6" stroke="#f33" stroke-width="2.3" stroke-linecap="round"/></svg>',
    add: '<svg width="18" height="18" viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="#2196f3"/><path d="M10 6v8M6 10h8" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>',
    people: '<svg width="18" height="18" viewBox="0 0 20 20"><circle cx="10" cy="6" r="4" fill="#2196f3"/><path d="M2 18c0-3 4-5 8-5s8 2 8 5" fill="#2196f3"/></svg>',
    topic: '<svg width="18" height="18" viewBox="0 0 20 20"><rect x="3" y="4" width="14" height="3" rx="1.5" fill="#2196f3"/><rect x="3" y="9" width="14" height="3" rx="1.5" fill="#2196f3"/><rect x="3" y="14" width="10" height="3" rx="1.5" fill="#2196f3"/></svg>',
    back: '<svg width="18" height="18" viewBox="0 0 20 20"><circle cx="9" cy="10" r="7" fill="#e5f3ff"/><path d="M12 17l-5-5 5-5" stroke="#2196f3" stroke-width="2" stroke-linecap="round" fill="none"/></svg>',
    up: '<svg width="16" height="16" viewBox="0 0 20 20"><circle cx="10" cy="10" r="7" fill="#e5f3ff"/><path d="M5 12l5-5 5 5" stroke="#2196f3" stroke-width="2" fill="none"/></svg>',
    down: '<svg width="16" height="16" viewBox="0 0 20 20"><circle cx="10" cy="10" r="7" fill="#e5f3ff"/><path d="M5 8l5 5 5-5" stroke="#2196f3" stroke-width="2" fill="none"/></svg>',
    eye: '<svg width="18" height="18" viewBox="0 0 20 20"><circle cx="10" cy="10" r="3" fill="#2196f3"/><path d="M1 10c2.7-5 14.3-5 17 0-2.7 5-14.3 5-17 0z" stroke="#2196f3" stroke-width="1.5" fill="none"/></svg>',
    check: '<svg width="18" height="18" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="#2196f3"/><path d="M6 11l3 3 5-5" stroke="#fff" stroke-width="2" fill="none"/></svg>',
  };

  function flash(btn) {
    btn.classList.add("sbin-flash");
    setTimeout(() => btn.classList.remove("sbin-flash"), 400);
  }
  function rippleEffect(e, btn) {
    let circle = create("span");
    circle.className = "sbin-ripple";
    btn.appendChild(circle);
    let d = Math.max(btn.offsetWidth, btn.offsetHeight);
    circle.style.width = circle.style.height = d + "px";
    circle.style.left = (e?.offsetX ?? d/2) - d / 2 + "px";
    circle.style.top = (e?.offsetY ?? d/2) - d / 2 + "px";
    setTimeout(() => circle.remove(), 650);
  }
  function copyToClipboard(text, btn, e) {
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

  // --- Drag Handler ---
  function forceFixed(el) {
    if (!el) return;
    el.style.position = "fixed";
    el.style.zIndex = "2147483647";
    el.style.left = "50%";
    el.style.transform = "translateX(-50%)";
  }

  function dragHandler(box) {
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

  function showTextareaModal(title, callback) {
    let overlay = create(
      "div",
      "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(28,30,40,0.20);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(5px);"
    );
    let box = create(
      "div",
      "background:rgba(26,30,44,0.38);backdrop-filter:blur(18px);padding:26px 24px 20px 24px;border-radius:20px;max-width:96vw;width:400px;display:flex;flex-direction:column;gap:15px;box-shadow:0 10px 40px rgba(33,150,243,0.09);font-family:-apple-system,BlinkMacSystemFont,sans-serif;align-items:stretch;"
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

  // --- Autofill core logic ---
  function autofillSBINFields() {
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

  function render() {
    if (window.__sbinContainer) document.body.removeChild(window.__sbinContainer);
    let overlay = create(
      "div",
      "position:fixed;inset:0;z-index:2147483646;pointer-events:none;"
    );
    window.__sbinOverlay = true;
    window.__sbinContainer = overlay;

    let box = create(
      "div",
      "position:fixed;top:auto;left:50%;transform:translateX(-50%);max-width:500px;width:94vw;" +
      "background:rgba(26,30,44,0.38);backdrop-filter:blur(18px) saturate(1.06);" +
      "border-radius:28px;box-shadow:0 10px 34px 0 rgba(33,150,243,0.10),0 1.5px 10px rgba(32,40,60,0.11);" +
      "border:1.5px solid rgba(120,140,170,0.09);padding:0 0 18px 0;overflow:hidden;pointer-events:auto;"
    );
    forceFixed(box);

    let header = create(
      "div",
      "width:100%;height:54px;display:flex;align-items:center;gap:9px;justify-content:space-between;" +
      "background:rgba(22,26,36,0.53);backdrop-filter:blur(12px) saturate(1.06);" +
      "border-bottom:1.2px solid rgba(120,140,170,0.10);cursor:grab;" +
      "box-shadow:0 2px 10px rgba(22,30,44,0.08);padding:0 0.5em;"
    );
    let handle = create(
      "div",
      "height:19px;width:70px;background:rgba(180,200,230,0.17);border-radius:9px;margin:0 19px;align-self:center;cursor:grab;display:block;",
      ""
    );
    handle.className = "sbin-handle";
    handle.title = "Drag to move";
    let versionTag = create(
      "div",
      "margin-left:8px;font-size:12px;color:#b7c1d7;letter-spacing:0.04em;font-weight:500;"
    );
    versionTag.textContent = "SBIN v" + SBIN_VERSION;
    let ctrlRow = create(
      "div",
      "display:flex;align-items:center;gap:8px;margin-right:8px;"
    );
    function makeBtn(html, title, cb, style, more) {
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
    ctrlRow.appendChild(
      makeBtn(
        icons.close,
        "Close",
        function () {
          document.body.removeChild(window.__sbinContainer);
          window.__sbinOverlay = false;
          window.__sbinContainer = null;
        },
        "background:rgba(255,70,70,0.13);padding:0;width:44px;height:44px;border-radius:100px;"
      )
    );
    header.appendChild(handle);
    header.appendChild(versionTag);
    header.appendChild(ctrlRow);
    box.appendChild(header);

    let contentArea = create(
      "div",
      "display:flex;flex-direction:column;align-items:stretch;padding:22px 18px 2px 18px;gap:15px;background:none;transition:all 0.18s;"
    );

    // MAIN VIEW: Only Autofill (no SBIN copy buttons)
    if (view === "main") {
      let autofillRow = create(
        "div",
        "display:flex;flex-direction:row;flex-wrap:nowrap;gap:14px;justify-content:center;"
      );
      autofillRow.appendChild(
        makeBtn(
          icons.save + ' <span style="margin-left:9px;font-size:18px;">Autofill Form</span>',
          "Autofill external form",
          function () {
            autofillSBINFields();
          },
          "flex:1 1 0;padding:18px 0;font-size:19px;height:60px;background:#2196f3;color:#fff;border-radius:18px;box-shadow:0 2px 12px rgba(33,150,243,0.13);"
        )
      );
      contentArea.appendChild(autofillRow);

      let controlRow = create(
        "div",
        "display:flex;gap:14px;flex-wrap:wrap;margin-top:10px;justify-content:center;"
      );
      if (editing) {
        controlRow.appendChild(
          makeBtn(
            icons.save + ' <span style="margin-left:4px;">Save</span>',
            "Save",
            function () {
              ["s", "b", "i", "n"].forEach(function (k) {
                active[k] = document.getElementById("sbin_" + k).value;
              });
              d.topics[activeTopic] = active;
              editing = false;
              save();
              render();
            }
          )
        );
      } else {
        controlRow.appendChild(
          makeBtn(
            icons.edit + ' <span style="margin-left:4px;">Edit</span>',
            "Edit SBIN",
            function () {
              editing = true;
              render();
            }
          )
        );
      }
      controlRow.appendChild(
        makeBtn(
          icons.people + ' <span style="margin-left:4px;">Names</span>',
          "Names",
          function () {
            view = "names";
            render();
          }
        )
      );
      controlRow.appendChild(
        makeBtn(
          icons.topic + ' <span style="margin-left:4px;">Topics</span>',
          "Topics",
          function () {
            view = "topics";
            render();
          }
        )
      );
      contentArea.appendChild(controlRow);
    }

    // NAMES VIEW (unchanged)
    if (view === "names") {
      let scrollWrap = create(
        "div",
        "max-height:160px;overflow-y:auto;border-radius:14px;margin-bottom:7px;background:rgba(26,30,44,0.38);-webkit-overflow-scrolling:touch;"
      );
      let list = create(
        "div",
        "display:grid;grid-template-columns:1fr 1fr;gap:11px;padding:7px 0;"
      );

      d.names.forEach((n, i) => {
        let btn = makeBtn(
          n,
          "Tap to copy name",
          function (e, b) {
            copyToClipboard(n, b, e);
          },
          "background:rgba(255,255,255,0.97);color:#1b2230;font-size:16px;min-width:0;flex:1;height:40px;border-radius:10px;"
        );
        btn.style.fontWeight = "600";
        list.appendChild(btn);
      });

      scrollWrap.addEventListener('touchmove', function(e){
        if (this.scrollHeight > this.clientHeight) e.stopPropagation();
      }, {passive:false});
      scrollWrap.appendChild(list);
      contentArea.appendChild(scrollWrap);

      let namesCtrl = create(
        "div",
        "display:flex;gap:12px;flex-wrap:wrap;margin-top:9px;"
      );
      let toggle = makeBtn(
        editNames ? icons.eye + " Hide Edit" : icons.edit + " Edit Mode",
        editNames ? "Hide Edit" : "Edit Mode",
        function () {
          editNames = !editNames;
          render();
        }
      );
      namesCtrl.appendChild(toggle);

      let add = makeBtn(
        icons.add + ' <span style="margin-left:4px;">Add Name(s)</span>',
        "Add Name(s)",
        function () {
          showTextareaModal("Enter names (one per line):", (input) => {
            let names = input
              .split("\n")
              .map((n) => n.trim())
              .filter((n) => n);
            d.names.push(...names);
            save();
            render();
          });
        }
      );
      namesCtrl.appendChild(add);

      let back = makeBtn(
        icons.back + ' <span style="margin-left:4px;">Main</span>',
        "Back to main",
        function () {
          view = "main";
          render();
        }
      );
      namesCtrl.appendChild(back);

      contentArea.appendChild(namesCtrl);
    }

    // TOPICS VIEW (unchanged)
    if (view === "topics") {
      let list = create(
        "div",
        "display:flex;flex-wrap:wrap;gap:10px;margin-bottom:11px;"
      );
      Object.keys(d.topics).forEach((key) => {
        let btn = makeBtn(
          key + (key === activeTopic ? " " + icons.check : ""),
          "Load topic",
          function () {
            activeTopic = key;
            active = d.topics[key];
            d.activeTopic = key;
            save();
            view = "main";
            render();
          },
          key === activeTopic
            ? "background:#2196f3;color:#fff;"
            : "background:rgba(255,255,255,0.95);"
        );
        btn.style.fontWeight = "600";
        btn.style.fontSize = "16px";
        list.appendChild(btn);
      });
      contentArea.appendChild(list);

      let add = makeBtn(
        icons.add + ' <span style="margin-left:4px;">Add Topic</span>',
        "Add Topic",
        function () {
          let name = prompt("New topic name:");
          if (name && !d.topics[name]) {
            d.topics[name] = { s: "", b: "", i: "", n: "" };
            activeTopic = name;
            active = d.topics[name];
            d.activeTopic = name;
            save();
            view = "main";
            render();
          }
        }
      );
      let back = makeBtn(
        icons.back + ' <span style="margin-left:4px;">Main</span>',
        "Back to main",
        function () {
          view = "main";
          render();
        }
      );
      let topicsCtrl = create(
        "div",
        "display:flex;gap:12px;flex-wrap:wrap;margin-top:6px;"
      );
      topicsCtrl.appendChild(add);
      topicsCtrl.appendChild(back);

      contentArea.appendChild(topicsCtrl);
    }

    box.appendChild(contentArea);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    dragHandler(box);
    forceFixed(box);

    // KEEP SNAPPED on any scroll/resize/chrome shift
    window.addEventListener('scroll', function () {
      if (box && typeof box._sbinSnap === 'function') box._sbinSnap();
    });
    window.addEventListener('resize', function () {
      if (box && typeof box._sbinSnap === 'function') box._sbinSnap();
    });
  }

  // ---- CSS Injection ----
  (function injectCSS() {
    if (document.getElementById("__sbin-css")) return;
    let css = `
      .sbin-flash { animation:sbin-fade 0.36s; }
      @keyframes sbin-fade { 0%{background:#def;color:#283045;} 60%{background:#8ecbff;color:#fff;} 100%{background:inherit;color:inherit;} }
      .sbin-ripple {
        position: absolute; border-radius: 50%; pointer-events: none;
        background: rgba(33,150,243,0.19);
        transform: scale(0);
        animation: sbin-rip 0.65s linear;
      }
      @keyframes sbin-rip {
        to { transform: scale(2.1); opacity: 0; }
      }
      button[disabled] { opacity: 0.57 !important; pointer-events: none; }
    `;
    let style = document.createElement("style");
    style.id = "__sbin-css";
    style.innerHTML = css;
    document.head.appendChild(style);
  })();

  render();
})();