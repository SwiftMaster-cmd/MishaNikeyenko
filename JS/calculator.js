/* calculator.js – full module: calculator + Firebase history  */
import { firebaseConfig }    from './firebase-config.js';
import {
  initializeApp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getDatabase, ref, push, onChildAdded, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';

/* ---------- Firebase bootstrap ---------- */
const app       = initializeApp(firebaseConfig);
const db        = getDatabase(app);
const historyRef = ref(db, 'calcHistory');   // /calcHistory in RTDB

/* ---------- Calculator state ---------- */
const calc = {
  displayValue: '0',
  firstOperand: null,
  waitingForSecondOperand: false,
  operator: null
};

function inputDigit(digit) {
  if (calc.waitingForSecondOperand) {
    calc.displayValue = digit;
    calc.waitingForSecondOperand = false;
  } else {
    calc.displayValue =
      calc.displayValue === '0' ? digit : calc.displayValue + digit;
  }
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

function handleOperator(nextOp) {
  const inputVal = parseFloat(calc.displayValue);

  if (calc.operator && calc.waitingForSecondOperand) {  // change op mid-entry
    calc.operator = nextOp;
    return;
  }

  if (calc.firstOperand == null && !isNaN(inputVal)) {
    calc.firstOperand = inputVal;
  } else if (calc.operator) {
    const result = perform[calc.operator](calc.firstOperand, inputVal);
    logToFirebase(calc.firstOperand, calc.operator, inputVal, result); // <= NEW
    calc.displayValue = String(result);
    calc.firstOperand = result;
  }

  calc.waitingForSecondOperand = true;
  calc.operator = nextOp;
}

function resetCalc() {
  calc.displayValue = '0';
  calc.firstOperand = null;
  calc.waitingForSecondOperand = false;
  calc.operator = null;
}

/* ---------- Firebase write ---------- */
function logToFirebase(a, op, b, result) {
  push(historyRef, {
    equation: `${a} ${op} ${b} = ${result}`,
    result,
    ts: serverTimestamp()
  }).catch(console.error);
}

/* ---------- DOM hooks ---------- */
const display = document.querySelector('.calculator-screen');
const keys    = document.querySelector('.calculator-keys');
const list    = document.getElementById('calc-history');

function updateDisplay() {
  if (display) display.value = calc.displayValue;
}
updateDisplay();

/* stream history */
onChildAdded(historyRef, snap => {
  if (!list) return;
  const { equation } = snap.val();
  const li = document.createElement('li');
  li.textContent = equation;
  list.prepend(li);                      // newest on top
});

/* key-delegation */
keys?.addEventListener('click', e => {
  const t = e.target;
  if (!t.matches('button')) return;

  if (t.classList.contains('operator'))   handleOperator(t.value);
  else if (t.classList.contains('decimal')) inputDecimal();
  else if (t.classList.contains('all-clear')) resetCalc();
  else                                      inputDigit(t.value);

  updateDisplay();
});