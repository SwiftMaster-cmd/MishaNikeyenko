// sbin.js (entry point)
import * as core from "./core.js";
import * as ui from "./ui.js";
import * as controls from "./ui-controls.js";
import * as renderModule from "./render.js";

// Re-export core state and helpers as needed
export const {
  SBIN_VERSION,
  d,
  activeTopic,
  active,
  editing,
  view,
  editNames,
  nameScrollOffset,
  save,
  create,
  setActiveTopic
} = core;

// Re-export UI helpers if needed
export const {
  showMiniBar,
  flash,
  rippleEffect,
  copyToClipboard,
  forceFixed,
  dragHandler,
  showTextareaModal
} = ui;

// Re-export controls and icons
export const {
  icons,
  makeBtn,
  copyToClipboard: controlsCopy,
  showTextareaModal: controlsModal,
  autofillSBINFields
} = controls;

// Export state setters used by render
export let editingFlag = false;
export let viewFlag = "main";
export let editNamesFlag = false;

export function setEditing(val) {
  editingFlag = val;
}

export function setView(val) {
  viewFlag = val;
}

export function setEditNames(val) {
  editNamesFlag = val;
}

// Finally, expose render and call it
export const render = renderModule.render;

// Initialize state vars inside core for render
core.editing = editingFlag;
core.view = viewFlag;
core.editNames = editNamesFlag;

// Start UI
render();