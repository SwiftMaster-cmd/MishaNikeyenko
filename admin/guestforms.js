// ==============================
// Guest Form Submission Handler
// ==============================

firebase.initializeApp(firebaseConfig);
const db   = firebase.database();
const auth = firebase.auth();

auth.onAuthStateChanged(async user => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  const form = document.getElementById("guestForm");
  form.addEventListener("submit", async e => {
    e.preventDefault();

    const data = {
      userUid: user.uid,
      custName: document.getElementById("custName").value.trim(),
      custPhone: document.getElementById("custPhone").value.trim(),
      serviceType: document.getElementById("serviceType").value,
      situation: document.getElementById("situation").value.trim(),
      submittedAt: Date.now()
    };

    try {
      await db.ref("guestinfo").push(data);
      alert("Submitted successfully!");
      form.reset();
    } catch (err) {
      alert("Error submitting form. Try again.");
      console.error(err);
    }
  });
});