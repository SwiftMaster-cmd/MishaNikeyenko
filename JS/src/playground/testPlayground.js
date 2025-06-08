// testPlayground.js

import runPlaygroundSession from './runPlaygroundSession.js';

// Inject a test button and console area
const main = document.getElementById('playground-main');
main.innerHTML = `
  <h2>Playground Session Test</h2>
  <button id="run-test-btn">Run Test Session</button>
  <div id="console-log" style="margin-top:20px;padding:1em;background:#181828;border-radius:8px;min-height:40px;"></div>
`;

document.getElementById('run-test-btn').onclick = async () => {
  try {
    await runPlaygroundSession();
  } catch (err) {
    const logBox = document.getElementById('console-log');
    logBox.innerHTML += `<div style="color:#f55">[${new Date().toLocaleTimeString()}] ERROR: ${err.message}</div>`;
  }
};