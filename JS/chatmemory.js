<!-- Add Firebase SDKs somewhere in your HTML before this script -->
<script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js"></script>

<script>
// Firebase config
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
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// Sign in anonymously
firebase.auth().onAuthStateChanged(async (user) => {
  if (!user) await firebase.auth().signInAnonymously();
});

// DOM elements
const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const log = document.getElementById("chat-log");

// Submit handler
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt) return;

  const user = firebase.auth().currentUser;
  const uid = user?.uid;
  if (!uid) return;

  const userLine = document.createElement("div");
  userLine.textContent = `🧑 You: ${prompt}`;
  log.appendChild(userLine);

  const gptLine = document.createElement("div");
  gptLine.textContent = `🤖 GPT: ...thinking...`;
  log.appendChild(gptLine);
  input.value = "";

  try {
    // Save user message to memory
    const ref = db.ref(`chatHistory/${uid}`).push();
    await ref.set({ role: "user", content: prompt });

    // Call Netlify function
    const res = await fetch("/.netlify/functions/chatgpt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, uid })
    });

    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content?.trim();

    gptLine.textContent = reply
      ? `🤖 GPT: ${reply}`
      : `🤖 GPT: No response received.`;

    // Save assistant reply to memory
    if (reply) {
      await db.ref(`chatHistory/${uid}`).push().set({
        role: "assistant",
        content: reply
      });
    }

  } catch (err) {
    gptLine.textContent = `❌ Error: ${err.message}`;
  }
});
</script>