// main.js

import { staticQuestions } from './gp-questions.js';
import { initApp } from './gp-app.js';
import './gp-core.js';          // imports for side effects or utilities
import './gp-firebase.js';
import './save-handler.js';
import './gp-ui-render.js';
import './progress-bar.js';
import './step-ui.js';
import './ui-app.js';

document.addEventListener('DOMContentLoaded', () => {
  initApp(staticQuestions);
});