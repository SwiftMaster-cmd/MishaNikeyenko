/**
 * dynamic-loader.js
 * -----------------
 * Loads user-pasted ES-module code, runs known exports, and shows output.
 */

const loadButton = document.getElementById('load-module');
const pasteArea  = document.getElementById('js-paster');
const outputDiv  = document.getElementById('js-output');

loadButton.addEventListener('click', async () => {
  const code = pasteArea.value.trim();
  outputDiv.textContent = '';

  if (!code) {
    alert('Please paste some valid ES-module code first.');
    return;
  }

  try {
    const blob = new Blob([code], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const mod = await import(url);
    URL.revokeObjectURL(url);

    // Known callable exports
    const callPriority = ['showModuleDemo', 'greet', 'default'];
    let called = false;

    for (const key of callPriority) {
      if (typeof mod[key] === 'function') {
        const result = await mod[key]('Console User');
        outputDiv.textContent = `${key}() returned:\n` + JSON.stringify(result, null, 2);
        called = true;
        break;
      }
    }

    if (!called) {
      outputDiv.textContent =
        'Module loaded, but no known functions were found.\nExports:\n' +
        Object.keys(mod).join(', ');
    }

  } catch (err) {
    console.error('[dynamic-loader] import failed:', err);
    outputDiv.textContent = `Error loading module:\n${err.message}`;
  }
});