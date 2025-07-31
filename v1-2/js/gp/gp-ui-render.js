// gp-ui-render.js
export function createProgressHeader(guestKey, onNewLeadClick, dashboardUrl = "../html/admin.html") {
  // Remove old header if exists
  document.getElementById('gpProgressHeader')?.remove();

  const header = document.createElement('header');
  header.id = 'gpProgressHeader';
  header.style = `
    position: sticky;
    top: 0;
    z-index: 9999;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 24px;
    background: rgba(26, 28, 36, 0.97);
    backdrop-filter: blur(16px) saturate(180%);
    border-bottom: 1px solid rgba(255,255,255,0.12);
  `;

  // Back button
  const backBtn = document.createElement('a');
  backBtn.href = dashboardUrl;
  backBtn.textContent = '← Dashboard';
  backBtn.style.cssText = `
    color: #1e90ff;
    font-weight: 700;
    font-size: 1.1rem;
    text-decoration: none;
    padding: 8px 18px;
    border-radius: 12px;
  `;

  // Lead ID display
  const leadIdDisplay = document.createElement('div');
  leadIdDisplay.textContent = guestKey ? `Lead ID: ${guestKey}` : "No Lead Loaded";
  leadIdDisplay.style = 'color: #82caff; font-weight: 700; font-size: 1.1rem;';

  // New Lead button
  const newLeadBtn = document.createElement('button');
  newLeadBtn.textContent = '+ New Lead';
  newLeadBtn.style = `
    background: #00c853;
    color: white;
    border: none;
    border-radius: 12px;
    padding: 8px 16px;
    font-weight: 700;
    cursor: pointer;
  `;
  newLeadBtn.onclick = onNewLeadClick;

  header.appendChild(backBtn);
  header.appendChild(leadIdDisplay);
  header.appendChild(newLeadBtn);

  document.body.prepend(header);

  // Return elements needed for dynamic updates
  return { leadIdDisplay };
}

export function renderProgressBar() {
  const container = document.createElement('div');
  container.id = 'progressBarContainer';
  container.style = `
    width: 100%;
    max-width: 440px;
    margin: 12px auto;
    position: relative;
  `;

  const progress = document.createElement('progress');
  progress.id = 'progressBar';
  progress.max = 100;
  progress.value = 0;
  progress.style = `
    width: 100%;
    height: 24px;
    border-radius: 12px;
    appearance: none;
    background: rgba(255, 255, 255, 0.13);
    box-shadow: inset 0 1px 4px rgba(0, 0, 0, 0.2);
  `;

  const percentText = document.createElement('div');
  percentText.id = 'progressText';
  percentText.textContent = '0%';
  percentText.style = `
    position: absolute;
    top: 50%;
    right: 16px;
    transform: translateY(-50%);
    color: #82caff;
    font-weight: 700;
    font-size: 1.1rem;
  `;

  container.appendChild(progress);
  container.appendChild(percentText);

  return container;
}

export function renderStepContainers() {
  const container = document.createElement('div');
  container.id = 'stepsContainer';
  container.style = `
    display: flex;
    gap: 24px;
    justify-content: center;
    flex-wrap: wrap;
    margin: 32px auto;
    max-width: 1080px;
  `;

  // Step 1 container
  const step1 = document.createElement('section');
  step1.id = 'step1Form';
  step1.style = `
    flex: 1 1 280px;
    background: #252733;
    border-radius: 16px;
    padding: 24px;
    color: white;
  `;
  step1.innerHTML = `
    <h2>Step 1: Customer Info</h2>
    <!-- inputs will be rendered by event handlers -->
  `;

  // Step 2 container
  const step2 = document.createElement('section');
  step2.id = 'step2Form';
  step2.style = `
    flex: 2 1 560px;
    background: #22273c;
    border-radius: 16px;
    padding: 24px;
    color: white;
    overflow-y: auto;
  `;
  step2.innerHTML = `
    <h2>Step 2: Evaluate Needs</h2>
    <div id="step2Fields"></div>
  `;

  // Step 3 container
  const step3 = document.createElement('section');
  step3.id = 'step3Form';
  step3.style = `
    flex: 1 1 280px;
    background: #252733;
    border-radius: 16px;
    padding: 24px;
    color: white;
  `;
  step3.innerHTML = `
    <h2>Step 3: Proposed Solution</h2>
    <textarea id="solutionText" rows="8" placeholder="What we’ll offer…"></textarea>
  `;

  container.appendChild(step1);
  container.appendChild(step2);
  container.appendChild(step3);

  return container;
}

// Update progress bar helper
export function updateProgressBar(pct) {
  const progress = document.getElementById('progressBar');
  const text = document.getElementById('progressText');
  if (!progress || !text) return;
  const clamped = Math.min(100, Math.max(0, Math.round(pct)));
  progress.value = clamped;
  text.textContent = clamped + '%';
}