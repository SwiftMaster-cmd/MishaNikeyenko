let isRegister = false;

function toggleForm() {
  isRegister = !isRegister;

  document.getElementById('form-title').textContent = isRegister ? 'Register' : 'Login';
  document.getElementById('email').style.display = isRegister ? 'block' : 'none';
  document.querySelector('button').textContent = isRegister ? 'Register' : 'Log In';

  document.getElementById('toggle-form').innerHTML = isRegister
    ? 'Already have an account? <a href="#" onclick="toggleForm()">Login</a>'
    : 'Need an account? <a href="#" onclick="toggleForm()">Register</a>';
}

document.getElementById('auth-form').addEventListener('submit', function (e) {
  e.preventDefault();

  const user = document.getElementById('username').value;
  const pass = document.getElementById('password').value;
  const email = document.getElementById('email').value;

  if (isRegister) {
    document.getElementById('output').textContent = `✅ Registered: ${user}, ${email}`;
  } else {
    document.getElementById('output').textContent = `🔐 Logged in as: ${user}`;
  }
});