// Firebase config (assumes you already loaded Firebase scripts in HTML)
const firebaseConfig = {
  apiKey: "AIzaSyCf_se10RUg8i_u8pdowHlQvrFViJ4jh_Q",
  authDomain: "mishanikeyenko.firebaseapp.com",
  databaseURL: "https://mishanikeyenko-default-rtdb.firebaseio.com",
  projectId: "mishanikeyenko",
  storageBucket: "mishanikeyenko.firebasestorage.app",
  messagingSenderId: "1089190937368",
  appId: "1:1089190937368:web:959c825fc596a5e3ae946d"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const auth = firebase.auth();

// 🔐 Optional: force anonymous sign-in
auth.onAuthStateChanged(user => {
  if (!user) auth.signInAnonymously();
});

// ➕ Add customer logic
function addCustomer() {
  const user = auth.currentUser;
  if (!user) return alert("You're not logged in.");

  const fullName = document.getElementById("fullName").value.trim();
  const phone = document.getElementById("phoneInput").value.trim();
  const carrier = document.getElementById("carrier").value.trim();
  const lineCount = document.getElementById("lineCount").value.trim();
  const monthlyCost = document.getElementById("monthlyCost").value.trim();
  const openToSwitch = document.getElementById("openToSwitch").value;

  if (!fullName || !phone) {
    alert("Full name and phone number are required.");
    return;
  }

  const data = {
    fullName,
    phone,
    carrier,
    lineCount,
    monthlyCost,
    openToSwitch,
    timestamp: Date.now()
  };

  const path = `notes/${user.uid}`;
  db.ref(path).push(data).then(() => {
    alert("Customer added.");
    clearFields();
    fetchAndDisplayCustomers();
  }).catch(err => {
    console.error("Error adding:", err);
    alert("Failed to add. Try again.");
  });
}

function clearFields() {
  ["fullName", "phoneInput", "carrier", "lineCount", "monthlyCost"].forEach(id => {
    document.getElementById(id).value = "";
  });
}

// 🧾 Display all customers
function fetchAndDisplayCustomers() {
  const user = auth.currentUser;
  if (!user) return;

  const path = `notes/${user.uid}`;
  db.ref(path).once("value", snapshot => {
    const list = document.getElementById("customerList");
    list.innerHTML = "";

    const data = snapshot.val();
    if (!data) return;

    Object.entries(data).forEach(([key, entry]) => {
      const li = document.createElement("li");
      li.innerHTML = `
        <strong>${entry.fullName}</strong> (${entry.phone})<br>
        ${entry.carrier || "Unknown"} – ${entry.lineCount || "?"} lines @ $${entry.monthlyCost || "?"}/mo<br>
        Open to switch: ${entry.openToSwitch || "?"}
      `;
      list.appendChild(li);
    });
  });
}

// Initial fetch once user is authenticated
auth.onAuthStateChanged(user => {
  if (user) fetchAndDisplayCustomers();
});