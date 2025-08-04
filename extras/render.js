// render.js
import {
  d, activeTopic, active, editing, view, editNames, save, create, setActiveTopic,
  SBIN_VERSION
} from "./sbin.js";

import {
  showMiniBar, dragHandler, forceFixed, makeBtn, icons, copyToClipboard, showTextareaModal, autofillSBINFields
} from "./ui-controls.js"; // We'll modularize controls next, for now assume this

// We need to be able to update state flags from here, so export setters or re-import from core or handle via closures

// Since editing/view/viewNames are mutable flags in sbin.js, we should export functions to set them:

export let editingFlag = editing;
export let viewFlag = view;
export let editNamesFlag = editNames;

export function setEditing(val) { editingFlag = val; }
export function setView(val) { viewFlag = val; }
export function setEditNames(val) { editNamesFlag = val; }

// Main render function
export function render() {
  // Remove old container if exists
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
    "background:rgba(26,30,44,0.38);backdrop-filter:blur(6px ) saturate(1.06);" +
    "border-radius:28px;box-shadow:0 10px 34px 0 rgba(33,150,243,0.10),0 1.5px 10px rgba(32,40,60,0.11);" +
    "border:1.5px solid rgba(120,140,170,0.09);padding:0 0 18px 0;overflow:hidden;pointer-events:auto;"
  );
  forceFixed(box);

  let header = create(
    "div",
    "width:100%;height:54px;display:flex;align-items:center;gap:9px;justify-content:space-between;" +
    "background:rgba(22,26,36,0.53);backdrop-filter:blur( 6px) saturate(1.06);" +
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

  ctrlRow.appendChild(
    makeBtn(
      icons.close,
      "Close",
      function () {
        // Minimize to left mini bar, not close
        document.body.removeChild(window.__sbinContainer);
        window.__sbinOverlay = false;
        window.__sbinContainer = null;
        showMiniBar(render);
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

  // Main view logic
  if (viewFlag === "main") {
    if (editingFlag) {
      let row = create(
        "div",
        "display:flex;flex-direction:row;flex-wrap:nowrap;gap:14px;justify-content:space-between;"
      );
      ["s", "b", "i", "n"].forEach((k) => {
        let ta = create(
          "textarea",
          "flex:1 1 120px;min-width:92px;max-width:190px;height:78px;padding:14px 10px;border:1.5px solid #222;border-radius:17px;font-size:16px;font-family:inherit;background:rgba(240,244,248,0.93);margin-bottom:2px;outline:none;resize:vertical;box-shadow:0 2px 8px rgba(32,40,60,0.07);color:#23262d;"
        );
        ta.id = "sbin_" + k;
        ta.placeholder = { s: "Situation", b: "Behavior", i: "Impact", n: "Next Steps" }[k];
        ta.value = active[k] || "";
        row.appendChild(ta);
      });
      contentArea.appendChild(row);
    } else {
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
    }

    let controlRow = create(
      "div",
      "display:flex;gap:14px;flex-wrap:wrap;margin-top:10px;justify-content:center;"
    );
    if (editingFlag) {
      controlRow.appendChild(
        makeBtn(
          icons.save + ' <span style="margin-left:4px;">Save</span>',
          "Save",
          function () {
            ["s", "b", "i", "n"].forEach(function (k) {
              active[k] = document.getElementById("sbin_" + k).value;
            });
            d.topics[activeTopic] = active;
            setEditing(false);
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
            setEditing(true);
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
          setView("names");
          render();
        }
      )
    );
    controlRow.appendChild(
      makeBtn(
        icons.topic + ' <span style="margin-left:4px;">Topics</span>',
        "Topics",
        function () {
          setView("topics");
          render();
        }
      )
    );
    contentArea.appendChild(controlRow);
  }

  // NAMES view
  if (viewFlag === "names") {
    let scrollWrap = create(
      "div",
      "max-height:160px;overflow-y:auto;border-radius:14px;margin-bottom:7px;background:rgba(26,30,44,0.38);-webkit-overflow-scrolling:touch;"
    );
    let list = create(
      "div",
      "display:grid;grid-template-columns:1fr 1fr;gap:11px;padding:7px 0;"
    );

    d.names.forEach((n) => {
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
      editNamesFlag ? icons.eye + " Hide Edit" : icons.edit + " Edit Mode",
      editNamesFlag ? "Hide Edit" : "Edit Mode",
      function () {
        setEditNames(!editNamesFlag);
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
        setView("main");
        render();
      }
    );
    namesCtrl.appendChild(back);

    contentArea.appendChild(namesCtrl);
  }

  // TOPICS view
  if (viewFlag === "topics") {
    let list = create(
      "div",
      "display:flex;flex-wrap:wrap;gap:10px;margin-bottom:11px;"
    );
    Object.keys(d.topics).forEach((key) => {
      let btn = makeBtn(
        key + (key === activeTopic ? " " + icons.check : ""),
        "Load topic",
        function () {
          setActiveTopic(key);
          setView("main");
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
          setActiveTopic(name);
          setView("main");
          render();
        }
      }
    );
    let back = makeBtn(
      icons.back + ' <span style="margin-left:4px;">Main</span>',
      "Back to main",
      function () {
        setView("main");
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

  window.addEventListener('scroll', function () {
    if (box && typeof box._sbinSnap === 'function') box._sbinSnap();
  });
  window.addEventListener('resize', function () {
    if (box && typeof box._sbinSnap === 'function') box._sbinSnap();
  });
}