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

auth.onAuthStateChanged(user => {
  const status = document.getElementById("status");
  if (user) {
    status.textContent = "✅ Connected -- UID: " + user.uid;
    fetchAndDisplayCustomers();
  } else {
    status.textContent = "⏳ Signing in...";
    auth.signInAnonymously().catch(err => {
      console.error("Auth failed:", err);
      status.textContent = "❌ Auth failed";
    });
  }
});

function addCustomer() {
  const user = auth.currentUser;
  if (!user) return alert("You're not logged in.");

  const data = getFormData();
  if (!data) return;

  const path = `notes/${user.uid}`;
  firebase.database().ref(path).push(data)
    .then(() => {
      alert("Customer added.");
      clearForm();
      fetchAndDisplayCustomers();
    })
    .catch(err => {
      console.error("Add error:", err);
      alert("Error adding.");
    });
}

function deleteCustomer(noteId) {
  const user = auth.currentUser;
  if (!user) return;

  const refPath = `notes/${user.uid}/${noteId}`;
  const noteRef = firebase.database().ref(refPath);

  noteRef.once("value").then(snap => {
    const existing = snap.val();
    if (!existing) return alert("Note not found.");

    const historyRef = firebase.database().ref(`${refPath}/history`);
    historyRef.push({ ...existing, timestamp: Date.now(), type: "delete" })
      .then(() => noteRef.remove())
      .then(() => {
        alert("Deleted.");
        fetchAndDisplayCustomers();
      });
  });
}

function fetchAndDisplayCustomers() {
  const user = auth.currentUser;
  if (!user) return;

  const path = `notes/${user.uid}`;
  const list = document.getElementById("customerList");
  list.innerHTML = "Loading...";

  firebase.database().ref(path).once("value").then(snapshot => {
    const data = snapshot.val();
    list.innerHTML = "";

    if (!data) return;

    Object.entries(data).forEach(([id, entry]) => {
      const li = document.createElement("li");
      li.innerHTML = `
        <strong>${entry.fullName}</strong> (${entry.phone})<br>
        ${entry.carrier || "?"} – ${entry.lineCount || "?"} lines @ $${entry.monthlyCost || "?"}/mo<br>
        Open to switch: ${entry.openToSwitch || "?"}<br>
        <button onclick="deleteCustomer('${id}')">🗑️ Delete</button>
      `;
      list.appendChild(li);
    });
  });
}

function getFormData() {
  const fullName = document.getElementById("fullName").value.trim();
  const phone = document.getElementById("phoneInput").value.trim();
  const carrier = document.getElementById("carrier").value.trim();
  const lineCount = document.getElementById("lineCount").value.trim();
  const monthlyCost = document.getElementById("monthlyCost").value.trim();
  const openToSwitch = document.getElementById("openToSwitch").value;

  if (!fullName || !phone) {
    alert("Name and phone number are required.");
    return null;
  }

  return {
    fullName, phone, carrier, lineCount, monthlyCost, openToSwitch,
    timestamp: Date.now()
  };
}

function clearForm() {
  ["fullName", "phoneInput", "carrier", "lineCount", "monthlyCost"].forEach(id => {
    document.getElementById(id).value = "";
  });
}