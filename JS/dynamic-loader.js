/**
 * dynamic-loader.js
 * -----------------
 * Loads pasted ES module, detects and calls known exports, and shows output.
 */

const loadButton = document.getElementById('load-module');
const pasteArea  = document.getElementById('js-paster');
const outputDiv  = document.getElementById('js-output');

loadButton.addEventListener('click', async () => {
  outputDiv.textContent = '';
  const code = pasteArea.value.trim();

  if (!code) {
    alert('Paste some valid ES-module code first.');
    return;
  }

  try {
    const blob = new Blob([code], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const mod = await import(url);
    URL.revokeObjectURL(url);

    // List of prioritized callable exports
    const callPriority = ['showModuleDemo', 'greet', 'init', 'run', 'default'];
    let called = false;

    for (const key of callPriority) {
      if (typeof mod[key] === 'function') {
        const result = await callExport(mod[key]);
        outputDiv.textContent = `${key}() returned:\n` + format(result);
        called = true;
        break;
      }
    }

    if (!called) {
      outputDiv.textContent =
        '✅ Module loaded.\nBut no known export was callable.\nAvailable exports:\n' +
        Object.keys(mod).join(', ');
    }

  } catch (err) {
    console.error('[dynamic-loader] import failed:', err);
    outputDiv.textContent = `❌ Error loading module:\n${err.message}`;
  }
});

/**
 * Call a possibly async export
 */
async function callExport(fn) {
  try {
    const result = fn.length === 0 ? fn() : fn('Console User');
    return await result;
  } catch (e) {
    return `⚠️ Error during function call: ${e.message}`;
  }
}

/**
 * Format result for display
 */
function format(val) {
  if (typeof val === 'object') return JSON.stringify(val, null, 2);
  return String(val);
}