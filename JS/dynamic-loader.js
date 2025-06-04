// dynamic-loader.js
const loadButton = document.getElementById('load-module');
const pasteArea = document.getElementById('js-paster');
const outputDiv = document.getElementById('js-output');

loadButton.addEventListener('click', async () => {
  const code = pasteArea.value.trim();
  outputDiv.innerHTML = ''; // Clear previous content

  if (!code) {
    alert('Please paste a valid ES module first.');
    return;
  }

  try {
    // Create blob and dynamic import
    const blob = new Blob([code], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const mod = await import(url);
    URL.revokeObjectURL(url);

    // Attempt to run known exports
    const knownExports = ['showModuleDemo', 'init', 'run', 'default'];
    let ran = false;

    for (const name of knownExports) {
      const fn = mod[name];
      if (typeof fn === 'function') {
        const result = await fn();
        
        // Display result text if returned
        if (typeof result === 'string') {
          const msg = document.createElement('p');
          msg.textContent = result;
          msg.style.marginTop = '1rem';
          outputDiv.appendChild(msg);
        }

        ran = true;
        break;
      }
    }

    if (!ran) {
      outputDiv.textContent = '✅ Module loaded, but no known function (e.g. showModuleDemo) found.';
    }

  } catch (err) {
    console.error('[dynamic-loader] error:', err);
    outputDiv.textContent = '❌ Error loading module: ' + err.message;
  }
});