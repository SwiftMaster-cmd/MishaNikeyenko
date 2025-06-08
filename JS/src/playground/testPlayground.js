// testPlayground.js

import runPlaygroundSession from './runPlaygroundSession.js';

const main = document.getElementById('playground-main');
main.innerHTML = `
  <h2>Playground Session Test</h2>
  <button id="run-test-btn">Run Test Session</button>
  <div id="console-log" style="margin-top:20px;padding:1em;background:#181828;border-radius:8px;min-height:40px;"></div>
  <pre id="playground-output" style="margin-top:20px;padding:1em;background:#23233c;border-radius:8px;min-height:60px;max-height:300px;overflow:auto;color:#e0e0e0;font-size:1em;"></pre>
`;

document.getElementById('run-test-btn').onclick = async () => {
  const output = document.getElementById('playground-output');
  output.textContent = "";
  try {
    const result = await runPlaygroundSession();
    output.innerHTML = `
<b>Task:</b> ${result.title}
<hr>
<b>Generated Code:</b>
<pre style="background:#181828;padding:10px;border-radius:8px;color:#b9ffb9;">${result.draftCode.code}</pre>
<b>Review:</b>
<pre style="background:#282838;padding:10px;border-radius:8px;color:#e0c8f8;">${JSON.stringify(result.reviewNotes, null, 2)}</pre>
    `;
  } catch (err) {
    output.innerHTML = `<div style="color:#f55;">ERROR: ${err.message}</div>`;
    const logBox = document.getElementById('console-log');
    logBox.innerHTML += `<div style="color:#f55">[${new Date().toLocaleTimeString()}] ERROR: ${err.message}</div>`;
  }
};