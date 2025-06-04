/**
 * dynamic-loader.js
 * -----------------
 * Grabs code from the <textarea id="js-paster">, turns it into a Blob,
 * dynamically imports it as an ES-module, and optionally displays output.
 */

const loadButton = document.getElementById('load-module');
const pasteArea  = document.getElementById('js-paster');
const outputDiv  = document.getElementById('js-output');

loadButton.addEventListener('click', async () => {
  const code = pasteArea.value.trim();
  if (!code) {
    alert('Please paste some valid ES-module code first.');
    return;
  }

  try {
    // Create a Blob from the pasted text
    const blob = new Blob([code], { type: 'text/javascript' });
    // Make a temporary URL for that Blob
    const url = URL.createObjectURL(blob);

    // Dynamically import the module
    const mod = await import(url);

    // Clean up the Blob URL immediately
    URL.revokeObjectURL(url);

    // If the module exported a known function, call it or display something.
    // Example: if they wrote "export function greet(name) { … }"
    if (typeof mod.greet === 'function') {
      const greeting = mod.greet('Console User');
      outputDiv.textContent = `greet() returned: ${greeting}`;
    } else if (typeof mod.default === 'function') {
      // If they used a default export that's a function, call it
      const val = await mod.default();
      outputDiv.textContent = `default() returned: ${String(val)}`;
    } else {
      outputDiv.textContent = 'Module loaded successfully. No known exports called.';
    }
  } catch (err) {
    console.error('[dynamic-loader] import failed:', err);
    alert('Error loading module:\n' + err.message);
  }
});