(function () {
  if (window.__sbinOverlay) return;
  const SBIN_VERSION = "3.5";
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
    edit: '<svg width="18" height="18" viewBox="0 0 20 20"><path d="M14.7 2.3a1 1 0 0 1 1.4 0l1.6 1.6a1 1 0 0 1 0 1.4l-9.8 9.8-2.8.8.8-2.8 9.8-9.8zM3 17h14a1 1 0 1 1 0 2H3a1 1 0 1 1 0-2z" fill="#007AFF"/></svg>',
    save: '<svg width="18" height="18" viewBox="0 0 20 20"><path d="M7 13l-4-4 1.4-1.4L7 10.2l8.6-8.6L17 3l-10 10z" fill="#fff"/></svg>',
    close: '<svg width="18" height="18" viewBox="0 0 20 20"><path d="M5 5l10 10M15 5L5 15" stroke="#f33" stroke-width="2" stroke-linecap="round"/></svg>',
    add: '<svg width="18" height="18" viewBox="0 0 20 20"><path d="M10 4v12M4 10h12" stroke="#007AFF" stroke-width="2" stroke-linecap="round"/></svg>',
    people: '<svg width="18" height="18" viewBox="0 0 20 20"><circle cx="10" cy="6" r="4" fill="#007AFF"/><path d="M2 18c0-3 4-5 8-5s8 2 8 5" fill="#007AFF"/></svg>',
    topic: '<svg width="18" height="18" viewBox="0 0 20 20"><rect x="3" y="4" width="14" height="3" rx="1.5" fill="#007AFF"/><rect x="3" y="9" width="14" height="3" rx="1.5" fill="#007AFF"/><rect x="3" y="14" width="10" height="3" rx="1.5" fill="#007AFF"/></svg>',
    back: '<svg width="18" height="18" viewBox="0 0 20 20"><path d="M12 17l-5-5 5-5" stroke="#007AFF" stroke-width="2" stroke-linecap="round" fill="none"/></svg>',
    up: '<svg width="16" height="16" viewBox="0 0 20 20"><path d="M5 12l5-5 5 5" stroke="#007AFF" stroke-width="2" fill="none"/></svg>',
    down: '<svg width="16" height="16" viewBox="0 0 20 20"><path d="M5 8l5 5 5-5" stroke="#007AFF" stroke-width="2" fill="none"/></svg>',
    eye: '<svg width="18" height="18" viewBox="0 0 20 20"><circle cx="10" cy="10" r="3" fill="#007AFF"/><path d="M1 10c2.7-5 14.3-5 17 0-2.7 5-14.3 5-17 0z" stroke="#007AFF" stroke-width="1.5" fill="none"/></svg>',
    check: '<svg width="18" height="18" viewBox="0 0 20 20"><path d="M6 11l3 3 5-5" stroke="#fff" stroke-width="2" fill="none"/></svg>',
  };

  function flash(btn) {
    btn.classList.add("sbin-flash");
    setTimeout(() => btn.classList.remove("sbin-flash"), 450);
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
    const topStick = 20, bottomStick = 20;
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
    // Allow scroll/resize to keep perfect pin
    box._sbinSnap = function () { snap(isTop, false); };

    // Paranoid: every second, re-apply forced fixed positioning
    setInterval(() => { forceFixed(box); }, 1000);
    // Extra paranoid: mutation observer for forced position
    const observer = new MutationObserver(() => forceFixed(box));
    observer.observe(box, { attributes: true, attributeFilter: ["style"] });
  }

  function showTextareaModal(title, callback) {
    let overlay = create(
      "div",
      "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(28,30,40,0.46);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(3px);"
    );
    let box = create(
      "div",
      "background:rgba(22,28,38,0.92);backdrop-filter:blur(19px);padding:26px 24px 20px 24px;border-radius:20px;max-width:96vw;width:400px;display:flex;flex-direction:column;gap:15px;box-shadow:0 12px 40px rgba(20,20,35,0.22);font-family:-apple-system,BlinkMacSystemFont,sans-serif;align-items:stretch;"
    );
    let label = create(
      "div",
      "font-weight:700;font-size:17px;color:#fff;letter-spacing:0.1px;text-shadow:0 2px 8px rgba(0,0,0,0.23);margin-bottom:6px;",
      title
    );
    let textarea = create(
      "textarea",
      "width:100%;padding:11px 12px;font-size:15px;border-radius:13px;border:1.5px solid #222;outline:none;font-family:inherit;resize:vertical;background:rgba(250,252,254,0.95);color:#111;"
    );
    textarea.rows = 9;
    let save = create(
      "button",
      "background:#007aff;color:#fff;font-weight:600;border-radius:13px;border:none;padding:10px 0;margin-top:8px;font-size:16px;box-shadow:0 2px 8px rgba(0,122,255,0.09);cursor:pointer;letter-spacing:0.01em;transition:filter 0.18s;min-width:96px;",
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
      "position:fixed;top:auto;left:50%;transform:translateX(-50%);max-width:500px;width:94vw;background:rgba(26,30,44,0.93);backdrop-filter:blur(24px) saturate(1.10);border-radius:26px;box-shadow:0 14px 44px 0 rgba(22,30,44,0.39),0 2px 6px 0 rgba(22,30,44,0.17);border:1.8px solid rgba(120,140,170,0.16);padding:0 0 14px 0;overflow:hidden;pointer-events:auto;"
    );
    forceFixed(box);

    let header = create(
      "div",
      "width:100%;height:52px;display:flex;align-items:center;gap:9px;justify-content:space-between;background:rgba(22,26,36,0.99);backdrop-filter:blur(16px) saturate(1.02);border-bottom:1px solid rgba(120,140,170,0.13);cursor:grab;box-shadow:0 2px 16px rgba(22,30,44,0.13);padding:0 0.5em;"
    );
    let handle = create(
      "div",
      "height:18px;width:66px;background:rgba(190,210,225,0.23);border-radius:7px;margin:0 18px;align-self:center;cursor:grab;display:block;",
      ""
    );
    handle.className = "sbin-handle";
    handle.title = "Drag to move";
    let versionTag = create(
      "div",
      "margin-left:8px;font-size:11px;color:#aab;"
    );
    versionTag.textContent = "SBIN v" + SBIN_VERSION;
    let ctrlRow = create(
      "div",
      "display:flex;align-items:center;gap:8px;margin-right:8px;"
    );
    function makeBtn(html, title, cb, style, more) {
      let b = create(
        "button",
        `display:inline-flex;align-items:center;justify-content:center;min-width:0;background:rgba(255,255,255,0.86);border:none;border-radius:11px;padding:0 18px;height:36px;box-shadow:0 1.5px 12px rgba(0,0,0,0.08);transition:filter 0.19s,background 0.2s;outline:none;cursor:pointer;font-size:15px;font-weight:600;${style||""}`
      );
      b.innerHTML = html;
      b.title = title || "";
      if (cb)
        b.addEventListener("click", function (e) {
          e.stopPropagation();
          cb(e, b);
        });
      if (more) more(b);
      b.addEventListener("pointerdown", (e) => { b.style.filter = "brightness(0.91)"; });
      b.addEventListener("pointerup", (e) => { b.style.filter = ""; });
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
        "background:rgba(255,70,70,0.13);padding:0;"
      )
    );
    header.appendChild(handle);
    header.appendChild(versionTag);
    header.appendChild(ctrlRow);
    box.appendChild(header);

    let contentArea = create(
      "div",
      "display:flex;flex-direction:column;align-items:stretch;padding:18px 18px 2px 18px;gap:12px;transition:all 0.22s;"
    );

    // MAIN VIEW (unchanged) ...
    if (view === "main") {
      let row = create(
        "div",
        "display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;"
      );
      if (editing) {
        ["s", "b", "i", "n"].forEach((k) => {
          let ta = create(
            "textarea",
            "flex:1 1 120px;min-width:86px;max-width:180px;height:74px;padding:12px 10px;border:1.5px solid #222;border-radius:15px;font-size:15px;font-family:inherit;background:rgba(240,244,248,0.93);margin-bottom:2px;outline:none;resize:vertical;box-shadow:0 2px 8px rgba(32,40,60,0.08);color:#23262d;"
          );
          ta.id = "sbin_" + k;
          ta.placeholder = { s: "Situation", b: "Behavior", i: "Impact", n: "Next Steps" }[k];
          ta.value = active[k] || "";
          row.appendChild(ta);
        });
      } else {
        ["s", "b", "i", "n"].forEach((k) => {
          let btn = makeBtn(
            { s: "Situation", b: "Behavior", i: "Impact", n: "Next Steps" }[k],
            "Tap to copy",
            function (e, b) {
              copyToClipboard(active[k] || "", b, e);
            },
            "background:rgba(255,255,255,0.93);color:#202733;"
          );
          row.appendChild(btn);
        });
      }
      contentArea.appendChild(row);

      let controlRow = create(
        "div",
        "display:flex;gap:12px;flex-wrap:wrap;margin-top:6px;"
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
            },
            "background:#007aff;color:#fff;"
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

    // NAMES VIEW (scrollable list)
    if (view === "names") {
      let scrollWrap = create(
        "div",
        "max-height:140px;overflow-y:auto;border-radius:13px;margin-bottom:5px;background:rgba(28,32,54,0.97);-webkit-overflow-scrolling:touch;"
      );
      let list = create(
        "div",
        "display:grid;grid-template-columns:1fr 1fr;gap:9px;padding:7px 0;"
      );

      d.names.forEach((n, i) => {
        let btn = makeBtn(
          n,
          "Tap to copy name",
          function (e, b) {
            copyToClipboard(n, b, e);
          },
          "background:rgba(255,255,255,0.98);color:#1b2230;font-size:15px;min-width:0;flex:1;height:38px;border-radius:9px;"
        );
        btn.style.fontWeight = "600";
        list.appendChild(btn);
      });

      // Prevent page from scrolling when using the list
      scrollWrap.addEventListener('touchmove', function(e){
        if (this.scrollHeight > this.clientHeight) e.stopPropagation();
      }, {passive:false});
      scrollWrap.appendChild(list);
      contentArea.appendChild(scrollWrap);

      let namesCtrl = create(
        "div",
        "display:flex;gap:10px;flex-wrap:wrap;margin-top:8px;"
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
        },
        "background:#007aff;color:#fff;"
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

    // TOPICS VIEW (unchanged) ...
    if (view === "topics") {
      let list = create(
        "div",
        "display:flex;flex-wrap:wrap;gap:10px;margin-bottom:10px;"
      );
      Object.keys(d.topics).forEach((key) => {
        let btn = makeBtn(
          key + (key === activeTopic ? " " + icons.check : ""),
          "Load topic",
          function () {
            activeTopic = key;
            active = d.topics[key];
            d.activeTopic = name;
            save();
            view = "main";
            render();
          },
          key === activeTopic
            ? "background:#007aff;color:#fff;"
            : "background:rgba(255,255,255,0.92);"
        );
        btn.style.fontWeight = "600";
        btn.style.fontSize = "15px";
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
        },
        "background:#007aff;color:#fff;"
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
        "display:flex;gap:10px;flex-wrap:wrap;margin-top:6px;"
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

    // KEEP SNAPPED on any scroll (mobile, desktop, toolbars etc)
    window.addEventListener('scroll', function () {
      if (box && typeof box._sbinSnap === 'function') box._sbinSnap();
    });
    // Also on resize for mobile orientation changes or toolbar transitions
    window.addEventListener('resize', function () {
      if (box && typeof box._sbinSnap === 'function') box._sbinSnap();
    });
  }

  // ---- CSS Injection ----
  (function injectCSS() {
    if (document.getElementById("__sbin-css")) return;
    let css = `
      .sbin-flash { animation:sbin-fade 0.4s; }
      @keyframes sbin-fade { 0%{background:#def;color:#283045;} 60%{background:#8ecbff;color:#fff;} 100%{background:inherit;color:inherit;} }
      .sbin-ripple {
        position: absolute; border-radius: 50%; pointer-events: none;
        background: rgba(0,122,255,0.24);
        transform: scale(0);
        animation: sbin-rip 0.65s linear;
      }
      @keyframes sbin-rip {
        to { transform: scale(2.1); opacity: 0; }
      }
      button[disabled] { opacity: 0.6 !important; pointer-events: none; }
    `;
    let style = document.createElement("style");
    style.id = "__sbin-css";
    style.innerHTML = css;
    document.head.appendChild(style);
  })();

  render();
})();