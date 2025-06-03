import { signOut } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js";

export function setupLogoutButton(auth, button) {
  button.onclick = () => signOut(auth).then(() => window.location.href = "index.html");
}