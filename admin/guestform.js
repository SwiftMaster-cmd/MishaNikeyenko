(() => {
  // Initialize Firebase Database ref (assumes firebase is already initialized)
  const db = window.db;

  async function submitGuestForm(event) {
    event.preventDefault();

    const form = event.target;
    const guestName = form.guestName.value.trim();
    const guestPhone = form.guestPhone.value.trim();
    const agree = form.agreeTerms.checked;

    if (!guestName || !guestPhone || !agree) {
      alert("Please fill out all fields and agree to the terms.");
      return;
    }

    const entry = {
      guestName,
      guestPhone,
      timestamp: Date.now(),
      // Optionally add userUid or other metadata if logged-in user info is accessible
    };

    try {
      await db.ref("guestEntries").push(entry);
      alert("Submitted successfully.");
      form.reset();
    } catch (err) {
      alert("Error submitting: " + err.message);
    }
  }

  // Attach submit handler when DOM loaded
  document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("guestForm");
    if (form) form.addEventListener("submit", submitGuestForm);
  });

  window.guestform = {
    submitGuestForm
  };
})();