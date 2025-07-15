// ✅ Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyCf_se10RUg8i_u8pdowHlQvrFViJ4jh_Q",
  authDomain: "mishanikeyenko.firebaseapp.com",
  databaseURL: "https://mishanikeyenko-default-rtdb.firebaseio.com",
  projectId: "mishanikeyenko",
  storageBucket: "mishanikeyenko.firebasestorage.app",
  messagingSenderId: "1089190937368",
  appId: "1:1089190937368:web:959c825fc596a5e3ae946d"
};

// ✅ Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const auth = firebase.auth();

// ✅ Show connection + auth status
auth.onAuthStateChanged(user => {
  const status = document.getElementById("status");
  if (user) {
    status.textContent = "✅ Firebase connected. UID: " + user.uid;
    fetchAndDisplayCustomers();
  } else {
    status.textContent = "⏳ Not signed in.";
    auth.signInAnonymously().catch(err => {
      console.error("Auth error:", err);
      status.textContent = "❌ Auth failed";
    });
  }
});

// ➕ Add customer
function addCustomer() {
  const user = auth.currentUser;
  if (!user) return alert("Not authenticated.");

  const data = getFormData();
  if (!data) return;

  const refPath = `notes/${user.uid}`;
  firebase.database().ref(refPath).push(data)
    .then(() => {
      alert("Customer added.");
      clearForm();
      fetchAndDisplayCustomers();
    })
    .catch(err => {
      console.error("Add error:", err);
      alert("Failed to add.");
    });
}

// 📝 Edit customer + save to history
function editCustomer(entryId, updatedContent) {
  const user = auth.currentUser;
  if (!user) return;

  const refPath = `notes/${user.uid}/${entryId}`;
  const noteRef = firebase.database().ref(refPath);

  noteRef.once("value").then(snapshot => {
    const oldData = snapshot.val();
    if (!oldData) return alert("Entry not found.");

    const historyEntry = {
      ...oldData,
      timestamp: Date.now(),
      type: "edit"
    };

    const updates = {
      ...oldData,
      content: updatedContent,
      lastEdited: Date.now()
    };

    const historyRef = firebase.database().ref(`${refPath}/history`);
    historyRef.push(historyEntry).then(() => {
      noteRef.set(updates).then(() => {
        alert("Customer updated.");
        fetchAndDisplayCustomers();
      });
    });
  });
}

// 🗑️ Delete customer + log to history
function deleteCustomer(entryId) {
  const user = auth.currentUser;
  if (!user) return;

  const refPath = `notes/${user.uid}/${entryId}`;
  const noteRef = firebase.database().ref(refPath);

  noteRef.once("value").then(snapshot => {
    const existing = snapshot.val();
    if (!existing) return alert("Entry not found.");

    const historyRef = firebase.database().ref(`${refPath}/history`);
    const deleteLog = {
      ...existing,
      timestamp: Date.now(),
      type: "delete"
    };

    historyRef.push(deleteLog).then(() => {
      noteRef.remove().then(() => {
        alert("Deleted.");
        fetchAndDisplayCustomers();
      });
    });
  });
}

// 📄 Fetch and display all entries
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
        Open to switch: ${entry.openToSwitch || "?"}
        <br>
        <button onclick="deleteCustomer('${id}')">🗑️ Delete</button>
      `;
      list.appendChild(li);
    });
  });
}

// 🧰 Helpers
function getFormData() {
  const fullName = document.getElementById("fullName").value.trim();
  const phone = document.getElementById("phoneInput").value.trim();
  const carrier = document.getElementById("carrier").value.trim();
  const lineCount = document.getElementById("lineCount").value.trim();
  const monthlyCost = document.getElementById("monthlyCost").value.trim();
  const openToSwitch = document.getElementById("openToSwitch").value;

  if (!fullName || !phone) {
    alert("Full name and phone required.");
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