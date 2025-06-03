// Universal, reusable frontend authentication demo logic

let authMode = 'login';

const authTitle = document.getElementById('auth-title');
const authEmail = document.getElementById('auth-email');
const authSubmit = document.getElementById('auth-submit');
const authToggle = document.getElementById('auth-toggle');
const authToggleLink = document.getElementById('auth-toggle-link');
const authMessage = document.getElementById('auth-message');
const authForm = document.getElementById('auth-form');

function setMode(mode) {
  authMode = mode;
  if (mode === 'register') {
    authTitle.textContent = "Register";
    authEmail.classList.remove('hidden');
    authSubmit.textContent = "Register";
    authToggle.innerHTML = 'Already have an account? <a href="#" id="auth-toggle-link">Login</a>';
  } else {
    authTitle.textContent = "Login";
    authEmail.classList.add('hidden');
    authSubmit.textContent = "Login";
    authToggle.innerHTML = 'Need an account? <a href="#" id="auth-toggle-link">Register</a>';
  }
  // Re-attach event handler after innerHTML change
  document.getElementById('auth-toggle-link').onclick = (e) => {
    e.preventDefault();
    setMode(mode === 'login' ? 'register' : 'login');
    clearMessage();
  };
}

function clearMessage() {
  authMessage.textContent = "";
  authMessage.className = "";
}

function showMessage(msg, isError = false) {
  authMessage.textContent = msg;
  authMessage.className = isError ? "error" : "success";
}

authForm.onsubmit = function(e) {
  e.preventDefault();
  const username = document.getElementById('auth-username').value.trim();
  const password = document.getElementById('auth-password').value;
  const email = document.getElementById('auth-email').value.trim();

  if (authMode === 'register') {
    if (!username || !password || !email) {
      showMessage("Fill in all fields.", true);
      return;
    }
    if (localStorage.getItem('user_' + username)) {
      showMessage("Username already exists.", true);
      return;
    }
    localStorage.setItem('user_' + username, JSON.stringify({ username, password, email }));
    showMessage("Registration successful! Please login.");
    setMode('login');
  } else {
    if (!username || !password) {
      showMessage("Enter username and password.", true);
      return;
    }
    const user = localStorage.getItem('user_' + username);
    if (!user) {
      showMessage("User not found.", true);
      return;
    }
    const userData = JSON.parse(user);
    if (userData.password === password) {
      showMessage(`Welcome, ${userData.username}! Login successful.`);
    } else {
      showMessage("Incorrect password.", true);
    }
  }
};

authToggleLink.onclick = (e) => {
  e.preventDefault();
  setMode(authMode === 'login' ? 'register' : 'login');
  clearMessage();
};