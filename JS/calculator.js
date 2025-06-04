// calculator.js – calculator + user-specific Firebase history

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getDatabase, ref, push, onChildAdded, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

// Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyCf_se10RUg8i_u8pdowHlQvrFViJ4jh_Q",
  authDomain: "mishanikeyenko.firebaseapp.com",
  databaseURL: "https://mishanikeyenko-default-rtdb.firebaseio.com",
  projectId: "mishanikeyenko",
  storageBucket: "mishanikeyenko.firebasestorage.app",
  messagingSenderId: "1089190937368",
  appId: "1:1089190937368:web:959c825fc596a5e3ae946d",
  measurementId: "G-L6CC27129C"
};

// Init Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// UI Refs
const display = document.querySelector('.calculator-screen');
const keys    = document.querySelector('.calculator-keys');
const list    = document.getElementById('calc-history');

// State
const calc = {
  displayValue: '0',
  firstOperand: null,
  waitingForSecondOperand: false,
  operator: null
};

function updateDisplay () {
  display.value = calc.displayValue;
}
updateDisplay();

function inputDigit(d) {
  calc.displayValue = calc.waitingForSecondOperand
    ? (calc.waitingForSecondOperand = false, d)
    : (calc.displayValue === '0' ? d : calc.displayValue + d);
}

function inputDecimal() {
  if (calc.waitingForSecondOperand) {
    calc.displayValue = '0.';
    calc.waitingForSecondOperand = false;
    return;
  }
  if (!calc.displayValue.includes('.')) calc.displayValue += '.';
}

const perform = {
  '/': (a, b) => a / b,
  '*': (a, b) => a * b,
  '+': (a, b) => a + b,
  '-': (a, b) => a - b,
  '=': (_a, b) => b
};

function handleOperator(op) {
  const val = parseFloat(calc.displayValue);
  if (calc.operator && calc.waitingForSecondOperand) {
    calc.operator = op;
    return;
  }

  if (calc.firstOperand == null && !Number.isNaN(val)) {
    calc.firstOperand = val;
  } else if (calc.operator) {
    const result = perform[calc.operator](calc.firstOperand, val);
    pushHistory(calc.firstOperand, calc.operator, val, result);
    calc.displayValue = String(result);
    calc.firstOperand = result;
  }

  calc.waitingForSecondOperand = true;
  calc.operator = op;
}

function resetCalc() {
  Object.assign(calc, {
    displayValue: '0',
    firstOperand: null,
    waitingForSecondOperand: false,
    operator: null
  });
}

// Store entry in Firebase
function pushHistory(a, op, b, res) {
  const user = auth.currentUser;
  if (!user) return;

  const userRef = ref(db, `calcHistory/${user.uid}`);
  push(userRef, {
    equation: `${a} ${op} ${b} = ${res}`,
    result: res,
    ts: serverTimestamp()
  }).then(() => {
    console.debug('[Calc] pushed →', { a, op, b, res });
  }).catch(err => {
    console.error('[Calc] push failed:', err);
  });
}

// Watch Firebase for updates
onAuthStateChanged(auth, (user) => {
  if (!user) {
    console.warn('[Calc] No user signed in');
    return;
  }

  const userRef = ref(db, `calcHistory/${user.uid}`);
  onChildAdded(userRef, snap => {
    const { equation } = snap.val();
    const li = document.createElement('li');
    li.textContent = equation;
    list?.prepend(li);
  });
});

// Handle calculator button events
keys.addEventListener('click', e => {
  const btn = e.target;
  if (!btn.matches('button')) return;

  if (btn.classList.contains('operator')) {
    handleOperator(btn.value);
  } else if (btn.classList.contains('decimal')) {
    inputDecimal();
  } else if (btn.classList.contains('all-clear')) {
    resetCalc();
  } else {
    inputDigit(btn.value);
  }

  updateDisplay();
});