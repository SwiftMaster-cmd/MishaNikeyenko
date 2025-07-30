// --- Firebase Config ---
const firebaseConfig = {
  apiKey: "AIzaSyD9fILTNJQ0wsPftUsPkdLrhRGV9dslMzE",
  authDomain: "osls-644fd.firebaseapp.com",
  databaseURL: "https://osls-644fd-default-rtdb.firebaseio.com",
  projectId: "osls-644fd",
  storageBucket: "osls-644fd.appspot.com",
  messagingSenderId: "798578046321",
  appId: "1:798578046321:web:8758776701786a2fccf2d0"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// --- Form Submission ---
const form = document.getElementById("guestForm");
form.onsubmit = async e => {
  e.preventDefault();

  const guestName = document.getElementById("guestName").value.trim();
  const guestPhone = document.getElementById("guestPhone").value.trim();
  const agree = document.getElementById("agreeTerms").checked;

  if (!guestName || !guestPhone || !agree) {
    alert("Please fill out all fields and agree to the terms.");
    return;
  }

  const entry = {
    guestName,
    guestPhone,
    timestamp: Date.now()
  };

  try {
    await db.ref("guestEntries").push(entry);
    alert("Submitted successfully.");
    form.reset();
  } catch (err) {
    alert("Error submitting: " + err.message);
  }
};