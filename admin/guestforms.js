window.renderGuestFormsSection = function() {
/* ========================================================================
   Guest Forms Section
   ===================================================================== */
function renderGuestFormsSection() {
  return `
    <section class="admin-section guestforms-section">
      <h2>Guest Forms</h2>
      <div class="guestforms-container">
        <button class="btn btn-primary" onclick="window.location.href='employee/guest-portal.html'">
          Go to Guest Portal
        </button>
      </div>
    </section>`;
}
};