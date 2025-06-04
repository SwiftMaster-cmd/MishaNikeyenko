// calculator.js -- drop this in alongside your HTML/CSS
// Requires:
//   <input class="calculator-screen" readonly>
//   <div class="calculator-keys">
//     <button value="7">7</button> …
//     <button value="+"   class="operator">+</button>
//     <button value="="   class="operator">=</button>
//     <button value="."   class="decimal">.</button>
//     <button             class="all-clear">AC</button>
//   </div>

(() => {
  const calculator = {
    displayValue: '0',
    firstOperand: null,
    waitingForSecondOperand: false,
    operator: null
  };

  function inputDigit(digit) {
    if (calculator.waitingForSecondOperand) {
      calculator.displayValue = digit;
      calculator.waitingForSecondOperand = false;
    } else {
      calculator.displayValue =
        calculator.displayValue === '0' ? digit : calculator.displayValue + digit;
    }
  }

  function inputDecimal() {
    if (calculator.waitingForSecondOperand) {
      calculator.displayValue = '0.';
      calculator.waitingForSecondOperand = false;
      return;
    }
    if (!calculator.displayValue.includes('.')) {
      calculator.displayValue += '.';
    }
  }

  const performCalculation = {
    '/': (a, b) => a / b,
    '*': (a, b) => a * b,
    '+': (a, b) => a + b,
    '-': (a, b) => a - b,
    '=': (_a, b) => b
  };

  function handleOperator(nextOperator) {
    const inputValue = parseFloat(calculator.displayValue);

    if (calculator.operator && calculator.waitingForSecondOperand) {
      calculator.operator = nextOperator;
      return;
    }

    if (calculator.firstOperand == null && !isNaN(inputValue)) {
      calculator.firstOperand = inputValue;
    } else if (calculator.operator) {
      const result = performCalculation[calculator.operator](
        calculator.firstOperand,
        inputValue
      );
      calculator.displayValue = String(result);
      calculator.firstOperand = result;
    }

    calculator.waitingForSecondOperand = true;
    calculator.operator = nextOperator;
  }

  function resetCalculator() {
    calculator.displayValue = '0';
    calculator.firstOperand = null;
    calculator.waitingForSecondOperand = false;
    calculator.operator = null;
  }

  function updateDisplay() {
    const display = document.querySelector('.calculator-screen');
    if (display) display.value = calculator.displayValue;
  }

  // Initialize display
  updateDisplay();

  // Delegate button clicks
  const keys = document.querySelector('.calculator-keys');
  if (!keys) {
    console.warn('Missing .calculator-keys container.');
    return;
  }

  keys.addEventListener('click', (e) => {
    const target = e.target;
    if (!target.matches('button')) return;

    if (target.classList.contains('operator')) {
      handleOperator(target.value);
    } else if (target.classList.contains('decimal')) {
      inputDecimal();
    } else if (target.classList.contains('all-clear')) {
      resetCalculator();
    } else {
      inputDigit(target.value);
    }
    updateDisplay();
  });
})();